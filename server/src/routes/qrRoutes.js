import express from 'express';
import path from 'path';
import multer from 'multer';
import QRCodeImage from 'qrcode';
import { requireAuth } from '../middleware/auth.js';
import { qrUpload, handleUploadErrors } from '../middleware/upload.js';
import { QRCode } from '../models/QRCode.js';
import { Upload } from '../models/Upload.js';
import { Collection } from '../models/Collection.js';
import { RecycleBin } from '../models/RecycleBin.js';
import { pickDesignFields } from '../models/designSchema.js';
import { createVaultToken } from '../utils/tokens.js';
import { getFileCategory } from '../utils/fileTypes.js';
import { logActivity } from '../utils/activity.js';
import { removeUploadFile, uploadRoot } from '../utils/storage.js';
import { env } from '../config/env.js';
import { asyncRouter } from '../utils/asyncRouter.js';
import { buildUploadDoc, moveQrToRecycle, recalculateQrSize } from '../services/qrLifecycle.js';

const router = asyncRouter(express.Router());

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `qrlogo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only image files can be used as a QR logo.'), ok);
  }
});

function handleLogoUploadError(err, req, res, next) {
  if (!err) return next();
  res.status(400).json({ message: err.message || 'Logo upload failed.' });
}

const frameImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `qrframe-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only image files can be used as a custom frame.'), ok);
  }
});

function handleFrameImageUploadError(err, req, res, next) {
  if (!err) return next();
  res.status(400).json({ message: err.message || 'Frame image upload failed.' });
}

function vaultUrl(token) {
  return `${env.publicBaseUrl.replace(/\/$/, '')}/q/${token}`;
}

function mapQr(qr) {
  return {
    ...qr,
    collectionId: qr.collection?._id || qr.collection || null,
    collectionName: qr.collection?.name || null,
    collectionDesign: qr.collection?.design || null,
    vaultUrl: vaultUrl(qr.token)
  };
}

function filenameTitle(fileName) {
  const baseName = String(fileName || '').replace(/\\/g, '/').split('/').pop();
  return path.parse(baseName).name.trim();
}

function matchKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function createUniqueToken() {
  for (let i = 0; i < 5; i += 1) {
    const token = createVaultToken();
    const exists = await QRCode.exists({ token });
    if (!exists) return token;
  }
  throw new Error('Unable to generate unique QR token.');
}

router.get('/', requireAuth, async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 50);
  const search = String(req.query.search || '').trim();
  const filter = String(req.query.filter || 'new');
  const collectionId = req.query.collectionId || null;
  const query = { status: { $ne: 'deleted' } };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { token: { $regex: search, $options: 'i' } }
    ];
  }

  if (collectionId) {
    query.collection = collectionId;
  }

  const sorts = {
    active: { status: 1, createdAt: -1 },
    new: { createdAt: -1 },
    old: { createdAt: 1 },
    az: { name: 1 },
    za: { name: -1 },
    edited: { updatedAt: -1 }
  };

  const [items, total] = await Promise.all([
    QRCode.find(query)
      .populate('collection', 'name design')
      .sort(sorts[filter] || sorts.new)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    QRCode.countDocuments(query)
  ]);

  res.json({ items: items.map(mapQr), total, page, pages: Math.ceil(total / limit) });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, description, collectionId } = req.body;
  if (!name) return res.status(400).json({ message: 'QR name is required.' });
  if (collectionId) {
    const collection = await Collection.findOne({ _id: collectionId, status: { $ne: 'deleted' } }).lean();
    if (!collection) return res.status(404).json({ message: 'Collection not found.' });
  }

  const qr = await QRCode.create({
    name,
    description,
    token: await createUniqueToken(),
    collection: collectionId || null
  });

  await logActivity('QR_CREATED', qr._id, `QR created: ${qr.name}`);
  res.status(201).json(mapQr(qr.toObject()));
});

