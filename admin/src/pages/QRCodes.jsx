import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileImage, Palette, Plus, Search, Trash } from 'lucide-react';
import { api, getErrorMessage } from '../api/http.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import QRCanvas from '../components/QRCanvas.jsx';
import QRDesignStudio from '../components/QRDesignStudio.jsx';
import { resolveDesignAndLogoUrl } from '../utils/designHelpers.js';
import { downloadSingleQrPng, downloadSingleQrSvg } from '../utils/qrExport.js';
import { routes } from '../routes/paths.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './QRCodes.css';

export default function QRCodes() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState({ search: '', filter: 'new', page: 1 });
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 1 });
  const [modal, setModal] = useState(null);
  const [downloadQrTarget, setDownloadQrTarget] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [designingQr, setDesigningQr] = useState(null);

  async function recycleQr(qrId) {
    try {
      await api.delete(`/qrcodes/${qrId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to recycle QR.');
    }
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/qrcodes', {
        params: { search: query.search, filter: query.filter, page: query.page, limit: 24 }
      });
      setItems(data.items);
      setPageInfo({ total: data.total, pages: data.pages || 1 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [query.filter, query.page]);

  function runSearch() {
    setQuery((current) => (current.page === 1 ? { ...current } : { ...current, page: 1 }));
    // If we were already on page 1, the effect above won't re-fire on its
    // own since `page` didn't change — trigger the search directly.
    if (query.page === 1) load();
  }

  function goToPage(nextPage) {
    setQuery((current) => ({ ...current, page: Math.min(Math.max(nextPage, 1), pageInfo.pages || 1) }));
  }

  async function createQr(event) {
    event.preventDefault();
    setBusyAction('create');
    try {
      await api.post('/qrcodes', form);
      setForm({ name: '', description: '' });
      setModal(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create QR.');
    } finally {
      setBusyAction('');
    }
  }

  async function downloadQr(qr) {
    setBusyAction(`download-${qr._id}`);
    try {
      const { design, logoPath, frameImagePath } = resolveDesignAndLogoUrl(qr, qr.collectionDesign);
      await downloadSingleQrPng({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the QR image.'));
    } finally {
      setBusyAction('');
    }
  }

  async function downloadQrSvg(qr) {
    setBusyAction(`download-svg-${qr._id}`);
    try {
      const { design, logoPath, frameImagePath } = resolveDesignAndLogoUrl(qr, qr.collectionDesign);
      await downloadSingleQrSvg({ vaultUrl: qr.vaultUrl, design, logoPath, frameImagePath, qrName: qr.name, filenameBase: qr.name });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the QR SVG.'));
    } finally {
      setBusyAction('');
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>QR Codes</h1>
          <p>All QR codes across all collections and standalone.</p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={() => setModal('create')}><Plus size={18} /> Create QR</button>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="qr-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Search by QR name or ID"
            value={query.search}
            onChange={(e) => setQuery({ ...query, search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
        </div>
        <select value={query.filter} onChange={(e) => setQuery({ ...query, filter: e.target.value, page: 1 })}>
          <option value="active">Active</option>
          <option value="new">New First</option>
          <option value="old">Old First</option>
          <option value="az">From A to Z</option>
          <option value="za">From Z to A</option>
          <option value="edited">Last Edit</option>
        </select>
        <button className="secondary-button" onClick={runSearch} disabled={loading}><Search size={18} /> {loading ? 'Searching...' : 'Search'}</button>
      </div>
      <div className="qr-grid">
        {loading && Array.from({ length: 6 }).map((_, index) => (
          <article className="qr-card qr-card-skeleton" key={index}>
            <span /><p /><dl><div /><div /><div /></dl>
          </article>
        ))}
        {!loading && items.map((qr) => {
          const { design: cardDesign, logoPath: cardLogoPath, frameImagePath: cardFrameImagePath } = resolveDesignAndLogoUrl(qr, qr.collectionDesign);
          return (
            <article className="qr-card" key={qr._id}>
              <div className="qr-card-head">
                <div className="qr-card-thumb">
                  <QRCanvas data={qr.vaultUrl} design={cardDesign} logoPath={cardLogoPath} frameImagePath={cardFrameImagePath} qrName={qr.name} qrPixelSize={140} />
                </div>
                <div>
                  <strong>{qr.name}</strong>
                  <span>{qr.token}</span>
                </div>
              </div>
              <p className="qr-card-description">{qr.description || 'No description'}</p>
              <dl className="qr-card-meta">
                <div className="qr-card-meta-item">
                  <dt>Size</dt>
                  <dd>{formatBytes(qr.sizeBytes)}</dd>
                </div>
                <div className="qr-card-meta-item">
                  <dt>Status</dt>
                  <dd>{qr.status}</dd>
                </div>
                <div className="qr-card-meta-item">
                  <dt>Collection</dt>
                  <dd>{qr.collectionName || 'Standalone'}</dd>
                </div>
                <div className="qr-card-meta-item">
                  <dt>Updated</dt>
                  <dd>{formatDate(qr.updatedAt)}</dd>
                </div>
              </dl>
              <div className="button-row">
                <Link className="primary-button" to={routes.qrcode(qr._id)}>Manage</Link>
                <button className="icon-button" title="Design this QR" onClick={() => setDesigningQr(qr)}>
                  <Palette size={18} />
                </button>
                <button className="icon-button" title="Download" onClick={() => { setDownloadQrTarget(qr); setModal('download-qr'); }} disabled={!!busyAction}>
                  <Download size={18} />
                </button>
                <button className="icon-button" title="Recycle QR" onClick={() => {
                  if (window.confirm('Recycle this QR?')) recycleQr(qr._id);
                }}>
                  <Trash size={18} style={{ color: 'red' }} />
                </button>
              </div>
            </article>
          );
        })}
        {!loading && !items.length && <div className="qr-empty">No QR codes found.</div>}
      </div>

      {!loading && pageInfo.total > 0 && (
        <div className="qr-pagination">
          <span className="qr-pagination-summary">
            {pageInfo.total} QR code{pageInfo.total === 1 ? '' : 's'} &middot; Page {query.page} of {pageInfo.pages}
          </span>
          <div className="qr-pagination-buttons">
            <button className="secondary-button" onClick={() => goToPage(query.page - 1)} disabled={query.page <= 1}>Previous</button>
            <button className="secondary-button" onClick={() => goToPage(query.page + 1)} disabled={query.page >= pageInfo.pages}>Next</button>
          </div>
        </div>
      )}
      {modal === 'create' && (
        <Modal title="Create QR" onClose={() => setModal(null)}>
          <form onSubmit={createQr}>
            <div className="field"><label>QR Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <button className="primary-button" disabled={busyAction === 'create'}>{busyAction === 'create' ? 'Creating...' : 'Create'}</button>
          </form>
        </Modal>
      )}

      {modal === 'download-qr' && downloadQrTarget && (
        <Modal title={`Download "${downloadQrTarget.name}"`} onClose={() => { setModal(null); setDownloadQrTarget(null); }}>
          <div className="download-options">
            <p className="field-hint">Choose a format to download this QR.</p>
            <div className="button-row">
              <button className="secondary-button" onClick={() => { downloadQr(downloadQrTarget); setModal(null); setDownloadQrTarget(null); }} disabled={busyAction === `download-${downloadQrTarget._id}`}>
                {busyAction === `download-${downloadQrTarget._id}` ? <span className="spinner small-spinner" /> : <Download size={16} />} PNG
              </button>
              <button className="secondary-button" onClick={() => { downloadQrSvg(downloadQrTarget); setModal(null); setDownloadQrTarget(null); }} disabled={busyAction === `download-svg-${downloadQrTarget._id}`}>
                {busyAction === `download-svg-${downloadQrTarget._id}` ? <span className="spinner small-spinner" /> : <FileImage size={16} />} SVG
              </button>
            </div>
          </div>
        </Modal>
      )}

      {designingQr && (
        <QRDesignStudio
          scope="qr"
          qr={designingQr}
          collection={{ name: designingQr.collectionName, design: designingQr.collectionDesign }}
          onClose={() => setDesigningQr(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}
