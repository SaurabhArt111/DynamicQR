import express from 'express';
import path from 'path';
import multer from 'multer';
import QRCodeImage from 'qrcode';
import { requireAuth } from '../middleware/auth.js';
import { Collection } from '../models/Collection.js';
import { QRCode } from '../models/QRCode.js';
import { RecycleBin } from '../models/RecycleBin.js';
import { pickDesignFields } from '../models/designSchema.js';
import { uploadRoot, removeUploadFile } from '../utils/storage.js';
import { logActivity } from '../utils/activity.js';
import { env } from '../config/env.js';
import { asyncRouter } from '../utils/asyncRouter.js';
import { moveCollectionToRecycle } from '../services/qrLifecycle.js';

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `col-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { files: 1, fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf';
    cb(ok ? null : new Error('Only PDF files are allowed as collection default.'), ok);
  }
});

function handlePdfError(err, req, res, next) {
  if (!err) return next();
  res.status(400).json({ message: err.message || 'File upload error.' });
}

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadRoot,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `collogo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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
      cb(null, `colframe-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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

function safeFileName(value, fallback = 'file') {
  return String(value || fallback).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function zipDateParts(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.data;
    const checksum = crc32(data);
    const { dosTime, dosDate } = zipDateParts(file.date);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const router = asyncRouter(express.Router());

router.get('/', requireAuth, async (req, res) => {
  const items = await Collection.find({ status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).lean();
  const qrCounts = await QRCode.aggregate([
    { $match: { status: { $ne: 'deleted' }, collection: { $ne: null } } },
    { $group: { _id: '$collection', count: { $sum: 1 } } }
  ]);
  const countMap = new Map(qrCounts.map((item) => [String(item._id), item.count]));
  res.json({
    items: items.map((item) => ({
      ...item,
      qrCount: countMap.get(String(item._id)) || 0
    }))
  });
});

router.post('/', requireAuth, pdfUpload.single('defaultPdf'), handlePdfError, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Collection name is required.' });

  const data = { name, description: description || '' };

  if (req.file) {
    data.defaultPdf = {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    };
  }

  const col = await Collection.create(data);
  res.status(201).json({ collection: col.toObject() });
});

router.put('/:id', requireAuth, pdfUpload.single('defaultPdf'), handlePdfError, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  col.name = req.body.name || col.name;
  col.description = req.body.description ?? col.description;

  if (req.file) {
    // Remove old PDF if exists
    if (col.defaultPdf?.path) {
      await removeUploadFile(col.defaultPdf.path).catch(() => {});
    }
    col.defaultPdf = {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    };
  }

  if (req.body.removePdf === 'true' && col.defaultPdf) {
    await removeUploadFile(col.defaultPdf.path).catch(() => {});
    col.defaultPdf = undefined;
  }

  await col.save();
  res.json({ collection: col.toObject() });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const col = await moveCollectionToRecycle(req.params.id, req.admin._id);
  if (!col) return res.status(404).json({ message: 'Collection not found.' });
  res.json({ message: 'Collection moved to recycle bin.' });
});

router.get('/:id/qrcodes', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id).lean();
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const search = String(req.query.search || '').trim();

  const query = { collection: col._id, status: { $ne: 'deleted' } };
  if (search) {
    query.$or = [{ name: { $regex: search, $options: 'i' } }, { token: { $regex: search, $options: 'i' } }];
  }

  const [items, total] = await Promise.all([
    QRCode.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    QRCode.countDocuments(query)
  ]);
  const sizeTotals = await QRCode.aggregate([
    { $match: { collection: col._id, status: { $ne: 'deleted' } } },
    { $group: { _id: '$collection', bytes: { $sum: '$sizeBytes' } } }
  ]);

  res.json({
    items: items.map((item) => ({ ...item, vaultUrl: vaultUrl(item.token), collectionId: col._id })),
    total,
    page,
    pages: Math.ceil(total / limit),
    collection: col,
    stats: {
      qrCount: total,
      totalBytes: sizeTotals[0]?.bytes || 0,
      defaultPdfBytes: col.defaultPdf?.sizeBytes || 0
    }
  });
});

router.get('/:id/qr-images.zip', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id).lean();
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  const qrs = await QRCode.find({ collection: col._id, status: { $ne: 'deleted' } }).sort({ name: 1, createdAt: 1 }).lean();
  if (!qrs.length) return res.status(404).json({ message: 'No QR codes found in this collection.' });

  const usedNames = new Map();
  const files = await Promise.all(qrs.map(async (qr) => {
    const base = safeFileName(qr.name, 'qr-code');
    const count = usedNames.get(base) || 0;
    usedNames.set(base, count + 1);
    const name = `${base}${count ? `-${count + 1}` : ''}.png`;
    const data = await QRCodeImage.toBuffer(vaultUrl(qr.token), { width: 1200, margin: 2 });
    return { name, data, date: qr.updatedAt || qr.createdAt };
  }));

  const zip = buildZip(files);
  const zipName = `${safeFileName(col.name, 'collection')}-qr-images.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.setHeader('Content-Length', zip.length);
  res.send(zip);
});