// Bulk create from folder uploads (multipart with multiple files under folder structure)
router.post('/bulk-folder', requireAuth, qrUpload.any(), handleUploadErrors, async (req, res) => {
  const { collectionId } = req.body;
  const files = req.files || [];

  if (!files.length) return res.status(400).json({ message: 'No files uploaded.' });
  if (collectionId) {
    const collection = await Collection.findOne({ _id: collectionId, status: { $ne: 'deleted' } }).lean();
    if (!collection) {
      await Promise.all(files.map((file) => removeUploadFile(file.path).catch(() => {})));
      return res.status(404).json({ message: 'Collection not found.' });
    }
  }

  // Group files by their folder (fieldname is used as folder name)
  const folders = {};
  for (const file of files) {
    const folder = file.fieldname || 'Unnamed';
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push(file);
  }

  const created = [];
  const errors = [];

  for (const [folderName, folderFiles] of Object.entries(folders)) {
    try {
      const qr = await QRCode.create({
        name: folderName,
        description: '',
        token: await createUniqueToken(),
        collection: collectionId || null
      });

      const uploadDocs = folderFiles.map((file, index) => ({
        ...buildUploadDoc(file, qr._id, index)
      }));

      await Upload.insertMany(uploadDocs);
      await recalculateQrSize(qr._id);
      await logActivity('QR_CREATED', qr._id, `QR created from folder: ${folderName}`);
      created.push(mapQr(qr.toObject()));
    } catch (err) {
      errors.push({ folder: folderName, error: err.message });
    }
  }

  res.status(201).json({ count: created.length, items: created, errors });
});

// Bulk Create 2, step 1: each primary file creates one QR and is attached to it.
router.post('/bulk-create-2/primary', requireAuth, qrUpload.array('files', 500), handleUploadErrors, async (req, res) => {
  const { collectionId } = req.body;
  const files = req.files || [];

  if (!files.length) return res.status(400).json({ message: 'No primary files uploaded.' });
  if (collectionId) {
    const collection = await Collection.findOne({ _id: collectionId, status: { $ne: 'deleted' } }).lean();
    if (!collection) {
      await Promise.all(files.map((file) => removeUploadFile(file.path).catch(() => {})));
      return res.status(404).json({ message: 'Collection not found.' });
    }
  }

  const seenTitles = new Set();
  const duplicateTitles = new Set();
  for (const file of files) {
    const title = filenameTitle(file.originalname);
    const key = matchKey(title);
    if (!title) {
      await Promise.all(files.map((uploadedFile) => removeUploadFile(uploadedFile.path).catch(() => {})));
      return res.status(400).json({ message: 'Every primary file must have a filename.' });
    }
    if (seenTitles.has(key)) duplicateTitles.add(title);
    seenTitles.add(key);
  }

  if (duplicateTitles.size) {
    await Promise.all(files.map((file) => removeUploadFile(file.path).catch(() => {})));
    return res.status(400).json({
      message: 'Primary filenames must be unique when file extensions are ignored.',
      duplicates: Array.from(duplicateTitles)
    });
  }

  const created = [];
  const errors = [];

  for (const file of files) {
    const title = filenameTitle(file.originalname);
    try {
      const qr = await QRCode.create({
        name: title,
        description: '',
        token: await createUniqueToken(),
        collection: collectionId || null
      });

      await Upload.create(buildUploadDoc(file, qr._id, 0));

      await recalculateQrSize(qr._id);
      await logActivity('QR_CREATED', qr._id, `QR created from primary file: ${title}`);
      created.push(mapQr(qr.toObject()));
    } catch (err) {
      await removeUploadFile(file.path).catch(() => {});
      errors.push({ file: file.originalname, error: err.message });
    }
  }

  res.status(201).json({ count: created.length, items: created, errors });
});

