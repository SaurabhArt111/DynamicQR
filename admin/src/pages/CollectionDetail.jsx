import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Download, FileDown, FileImage, Trash, Search, FolderUp, FileText, CheckCircle2, XCircle, Loader, HardDrive, QrCode, Palette
} from 'lucide-react';
import { api, getErrorMessage } from '../api/http.js';
import Modal from '../components/Modal.jsx';
import QRCanvas from '../components/QRCanvas.jsx';
import QRDesignStudio from '../components/QRDesignStudio.jsx';
import { loadAuthenticatedImage, resolveDesignAndLogoUrl } from '../utils/designHelpers.js';
import { resolveEffectiveDesign } from '../utils/qrEngine.js';
import { downloadSingleQrPng, downloadSingleQrSvg, downloadCollectionZip, downloadCollectionPdf, fetchAllCollectionQrItems } from '../utils/qrExport.js';
import { routes } from '../routes/paths.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './CollectionDetail.css';

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [col, setCol] = useState(null);
  const [qrItems, setQrItems] = useState([]);
  const [collectionStats, setCollectionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 1 });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showCollectionDesignStudio, setShowCollectionDesignStudio] = useState(false);
  const [designingQr, setDesigningQr] = useState(null);
  const [downloadQrTarget, setDownloadQrTarget] = useState(null);
  const [collectionLogoObjectUrl, setCollectionLogoObjectUrl] = useState(null);

  // Bulk folder state
  const [bulkFolders, setBulkFolders] = useState([]); // [{name, files:[]}]
  const [bulkParentName, setBulkParentName] = useState('');
  const [bulkSkippedFiles, setBulkSkippedFiles] = useState(0);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const folderInputRef = useRef(null);

  // Bulk Create 2 state
  const [bulk2PrimaryFiles, setBulk2PrimaryFiles] = useState([]);
  const [bulk2AssociatedFiles, setBulk2AssociatedFiles] = useState([]);
  const [bulk2Created, setBulk2Created] = useState([]);
  const [bulk2Result, setBulk2Result] = useState(null);
  const primaryInputRef = useRef(null);
  const associatedInputRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/collections/${id}/qrcodes`, { params: { search: query, page, limit: 24 } });
      setCol(data.collection);
      setQrItems(data.items);
      setCollectionStats(data.stats || null);
      setPageInfo({ total: data.total, pages: data.pages || 1 });
    } catch {
      navigate(routes.collections);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id, page]);

  function runSearch() {
    if (page === 1) load();
    else setPage(1);
  }

  // Fetch the collection's design logo and custom frame image once each and
  // reuse the resulting blob URLs across every card thumbnail, instead of
  // each card re-fetching them. If either turns out to be unavailable (e.g.
  // the file was lost on the server), we remember that so cards don't keep
  // hammering a failing endpoint.
  const [collectionLogoUnavailable, setCollectionLogoUnavailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let revoke = () => { };

    async function run() {
      if (!col?.design?.logo) { setCollectionLogoObjectUrl(null); setCollectionLogoUnavailable(false); return; }
      const { image, revoke: revokeFn } = await loadAuthenticatedImage(`/collections/${id}/design/logo`);
      revoke = revokeFn;
      if (cancelled) return;
      setCollectionLogoObjectUrl(image?.src || null);
      setCollectionLogoUnavailable(!image);
    }

    run();
    return () => { cancelled = true; revoke(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, col?.design?.logo?.storedName]);

  const [collectionFrameImageObjectUrl, setCollectionFrameImageObjectUrl] = useState(null);
  const [collectionFrameImageUnavailable, setCollectionFrameImageUnavailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let revoke = () => { };

    async function run() {
      if (!col?.design?.frameImage) { setCollectionFrameImageObjectUrl(null); setCollectionFrameImageUnavailable(false); return; }
      const { image, revoke: revokeFn } = await loadAuthenticatedImage(`/collections/${id}/design/frame-image`);
      revoke = revokeFn;
      if (cancelled) return;
      setCollectionFrameImageObjectUrl(image?.src || null);
      setCollectionFrameImageUnavailable(!image);
    }

    run();
    return () => { cancelled = true; revoke(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, col?.design?.frameImage?.storedName]);

  function resolveCardDesign(qr) {
    const useCustom = !!qr.useCustomDesign;
    const design = resolveEffectiveDesign(col?.design, qr.design, useCustom);
    let logoPath = null;
    let frameImagePath = null;
    if (useCustom) {
      if (qr.design?.logo) logoPath = `/qrcodes/${qr._id}/design/logo`;
      if (qr.design?.frameImage) frameImagePath = `/qrcodes/${qr._id}/design/frame-image`;
    } else {
      if (col?.design?.logo && !collectionLogoUnavailable) logoPath = collectionLogoObjectUrl || `/collections/${id}/design/logo`;
      if (col?.design?.frameImage && !collectionFrameImageUnavailable) frameImagePath = collectionFrameImageObjectUrl || `/collections/${id}/design/frame-image`;
    }
    return { design, logoPath, frameImagePath };
  }

  async function createQr(e) {
    e.preventDefault();
    setBusy('create');
    setError('');
    try {
      await api.post('/qrcodes', { name: form.name, description: form.description, collectionId: id });
      setForm({ name: '', description: '' });
      setModal(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create QR.');
    } finally {
      setBusy('');
    }
  }

  async function recycleQr(qrId) {
    if (!window.confirm('Recycle this QR?')) return;
    try {
      await api.delete(`/qrcodes/${qrId}`);
      await load();
    } catch { }
  }

  async function downloadQrImage(qr) {
    setBusy(`dl-${qr._id}`);
    try {
      const { design, logoPath, frameImagePath } = resolveCardDesign(qr);
      await downloadSingleQrPng({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download the QR image.'));
    } finally {
      setBusy('');
    }
  }

  async function downloadQrImageSvg(qr) {
    setBusy(`dl-svg-${qr._id}`);
    try {
      const { design, logoPath, frameImagePath } = resolveCardDesign(qr);
      await downloadSingleQrSvg({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download the QR SVG.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadZip(format = 'png') {
    setBusy(format === 'svg' ? 'zip-svg' : 'zip');
    setError('');
    try {
      const { items: allItems, collection: freshCol } = await fetchAllCollectionQrItems(id);
      await downloadCollectionZip({
        qrs: allItems,
        design: resolveEffectiveDesign(freshCol?.design, null, false),
        logoPath: freshCol?.design?.logo ? `/collections/${id}/design/logo` : null,
        frameImagePath: freshCol?.design?.frameImage ? `/collections/${id}/design/frame-image` : null,
        collectionName: freshCol?.name,
        format
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download QR images.'));
    } finally {
      setBusy('');
    }
  }

  async function handleDownloadPdf() {
    setBusy('pdf');
    setError('');
    try {
      const { items: allItems, collection: freshCol } = await fetchAllCollectionQrItems(id);
      await downloadCollectionPdf({
        qrs: allItems,
        design: resolveEffectiveDesign(freshCol?.design, null, false),
        logoPath: freshCol?.design?.logo ? `/collections/${id}/design/logo` : null,
        frameImagePath: freshCol?.design?.frameImage ? `/collections/${id}/design/frame-image` : null,
        collectionName: freshCol?.name
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to build the PDF.'));
    } finally {
      setBusy('');
    }
  }

  // ---- Bulk folder logic ----
  function onFolderInput(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Group by the first child folder inside the selected parent folder.
    const map = {};
    let parentName = '';
    let skippedFiles = 0;

    for (const file of files) {
      const parts = (file.webkitRelativePath || file.name).split('/').filter(Boolean);
      if (!parentName && parts[0]) parentName = parts[0];

      if (parts.length < 3) {
        skippedFiles += 1;
        continue;
      }

      const folder = parts[1];
      if (!map[folder]) map[folder] = [];
      map[folder].push(file);
    }

    const folders = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, fls]) => ({
        name,
        files: fls.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name))
      }));

    setBulkFolders(folders);
    setBulkParentName(parentName);
    setBulkSkippedFiles(skippedFiles);
    setBulkResults(null);
    e.target.value = '';
  }

  function removeBulkFolder(name) {
    setBulkFolders((prev) => prev.filter((f) => f.name !== name));
  }

  function resetBulk2() {
    setBulk2PrimaryFiles([]);
    setBulk2AssociatedFiles([]);
    setBulk2Created([]);
    setBulk2Result(null);
  }

  function fileTitle(file) {
    return file.name.replace(/\.[^/.]+$/, '');
  }

  function onBulk2PrimaryInput(e) {
    const files = Array.from(e.target.files || [])
      .sort((a, b) => a.name.localeCompare(b.name));
    setBulk2PrimaryFiles(files);
    setBulk2Created([]);
    setBulk2AssociatedFiles([]);
    setBulk2Result(null);
    e.target.value = '';
  }

  function onBulk2AssociatedInput(e) {
    const files = Array.from(e.target.files || [])
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    setBulk2AssociatedFiles(files);
    setBulk2Result(null);
    e.target.value = '';
  }

  async function runBulkCreate() {
    if (!bulkFolders.length) return;
    setBusy('bulk');
    setBulkProgress({ current: 0, total: bulkFolders.length });
    const results = [];

    for (let i = 0; i < bulkFolders.length; i++) {
      const folder = bulkFolders[i];
      setBulkProgress({ current: i + 1, total: bulkFolders.length, name: folder.name });
      try {
        const fd = new FormData();
        fd.append('collectionId', id);
        for (const file of folder.files) {
          fd.append(folder.name, file);
        }
        const { data } = await api.post('/qrcodes/bulk-folder', fd);
        if (data.items?.length) {
          results.push({ folder: folder.name, status: 'ok', qrName: data.items[0].name });
        } else {
          results.push({ folder: folder.name, status: 'error', message: 'No QR created.' });
        }
      } catch (err) {
        results.push({ folder: folder.name, status: 'error', message: err.response?.data?.message || 'Failed.' });
      }
    }

    setBulkResults(results);
    setBulkProgress(null);
    setBusy('');
    setBulkFolders([]);
    setBulkParentName('');
    setBulkSkippedFiles(0);
    await load();
  }

  async function runBulkCreate2Primary() {
    if (!bulk2PrimaryFiles.length) return;
    setBusy('bulk2-primary');
    setError('');
    try {
      const fd = new FormData();
      fd.append('collectionId', id);
      for (const file of bulk2PrimaryFiles) {
        fd.append('files', file, file.name);
      }
      const { data } = await api.post('/qrcodes/bulk-create-2/primary', fd);
      setBulk2Created(data.items || []);
      setBulk2Result({ phase: 'primary', errors: data.errors || [] });
      setBulk2PrimaryFiles([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create QR codes from primary files.');
    } finally {
      setBusy('');
    }
  }

  async function runBulkCreate2Associated() {
    if (!bulk2AssociatedFiles.length) return;
    setBusy('bulk2-associated');
    setError('');
    try {
      const fd = new FormData();
      fd.append('collectionId', id);
      if (bulk2Created.length) {
        fd.append('qrIds', JSON.stringify(bulk2Created.map((qr) => qr._id)));
      }
      for (const file of bulk2AssociatedFiles) {
        fd.append('files', file, file.name);
      }
      const { data } = await api.post('/qrcodes/bulk-create-2/associated', fd);
      setBulk2Result({ phase: 'associated', ...data });
      setBulk2AssociatedFiles([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to attach associated files.');
    } finally {
      setBusy('');
    }
  }

  if (!col && !loading) return null;

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={() => navigate(routes.collections)}><ArrowLeft size={16} /> Collections</button>
          <h1>{col?.name || '...'}</h1>
          {col?.description && <p>{col.description}</p>}
          {col?.defaultPdf && (
            <div className="col-pdf-indicator">
              <FileText size={14} /> Default PDF: <strong>{col.defaultPdf.originalName}</strong>
            </div>
          )}
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => setShowCollectionDesignStudio(true)} disabled={loading}>
            <Palette size={18} /> Design Frame
          </button>
          <button className="secondary-button" onClick={() => setModal('download-collection')} disabled={loading || !qrItems.length || !!busy}>
            <Download size={18} /> Download
          </button>
          <button className="secondary-button" onClick={() => { setModal('bulk'); setBulkResults(null); setBulkFolders([]); setBulkParentName(''); setBulkSkippedFiles(0); }}>
            <FolderUp size={18} /> Bulk Create
          </button>
          <button className="secondary-button" onClick={() => { resetBulk2(); setError(''); setModal('bulk2'); }}>
            <FolderUp size={18} /> Bulk Create 2
          </button>
          <button className="primary-button" onClick={() => { setForm({ name: '', description: '' }); setError(''); setModal('create'); }}>
            <Plus size={18} /> Create QR
          </button>
        </div>
      </div>

      <p className="qr-collection-design-hint">
        <Palette size={13} /> ZIP and PDF downloads always use this collection's design, so every QR code in the export looks consistent.
      </p>

      <div className="qr-toolbar">
        {error && <div className="error-box">{error}</div>}
        {collectionStats && (
          <div className="collection-stat-row">
            <div className="collection-stat-chip"><QrCode size={15} /> {collectionStats.qrCount} QR codes</div>
            <div className="collection-stat-chip"><HardDrive size={15} /> {formatBytes(collectionStats.totalBytes || 0)} QR files</div>
            {!!collectionStats.defaultPdfBytes && (
              <div className="collection-stat-chip"><FileText size={15} /> {formatBytes(collectionStats.defaultPdfBytes)} default PDF</div>
            )}
          </div>
        )}
        <div className="search-box">
          <Search size={18} />
          <input placeholder="Search QR codes" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
        </div>
        <button className="secondary-button" onClick={runSearch} disabled={loading}><Search size={18} /> Search</button>
      </div>

      <div className="coll-qr-grid">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <article className="coll-qr-card coll-qr-card-skeleton" key={i}><span /><p /><dl><div /><div /><div /></dl></article>
        ))}
        {!loading && qrItems.map((qr) => {
          const { design: cardDesign, logoPath: cardLogoPath, frameImagePath: cardFrameImagePath } = resolveCardDesign(qr);
          return (
            <article className="coll-qr-card" key={qr._id}>
              <div className="coll-qr-card-head">
                <div className="coll-qr-card-thumb">
                  <QRCanvas data={qr.vaultUrl} design={cardDesign} logoPath={cardLogoPath} frameImagePath={cardFrameImagePath} qrName={qr.name} qrPixelSize={140} />
                </div>
                <div>
                  <strong>{qr.name}</strong>
                  <span>{qr.token}</span>
                </div>
              </div>
              <p>{qr.description || 'No description'}</p>
              <dl>
                <div><dt>Size</dt><dd>{formatBytes(qr.sizeBytes)}</dd></div>
                <div><dt>Status</dt><dd>{qr.status}</dd></div>
                <div><dt>Updated</dt><dd>{formatDate(qr.updatedAt)}</dd></div>
              </dl>
              <div className="button-row">
                <Link className="primary-button" to={routes.qrcode(qr._id)}>Manage</Link>
                <button className="icon-button" title="Design this QR" onClick={() => setDesigningQr(qr)}>
                  <Palette size={18} />
                </button>
                <button className="icon-button" title="Download" onClick={() => { setDownloadQrTarget(qr); setModal('download-qr'); }} disabled={!!busy}>
                  <Download size={18} />
                </button>
                <button className="icon-button danger" title="Recycle" onClick={() => recycleQr(qr._id)}>
                  <Trash size={18} />
                </button>
              </div>
            </article>
          );
        })}
        {!loading && !qrItems.length && (
          <div className="qr-empty">No QR codes in this collection yet.</div>
        )}
      </div>

      {!loading && pageInfo.total > 0 && (
        <div className="qr-pagination">
          <span className="qr-pagination-summary">
            {pageInfo.total} QR code{pageInfo.total === 1 ? '' : 's'} &middot; Page {page} of {pageInfo.pages}
          </span>
          <div className="qr-pagination-buttons">
            <button className="secondary-button" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1}>Previous</button>
            <button className="secondary-button" onClick={() => setPage((p) => Math.min(p + 1, pageInfo.pages))} disabled={page >= pageInfo.pages}>Next</button>
          </div>
        </div>
      )}

      {/* Create QR Modal */}
      {modal === 'create' && (
        <Modal title="Create QR" onClose={() => setModal(null)}>
          <form onSubmit={createQr} className="modal-form">
            {error && <div className="error-box">{error}</div>}
            <div className="field"><label>QR Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Product Catalogue" /></div>
            <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            {col?.defaultPdf && (
              <div className="col-pdf-indicator"><FileText size={13} /> Collection PDF <strong>{col.defaultPdf.originalName}</strong> will be auto-attached.</div>
            )}
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creating...' : 'Create QR'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk Create Modal */}
      {modal === 'bulk' && (
        <Modal title="Bulk Create from Folders" onClose={() => { setModal(null); setBulkFolders([]); setBulkResults(null); setBulkParentName(''); setBulkSkippedFiles(0); }}>
          <div className="bulk-modal">
            <p className="bulk-intro">Select one parent folder. Each child folder inside it becomes a QR code - the child folder name becomes the QR title, and all files inside that child folder are uploaded to that QR.</p>

            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory="true"
              multiple
              hidden
              onChange={onFolderInput}
            />

            {!bulkResults && (
              <>
                <button className="secondary-button bulk-pick-btn" onClick={() => folderInputRef.current?.click()}>
                  <FolderUp size={18} /> {bulkFolders.length ? `${bulkFolders.length} child folder(s) selected - Choose different parent` : 'Select Parent Folder'}
                </button>

                {bulkFolders.length > 0 && (
                  <div className="bulk-folder-list">
                    <div className="bulk-folder-header">
                      <strong>{bulkFolders.length} child folder(s) queued</strong>
                      <span>{bulkFolders.reduce((s, f) => s + f.files.length, 0)} files total</span>
                    </div>
                    {bulkParentName && (
                      <div className="bulk-parent-note">
                        Parent folder: <strong>{bulkParentName}</strong>
                        {bulkSkippedFiles > 0 && <span>{bulkSkippedFiles} direct parent file(s) skipped</span>}
                      </div>
                    )}
                    {bulkFolders.map((f) => (
                      <div className="bulk-folder-row" key={f.name}>
                        <div>
                          <strong>{f.name}</strong>
                          <span>{f.files.length} file(s)</span>
                        </div>
                        <button className="icon-button" onClick={() => removeBulkFolder(f.name)} title="Remove folder"><XCircle size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {bulkProgress && (
                  <div className="bulk-progress">
                    <Loader size={16} className="spin" />
                    <span>Creating {bulkProgress.current} / {bulkProgress.total}: {bulkProgress.name}</span>
                  </div>
                )}

                <div className="button-row">
                  <button className="secondary-button" onClick={() => { setModal(null); setBulkFolders([]); setBulkParentName(''); setBulkSkippedFiles(0); }}>Cancel</button>
                  <button
                    className="primary-button"
                    onClick={runBulkCreate}
                    disabled={!bulkFolders.length || busy === 'bulk'}
                  >
                    {busy === 'bulk' ? 'Creating...' : `Create ${bulkFolders.length} QR Code(s)`}
                  </button>
                </div>
              </>
            )}

            {bulkResults && (
              <div className="bulk-results">
                <div className="bulk-results-header">
                  <strong>{bulkResults.filter((r) => r.status === 'ok').length} created</strong>
                  {bulkResults.some((r) => r.status === 'error') && (
                    <span className="bulk-errors">{bulkResults.filter((r) => r.status === 'error').length} failed</span>
                  )}
                </div>
                <div className="bulk-result-list">
                  {bulkResults.map((r) => (
                    <div className={`bulk-result-row ${r.status}`} key={r.folder}>
                      {r.status === 'ok' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      <strong>{r.folder}</strong>
                      {r.status === 'error' && <span className="bulk-err-msg">{r.message}</span>}
                    </div>
                  ))}
                </div>
                <button className="primary-button" onClick={() => { setModal(null); setBulkResults(null); setBulkParentName(''); setBulkSkippedFiles(0); }}>Done</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Bulk Create 2 Modal */}
      {modal === 'bulk2' && (
        <Modal title="Bulk Create 2" onClose={() => { setModal(null); resetBulk2(); }}>
          <div className="bulk-modal">
            {error && <div className="error-box">{error}</div>}
            <p className="bulk-intro">Create QRs from primary files, or upload associated files later. Associated files are matched to QR titles in this collection by filename only, ignoring extensions.</p>

            <input
              ref={primaryInputRef}
              type="file"
              multiple
              hidden
              onChange={onBulk2PrimaryInput}
            />
            <input
              ref={associatedInputRef}
              type="file"
              multiple
              hidden
              onChange={onBulk2AssociatedInput}
            />

            <div className="bulk-step">
              <div className="bulk-step-header">
                <strong>1. Primary files</strong>
                <span>{bulk2Created.length ? `${bulk2Created.length} QR code(s) created` : `${bulk2PrimaryFiles.length} file(s) selected`}</span>
              </div>
              {!bulk2Created.length && (
                <>
                  <button className="secondary-button bulk-pick-btn" onClick={() => primaryInputRef.current?.click()}>
                    <FolderUp size={18} /> {bulk2PrimaryFiles.length ? 'Choose different primary files' : 'Select Primary Files'}
                  </button>
                  {bulk2PrimaryFiles.length > 0 && (
                    <div className="bulk-folder-list bulk-file-list">
                      {bulk2PrimaryFiles.map((file) => (
                        <div className="bulk-folder-row" key={`${file.name}-${file.size}`}>
                          <div>
                            <strong>{fileTitle(file)}</strong>
                            <span>{file.name} - {formatBytes(file.size)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="primary-button"
                    onClick={runBulkCreate2Primary}
                    disabled={!bulk2PrimaryFiles.length || busy === 'bulk2-primary'}
                  >
                    {busy === 'bulk2-primary' ? 'Creating...' : `Create ${bulk2PrimaryFiles.length} QR Code(s)`}
                  </button>
                </>
              )}
              {bulk2Created.length > 0 && (
                <div className="bulk-folder-list bulk-file-list">
                  {bulk2Created.map((qr) => (
                    <div className="bulk-result-row ok" key={qr._id}>
                      <CheckCircle2 size={15} />
                      <strong>{qr.name}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bulk-step">
              <div className="bulk-step-header">
                <strong>2. Associated files</strong>
                <span>{bulk2AssociatedFiles.length} file(s) selected</span>
              </div>
              <button className="secondary-button bulk-pick-btn" onClick={() => associatedInputRef.current?.click()}>
                <FolderUp size={18} /> {bulk2AssociatedFiles.length ? 'Choose different associated files' : 'Select Associated Files'}
              </button>
              {bulk2AssociatedFiles.length > 0 && (
                <div className="bulk-folder-list bulk-file-list">
                  {bulk2AssociatedFiles.map((file) => (
                    <div className="bulk-folder-row" key={`${file.name}-${file.size}-${file.lastModified}`}>
                      <div>
                        <strong>{fileTitle(file)}</strong>
                        <span>{file.name} - {formatBytes(file.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="button-row"><button
                className="primary-button"
                onClick={runBulkCreate2Associated}
                disabled={!bulk2AssociatedFiles.length || busy === 'bulk2-associated'}
              >
                {busy === 'bulk2-associated' ? 'Attaching...' : 'Attach Matching Files'}
              </button>
                <button className="secondary-button" onClick={() => { setModal(null); resetBulk2(); }}>Done</button>
              </div>
            </div>

            {bulk2Result?.phase === 'associated' && (
              <div className="bulk-results">
                <div className="bulk-results-header">
                  <strong>{bulk2Result.matched || 0} file(s) attached</strong>
                  {!!bulk2Result.unmatched?.length && <span className="bulk-errors">{bulk2Result.unmatched.length} unmatched</span>}
                  {!!bulk2Result.ambiguous?.length && <span className="bulk-errors">{bulk2Result.ambiguous.length} duplicate title match</span>}
                </div>
                {!!bulk2Result.unmatched?.length && (
                  <div className="bulk-result-list">
                    {bulk2Result.unmatched.map((name) => (
                      <div className="bulk-result-row error" key={name}>
                        <XCircle size={15} />
                        <strong>{name}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!!bulk2Result.ambiguous?.length && (
                  <div className="bulk-result-list">
                    {bulk2Result.ambiguous.map((name) => (
                      <div className="bulk-result-row error" key={name}>
                        <XCircle size={15} />
                        <strong>{name}</strong>
                        <span className="bulk-err-msg">Multiple QR titles match this filename.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Collection Download Modal */}
      {modal === 'download-collection' && (
        <Modal title="Download Collection" onClose={() => setModal(null)}>
          <div className="download-options">
            <p className="field-hint">Choose how you'd like to download all QR images in this collection.</p>
            <div className="button-row">
              <button className="secondary-button" onClick={() => { handleDownloadZip('png'); setModal(null); }} disabled={busy === 'zip' || loading}>
                {busy === 'zip' ? <span className="spinner small-spinner" /> : <Download size={16} />} ZIP (PNG)
              </button>
              <button className="secondary-button" onClick={() => { handleDownloadZip('svg'); setModal(null); }} disabled={busy === 'zip-svg' || loading}>
                {busy === 'zip-svg' ? <span className="spinner small-spinner" /> : <FileImage size={16} />} ZIP (SVG)
              </button>
              <button className="secondary-button" onClick={() => { handleDownloadPdf(); setModal(null); }} disabled={busy === 'pdf' || loading}>
                {busy === 'pdf' ? <span className="spinner small-spinner" /> : <FileDown size={16} />} PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Single QR Download Modal */}
      {modal === 'download-qr' && downloadQrTarget && (
        <Modal title={`Download "${downloadQrTarget.name}"`} onClose={() => { setModal(null); setDownloadQrTarget(null); }}>
          <div className="download-options">
            <p className="field-hint">Choose a format to download this QR.</p>
            <div className="button-row">
              <button className="secondary-button" onClick={() => { downloadQrImage(downloadQrTarget); setModal(null); setDownloadQrTarget(null); }} disabled={busy === `dl-${downloadQrTarget._id}`}>
                {busy === `dl-${downloadQrTarget._id}` ? <span className="spinner small-spinner" /> : <Download size={16} />} PNG
              </button>
              <button className="secondary-button" onClick={() => { downloadQrImageSvg(downloadQrTarget); setModal(null); setDownloadQrTarget(null); }} disabled={busy === `dl-svg-${downloadQrTarget._id}`}>
                {busy === `dl-svg-${downloadQrTarget._id}` ? <span className="spinner small-spinner" /> : <FileImage size={16} />} SVG
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showCollectionDesignStudio && (
        <QRDesignStudio
          scope="collection"
          collection={col}
          onClose={() => setShowCollectionDesignStudio(false)}
          onSaved={load}
        />
      )}

      {designingQr && (
        <QRDesignStudio
          scope="qr"
          qr={designingQr}
          collection={col}
          onClose={() => setDesigningQr(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}
