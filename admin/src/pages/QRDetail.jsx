import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, ExternalLink, FileImage, FileText, GripVertical, Palette, RefreshCw, Save, Trash2, UploadCloud, X } from 'lucide-react';
import { api, fileUrl, getErrorMessage } from '../api/http.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import QRCanvas from '../components/QRCanvas.jsx';
import QRDesignStudio from '../components/QRDesignStudio.jsx';
import { resolveDesignAndLogoUrl } from '../utils/designHelpers.js';
import { downloadSingleQrPng, downloadSingleQrSvg } from '../utils/qrExport.js';
import { routes } from '../routes/paths.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './QRDetail.css';

const emptySlots = () => Array.from({ length: 4 }, () => null);

export default function QRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(emptySlots);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [showDesignStudio, setShowDesignStudio] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const queuedFiles = useMemo(() => selectedFiles.filter(Boolean), [selectedFiles]);

  async function load() {
    const res = await api.get(`/qrcodes/${id}`);
    setData(res.data);
  }

  useEffect(() => { load(); }, [id]);

  async function saveQr(event) {
    event.preventDefault();
    setBusyAction('save');
    const { qr } = data;
    try {
      await api.put(`/qrcodes/${id}`, { name: qr.name, description: qr.description, status: qr.status });
      await load();
    } finally { setBusyAction(''); }
  }

  function selectUploadSlot(index, event) {
    const file = event.target.files?.[0] || null;
    setSelectedFiles((current) => current.map((item, itemIndex) => (itemIndex === index ? file : item)));
    event.target.value = '';
  }

  function clearUploadSlot(index) {
    setSelectedFiles((current) => current.map((item, itemIndex) => (itemIndex === index ? null : item)));
  }

  async function uploadFiles() {
    if (!queuedFiles.length) return;
    const formData = new FormData();
    queuedFiles.forEach((file) => formData.append('files', file));
    setUploadingFiles(queuedFiles.map((file) => ({ name: file.name, size: file.size })));
    try {
      await api.post(`/qrcodes/${id}/files`, formData);
      setSelectedFiles(emptySlots());
      await load();
    } catch (err) {
      const body = err.response?.data;
      setModalError([body?.message, ...(body?.details || [])].filter(Boolean));
    } finally { setUploadingFiles([]); }
  }

  async function replaceFile(uploadId, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setBusyAction(`replace-${uploadId}`);
    try {
      await api.put(`/qrcodes/${id}/files/${uploadId}/replace`, formData);
      await load();
    } catch (err) {
      const body = err.response?.data;
      setModalError([body?.message, ...(body?.details || [])].filter(Boolean));
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  }

  async function removeFile(uploadId) {
    setBusyAction(`remove-${uploadId}`);
    try {
      await api.delete(`/qrcodes/${id}/files/${uploadId}`);
      await load();
    } finally { setBusyAction(''); }
  }

  async function recycle() {
    setBusyAction('recycle');
    await api.post(`/qrcodes/${id}/recycle`);
    navigate(qr.collectionId ? routes.collection(qr.collectionId) : routes.qrcodes);
  }

  async function downloadQr() {
    setBusyAction('download');
    try {
      const { design, logoPath, frameImagePath } = resolveDesignAndLogoUrl(qr, data.collectionDesign);
      await downloadSingleQrPng({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the QR image.'));
    } finally {
      setBusyAction('');
    }
  }

  async function downloadQrSvg() {
    setBusyAction('download-svg');
    try {
      const { design, logoPath, frameImagePath } = resolveDesignAndLogoUrl(qr, data.collectionDesign);
      await downloadSingleQrSvg({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the QR SVG.'));
    } finally {
      setBusyAction('');
    }
  }

  async function persistOrder(uploadIds, nextUploads) {
    setData((current) => ({ ...current, uploads: nextUploads }));
    setBusyAction('reorder');
    try {
      const { data: result } = await api.put(`/qrcodes/${id}/files/reorder`, { uploadIds });
      setData((current) => ({ ...current, uploads: result.uploads }));
    } catch (err) {
      await load();
      setModalError([err.response?.data?.message || 'Unable to reorder files.']);
    } finally { setBusyAction(''); }
  }

  function reorderFiles(fromIndex, toIndex) {
    if (fromIndex === null || fromIndex === toIndex || toIndex < 0 || toIndex >= data.uploads.length) return;
    const nextUploads = [...data.uploads];
    const [moved] = nextUploads.splice(fromIndex, 1);
    nextUploads.splice(toIndex, 0, moved);
    persistOrder(nextUploads.map((file) => file._id), nextUploads);
  }

  if (!data) {
    return (
      <section className="page">
        <div className="page-loader"><span className="spinner" /> Loading QR details...</div>
      </section>
    );
  }

  const { qr, uploads, collectionPdf, collectionDesign } = data;
  const parentCollectionId = collectionPdf?.collectionId || qr.collectionId || null;
  const backTarget = parentCollectionId ? routes.collection(parentCollectionId) : routes.qrcodes;
  const { design: effectiveDesign, logoPath: effectiveLogoPath, frameImagePath: effectiveFrameImagePath } = resolveDesignAndLogoUrl(qr, collectionDesign);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={() => navigate(backTarget)}>
            <ArrowLeft size={16} />
            {parentCollectionId ? 'Back to Collection' : 'Back to QR Codes'}
          </button>
          <h1>{qr.name}</h1>
          <p>{qr.token}</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => navigator.clipboard.writeText(qr.vaultUrl)}><Copy size={18} /> Copy URL</button>
          <a className="secondary-button" href={qr.vaultUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Open</a>
          <button className="secondary-button" onClick={() => setShowDesignStudio(true)}><Palette size={18} /> Design QR Code</button>
          <button className="primary-button" onClick={() => setShowDownloadModal(true)} disabled={busyAction === 'download' || busyAction === 'download-svg'}>
            <Download size={18} /> Download
          </button>
          <button className="danger-button" onClick={recycle} disabled={busyAction === 'recycle'}><Trash2 size={18} /> Recycle</button>
        </div>
      </div>
      <div className="detail-layout">
        <form className="detail-panel" onSubmit={saveQr}>
          <h2>Content Details</h2>
          <div className="field"><label>QR Name</label><input value={qr.name} onChange={(e) => setData({ ...data, qr: { ...qr, name: e.target.value } })} /></div>
          <div className="field"><label>Description</label><textarea value={qr.description} onChange={(e) => setData({ ...data, qr: { ...qr, description: e.target.value } })} /></div>
          <div className="field"><label>Status</label><select value={qr.status} onChange={(e) => setData({ ...data, qr: { ...qr, status: e.target.value } })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <button className="primary-button" disabled={busyAction === 'save'}><Save size={18} /> {busyAction === 'save' ? 'Saving...' : 'Save Changes'}</button>
        </form>
        <aside className="detail-panel">
          <h2>QR Preview</h2>
          <div className="qr-detail-preview">
            <QRCanvas data={qr.vaultUrl} design={effectiveDesign} logoPath={effectiveLogoPath} frameImagePath={effectiveFrameImagePath} qrName={qr.name} qrPixelSize={280} />
          </div>
          <p className="qr-detail-design-tag">
            {qr.useCustomDesign ? 'Custom design' : (parentCollectionId ? "Using this collection's design" : 'Default design')}
          </p>
          <h2>QR Metadata</h2>
          <dl className="meta-list">
            <div><dt>Created</dt><dd>{formatDate(qr.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDate(qr.updatedAt)}</dd></div>
            <div><dt>Total Size</dt><dd>{formatBytes(qr.sizeBytes)}</dd></div>
            {collectionPdf && (
              <div><dt>Collection</dt><dd>{collectionPdf.collectionName}</dd></div>
            )}
          </dl>
        </aside>
      </div>

      {showDownloadModal && (
        <Modal title={`Download "${qr.name}"`} onClose={() => setShowDownloadModal(false)}>
          <div className="download-options">
            <p className="field-hint">Choose a format to download this QR.</p>
            <div className="button-row">
              <button className="secondary-button" onClick={async () => { await downloadQr(); setShowDownloadModal(false); }} disabled={busyAction === 'download'}>
                {busyAction === 'download' ? <span className="spinner small-spinner" /> : <Download size={16} />} PNG
              </button>
              <button className="secondary-button" onClick={async () => { await downloadQrSvg(); setShowDownloadModal(false); }} disabled={busyAction === 'download-svg'}>
                {busyAction === 'download-svg' ? <span className="spinner small-spinner" /> : <FileImage size={16} />} SVG
              </button>
            </div>
          </div>
        </Modal>
      )}

      <section className="detail-panel files-panel">
        <div className="files-head">
          <h2>Files</h2>
          <span className="file-count">{uploads.length} of 4 uploaded{collectionPdf ? ` + 1 collection PDF` : ''}</span>
        </div>

        {uploads.length < 4 && (
          <label className="drop-zone">
            <input hidden type="file" multiple onChange={(event) => {
              Array.from(event.target.files || []).slice(0, 4 - uploads.length).forEach((file, idx) => {
                setSelectedFiles((current) => current.map((item, i) => (i === idx && !item ? file : item)));
              });
              event.target.value = '';
            }} disabled={uploadingFiles.length > 0} />
            <UploadCloud size={28} />
            <span className="drop-label">Drop files here or <strong>click to browse</strong></span>
            <span className="drop-hint">Up to 4 files total</span>
          </label>
        )}

        <div className="file-queue">
          {queuedFiles.length > 0 && (
            <div className="queue-section">
              <span className="queue-title">Ready to upload</span>
              {queuedFiles.map((file, index) => (
                <div className="queued-file" key={`${file.name}-${index}`}>
                  <div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                  <button type="button" onClick={() => clearUploadSlot(selectedFiles.indexOf(file))} className="remove-btn" aria-label="Remove from queue"><X size={16} /></button>
                </div>
              ))}
              <button className="primary-button upload-btn" onClick={uploadFiles} disabled={uploadingFiles.length > 0}>
                <UploadCloud size={18} /> {uploadingFiles.length ? 'Uploading...' : `Upload ${queuedFiles.length}`}
              </button>
            </div>
          )}

          {uploads.map((file, index) => (
            <article
              className={`file-row ${dragIndex === index ? 'dragging' : ''}`}
              draggable
              key={file._id}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { reorderFiles(dragIndex, index); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
            >
              <div className="file-title">
                <GripVertical size={18} aria-hidden="true" />
                <div>
                  <strong>{file.originalName}</strong>
                  <span>{file.category} - {formatBytes(file.sizeBytes)}</span>
                </div>
              </div>
              <div className="file-actions">
                <button className="icon-button" onClick={() => reorderFiles(index, index - 1)} disabled={index === 0 || busyAction === 'reorder'} title="Move up"><ArrowUp size={14} /></button>
                <button className="icon-button" onClick={() => reorderFiles(index, index + 1)} disabled={index === uploads.length - 1 || busyAction === 'reorder'} title="Move down"><ArrowDown size={14} /></button>
                <a className="icon-button" href={fileUrl(`/api/vault/${qr.token}/files/${file._id}/download`)} title="Download"><Download size={16} /></a>
                <label className="icon-button" title="Replace file">
                  {busyAction === `replace-${file._id}` ? <span className="spinner small-spinner" /> : <RefreshCw size={14} />}
                  <input hidden type="file" onChange={(event) => replaceFile(file._id, event)} />
                </label>
                <button className="icon-button danger" onClick={() => removeFile(file._id)} disabled={busyAction === `remove-${file._id}`} aria-label="Remove file"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}

          {/* Collection PDF (read-only) */}
          {collectionPdf && (
            <article className="file-row file-row-collection">
              <div className="file-title">
                <FileText size={18} className="col-pdf-icon" />
                <div>
                  <strong>{collectionPdf.originalName}</strong>
                  <span>Collection PDF - {collectionPdf.collectionName} - {formatBytes(collectionPdf.sizeBytes)}</span>
                </div>
              </div>
              <div className="file-actions">
                <span className="col-pdf-tag">Auto</span>
              </div>
            </article>
          )}

          {!uploads.length && !uploadingFiles.length && !queuedFiles.length && !collectionPdf && (
            <article className="empty-files">
              <strong>No files yet.</strong>
              <span>Upload up to 4 files to this vault.</span>
            </article>
          )}
        </div>
      </section>

      {modalError && (
        <Modal title="File Upload Rejected" onClose={() => setModalError(null)}>
          {modalError.map((line) => <p key={line}>{line}</p>)}
          <button className="primary-button" onClick={() => setModalError(null)}>OK</button>
        </Modal>
      )}

      {showDesignStudio && (
        <QRDesignStudio
          scope="qr"
          qr={qr}
          collection={{ name: qr.collectionName, design: collectionDesign }}
          onClose={() => setShowDesignStudio(false)}
          onSaved={load}
        />
      )}
    </section>
  );
}