// Bulk Create 2, step 2: attach associated files by matching filename base to QR title.
router.post('/bulk-create-2/associated', requireAuth, qrUpload.array('files', 500), handleUploadErrors, async (req, res) => {
  const { collectionId } = req.body;
  const files = req.files || [];
  let qrIds = [];

  try {
    qrIds = JSON.parse(req.body.qrIds || '[]');
  } catch {
    qrIds = [];
  }

  if (!files.length) return res.status(400).json({ message: 'No associated files uploaded.' });
  if (!collectionId && (!Array.isArray(qrIds) || !qrIds.length)) {
    await Promise.all(files.map((file) => removeUploadFile(file.path).catch(() => {})));
    return res.status(400).json({ message: 'Select a collection or QR batch for matching.' });
  }

  const scopedQrIds = Array.isArray(qrIds) ? qrIds.filter(Boolean) : [];
  const qrQuery = { status: { $ne: 'deleted' } };
  if (scopedQrIds.length) qrQuery._id = { $in: scopedQrIds };
  if (collectionId) qrQuery.collection = collectionId;
  const qrs = await QRCode.find(qrQuery).lean();
  if (!qrs.length) {
    await Promise.all(files.map((file) => removeUploadFile(file.path).catch(() => {})));
    return res.status(404).json({ message: 'No matching QR codes found for this batch.' });
  }

  const qrByTitle = new Map();
  const ambiguousTitles = new Set();
  for (const qr of qrs) {
    const key = matchKey(qr.name);
    if (qrByTitle.has(key)) ambiguousTitles.add(key);
    qrByTitle.set(key, qr);
  }
  const qrObjectIds = qrs.map((qr) => qr._id);
  const existingCounts = await Upload.aggregate([
    { $match: { qrCode: { $in: qrObjectIds }, status: { $ne: 'deleted' } } },
    { $group: { _id: '$qrCode', count: { $sum: 1 } } }
  ]);
  const nextOrderByQr = new Map(existingCounts.map((item) => [String(item._id), item.count]));
  const uploadDocs = [];
  const matchedQrIds = new Set();
  const unmatched = [];
  const ambiguous = [];

  for (const file of files) {
    const title = filenameTitle(file.originalname);
    const key = matchKey(title);
    const qr = qrByTitle.get(key);

    if (ambiguousTitles.has(key)) {
      ambiguous.push(file.originalname);
      await removeUploadFile(file.path).catch(() => {});
      continue;
    }

    if (!qr) {
      unmatched.push(file.originalname);
      await removeUploadFile(file.path).catch(() => {});
      continue;
    }

    const qrId = qr._id;
    const qrKey = String(qrId);
    const order = nextOrderByQr.get(qrKey) || 0;
    nextOrderByQr.set(qrKey, order + 1);
    matchedQrIds.add(qrId);
    uploadDocs.push({
      ...buildUploadDoc(file, qr._id, order)
    });
  }

  if (uploadDocs.length) {
    await Upload.insertMany(uploadDocs);
    await Promise.all(Array.from(matchedQrIds).map((qrId) => recalculateQrSize(qrId)));
    await Promise.all(
      Array.from(matchedQrIds).map((qrId) => logActivity('QR_MODIFIED', qrId, 'Associated files added by Bulk Create 2'))
    );
  }

  res.status(201).json({
    matched: uploadDocs.length,
    ambiguous,
    unmatched,
    qrMatched: matchedQrIds.size
  });
});

router.get('/:id', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id).lean();
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });
  const uploads = await Upload.find({ qrCode: qr._id, status: { $ne: 'deleted' } }).sort({ order: 1 }).lean();

  let collectionPdf = null;
  let collectionDesign = null;
  if (qr.collection) {
    const col = await Collection.findOne({ _id: qr.collection, status: { $ne: 'deleted' } }).lean();
    if (col) {
      collectionDesign = col.design || null;
      if (col.defaultPdf) {
        collectionPdf = {
          collectionId: col._id,
          collectionName: col.name,
          originalName: col.defaultPdf.originalName,
          sizeBytes: col.defaultPdf.sizeBytes,
          mimeType: col.defaultPdf.mimeType
        };
      }
    }
  }

  res.json({ qr: mapQr(qr), uploads, collectionPdf, collectionDesign });
});

router.put('/:id', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });
  qr.name = req.body.name || qr.name;
  qr.description = req.body.description ?? qr.description;
  qr.status = req.body.status || qr.status;
  await qr.save();
  await logActivity('QR_MODIFIED', qr._id, `QR modified: ${qr.name}`);
  res.json(mapQr(qr.toObject()));
});