// ---- Design QR Code (collection default) -----------------------------
// This is the frame/pattern/color/logo applied to every QR in the
// collection that hasn't been customized individually. Bulk ZIP/PDF
// exports always render every QR with this design, so a whole batch stays
// visually consistent no matter what individual QRs are set to.

router.put('/:id/design', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  const fields = pickDesignFields(req.body || {});
  col.design = { ...(col.design ? col.design.toObject() : {}), ...fields };
  await col.save();
  res.json({ collection: col.toObject() });
});

router.post('/:id/design/logo', requireAuth, logoUpload.single('logo'), handleLogoUploadError, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') {
    if (req.file) await removeUploadFile(req.file.path).catch(() => {});
    return res.status(404).json({ message: 'Collection not found.' });
  }
  if (!req.file) return res.status(400).json({ message: 'No logo file uploaded.' });

  const previousLogo = col.design?.logo;
  col.design = {
    ...(col.design ? col.design.toObject() : {}),
    logo: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    }
  };
  await col.save();
  if (previousLogo?.path) await removeUploadFile(previousLogo.path).catch(() => {});

  res.status(201).json({ collection: col.toObject() });
});

router.delete('/:id/design/logo', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  const previousLogo = col.design?.logo;
  if (previousLogo?.path) await removeUploadFile(previousLogo.path).catch(() => {});
  const nextDesign = { ...(col.design ? col.design.toObject() : {}) };
  delete nextDesign.logo;
  col.design = nextDesign;
  await col.save();
  res.json({ collection: col.toObject() });
});

router.get('/:id/design/logo', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id).lean();
  if (!col || !col.design?.logo?.path) return res.status(404).json({ message: 'No logo set for this collection.' });
  res.setHeader('Content-Type', col.design.logo.mimeType || 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(col.design.logo.path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Logo file missing.' });
  });
});

router.post('/:id/design/frame-image', requireAuth, frameImageUpload.single('frameImage'), handleFrameImageUploadError, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') {
    if (req.file) await removeUploadFile(req.file.path).catch(() => {});
    return res.status(404).json({ message: 'Collection not found.' });
  }
  if (!req.file) return res.status(400).json({ message: 'No frame image uploaded.' });

  const previousFrameImage = col.design?.frameImage;
  col.design = {
    ...(col.design ? col.design.toObject() : {}),
    frameStyle: 'custom-image',
    frameImage: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      path: req.file.path
    }
  };
  await col.save();
  if (previousFrameImage?.path) await removeUploadFile(previousFrameImage.path).catch(() => {});

  res.status(201).json({ collection: col.toObject() });
});

router.delete('/:id/design/frame-image', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id);
  if (!col || col.status === 'deleted') return res.status(404).json({ message: 'Collection not found.' });

  const previousFrameImage = col.design?.frameImage;
  if (previousFrameImage?.path) await removeUploadFile(previousFrameImage.path).catch(() => {});
  const nextDesign = { ...(col.design ? col.design.toObject() : {}) };
  delete nextDesign.frameImage;
  if (nextDesign.frameStyle === 'custom-image') nextDesign.frameStyle = 'none';
  col.design = nextDesign;
  await col.save();
  res.json({ collection: col.toObject() });
});

router.get('/:id/design/frame-image', requireAuth, async (req, res) => {
  const col = await Collection.findById(req.params.id).lean();
  if (!col || !col.design?.frameImage?.path) return res.status(404).json({ message: 'No custom frame set for this collection.' });
  res.setHeader('Content-Type', col.design.frameImage.mimeType || 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(col.design.frameImage.path), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Frame image file missing.' });
  });
});

export default router;