router.post('/:id/files', requireAuth, qrUpload.array('files', 4), handleUploadErrors, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  const existing = await Upload.countDocuments({ qrCode: qr._id, status: { $ne: 'deleted' } });
  if (existing + req.files.length > 4) {
    await Promise.all(req.files.map((file) => removeUploadFile(file.path)));
    return res.status(400).json({ message: 'Each QR can contain a maximum of 4 files.' });
  }

  const docs = await Upload.insertMany(
    req.files.map((file, index) => buildUploadDoc(file, qr._id, existing + index))
  );

  await recalculateQrSize(qr._id);
  res.status(201).json({ uploads: docs });
});

router.put('/:id/files/reorder', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  const orderedIds = Array.isArray(req.body.uploadIds) ? req.body.uploadIds : [];
  const uploads = await Upload.find({ qrCode: qr._id, status: { $ne: 'deleted' } });
  const uploadIds = uploads.map((upload) => String(upload._id));
  const hasSameUploads = orderedIds.length === uploadIds.length && uploadIds.every((id) => orderedIds.includes(id));

  if (!hasSameUploads) {
    return res.status(400).json({ message: 'Upload order does not match the QR files.' });
  }

  await Promise.all(
    orderedIds.map((uploadId, index) => Upload.updateOne({ _id: uploadId, qrCode: qr._id }, { order: index }))
  );
  const reordered = await Upload.find({ qrCode: qr._id, status: { $ne: 'deleted' } }).sort({ order: 1 }).lean();
  res.json({ uploads: reordered });
});

router.put('/:id/files/:uploadId/replace', requireAuth, qrUpload.single('file'), handleUploadErrors, async (req, res) => {
  const upload = await Upload.findOne({ _id: req.params.uploadId, qrCode: req.params.id, status: { $ne: 'deleted' } });
  if (!upload) return res.status(404).json({ message: 'Upload not found.' });
  await removeUploadFile(upload.path);
  upload.originalName = req.file.originalname;
  upload.storedName = req.file.filename;
  upload.mimeType = req.file.mimetype;
  upload.sizeBytes = buildUploadDoc(req.file, upload.qrCode, upload.order).sizeBytes;
  upload.category = getFileCategory(req.file.mimetype);
  upload.path = req.file.path;
  await upload.save();
  await recalculateQrSize(upload.qrCode);
  res.json({ upload });
});

router.delete('/:id/files/:uploadId', requireAuth, async (req, res) => {
  const upload = await Upload.findOne({ _id: req.params.uploadId, qrCode: req.params.id, status: { $ne: 'deleted' } });
  if (!upload) return res.status(404).json({ message: 'Upload not found.' });
  upload.status = 'deleted';
  upload.deletedAt = new Date();
  await upload.save();
  await RecycleBin.updateOne(
    { upload: upload._id },
    { itemType: 'upload', qrCode: upload._id, upload: upload._id, deletedBy: req.admin._id, deletedAt: upload.deletedAt, snapshot: upload.toObject() },
    { upsert: true }
  );
  await recalculateQrSize(upload.qrCode);
  await logActivity('FILE_DELETED', upload.qrCode, `File moved to recycle bin: ${upload.originalName}`);
  res.json({ message: 'File moved to recycle bin.' });
});

router.get('/:id/qr-image', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id).lean();
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });
  const png = await QRCodeImage.toBuffer(vaultUrl(qr.token), { width: 1200, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${qr.name.replace(/[^a-z0-9]/gi, '-')}.png"`);
  res.send(png);
});

// ---- Design QR Code -------------------------------------------------------
// A QR can either inherit its collection's default design, or opt into its
// own custom look. Saving a design here always marks the QR as customized;
// resetting reverts it back to following the collection (or the plain
// built-in default if it has no collection).

router.put('/:id/design', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  const fields = pickDesignFields(req.body || {});
  qr.design = { ...(qr.design ? qr.design.toObject() : {}), ...fields };
  qr.useCustomDesign = true;
  await qr.save();
  await logActivity('QR_MODIFIED', qr._id, `QR design updated: ${qr.name}`);
  res.json(mapQr(qr.toObject()));
});

router.delete('/:id/design', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  qr.useCustomDesign = false;
  await qr.save();
  await logActivity('QR_MODIFIED', qr._id, `QR design reset to collection default: ${qr.name}`);
  res.json(mapQr(qr.toObject()));
});

router.post('/:id/design/logo', requireAuth, logoUpload.single('logo'), handleLogoUploadError, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') {
    if (req.file) await removeUploadFile(req.file.path).catch(() => {});
    return res.status(404).json({ message: 'QR not found.' });
  }
  if (!req.file) return res.status(400).json({ message: 'No logo file uploaded.' });

  const previousLogo = qr.design?.logo;
  qr.design = {
    ...(qr.design ? qr.design.toObject() : {}),
    logo: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    }
  };
  qr.useCustomDesign = true;
  await qr.save();
  if (previousLogo?.path) await removeUploadFile(previousLogo.path).catch(() => {});

  res.status(201).json(mapQr(qr.toObject()));
});

router.delete('/:id/design/logo', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  const previousLogo = qr.design?.logo;
  if (previousLogo?.path) await removeUploadFile(previousLogo.path).catch(() => {});
  const nextDesign = { ...(qr.design ? qr.design.toObject() : {}) };
  delete nextDesign.logo;
  qr.design = nextDesign;
  await qr.save();
  res.json(mapQr(qr.toObject()));
});

router.get('/:id/design/logo', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id).lean();
  if (!qr || !qr.design?.logo?.path) return res.status(404).json({ message: 'No logo set for this QR.' });
  res.setHeader('Content-Type', qr.design.logo.mimeType || 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(qr.design.logo.path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Logo file missing.' });
  });
});

router.post('/:id/design/frame-image', requireAuth, frameImageUpload.single('frameImage'), handleFrameImageUploadError, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') {
    if (req.file) await removeUploadFile(req.file.path).catch(() => {});
    return res.status(404).json({ message: 'QR not found.' });
  }
  if (!req.file) return res.status(400).json({ message: 'No frame image uploaded.' });

  const previousFrameImage = qr.design?.frameImage;
  qr.design = {
    ...(qr.design ? qr.design.toObject() : {}),
    frameStyle: 'custom-image',
    frameImage: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    }
  };
  qr.useCustomDesign = true;
  await qr.save();
  if (previousFrameImage?.path) await removeUploadFile(previousFrameImage.path).catch(() => {});

  res.status(201).json(mapQr(qr.toObject()));
});

router.delete('/:id/design/frame-image', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id);
  if (!qr || qr.status === 'deleted') return res.status(404).json({ message: 'QR not found.' });

  const previousFrameImage = qr.design?.frameImage;
  if (previousFrameImage?.path) await removeUploadFile(previousFrameImage.path).catch(() => {});
  const nextDesign = { ...(qr.design ? qr.design.toObject() : {}) };
  delete nextDesign.frameImage;
  if (nextDesign.frameStyle === 'custom-image') nextDesign.frameStyle = 'none';
  qr.design = nextDesign;
  await qr.save();
  res.json(mapQr(qr.toObject()));
});

router.get('/:id/design/frame-image', requireAuth, async (req, res) => {
  const qr = await QRCode.findById(req.params.id).lean();
  if (!qr || !qr.design?.frameImage?.path) return res.status(404).json({ message: 'No custom frame set for this QR.' });
  res.setHeader('Content-Type', qr.design.frameImage.mimeType || 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(qr.design.frameImage.path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Frame image file missing.' });
  });
});

router.post('/:id/recycle', requireAuth, async (req, res) => {
  const qr = await moveQrToRecycle(req.params.id, req.admin._id);
  if (!qr) return res.status(404).json({ message: 'QR not found.' });
  res.json({ message: 'QR moved to recycle bin.' });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const qr = await moveQrToRecycle(req.params.id, req.admin._id);
  if (!qr) return res.status(404).json({ message: 'QR not found.' });
  res.json({ message: 'QR moved to recycle bin.' });
});

export default router;
