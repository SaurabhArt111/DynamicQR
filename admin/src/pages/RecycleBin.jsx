import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader, RotateCcw, Search, Square, Trash2 } from 'lucide-react';
import { api } from '../api/http.js';
import Modal from '../components/Modal.jsx';
import { formatDate } from '../utils/format.js';
import './RecycleBin.css';

const emptyQuery = { search: '', type: 'all', sort: 'newest' };

export default function RecycleBin() {
  const [items, setItems] = useState([]);
  const [pin, setPin] = useState('');
  const [verified, setVerified] = useState(false);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState(emptyQuery);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/recycle-bin', { params: query });
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item._id === id)));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load recycle bin items.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (verified) load();
  }, [verified, query.search, query.type, query.sort]);

  const allVisibleSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.includes(item._id)),
    [items, selectedIds]
  );

  async function verify(event) {
    event.preventDefault();
    setBusy('verify');
    try {
      await api.post('/auth/verify-recycle-pin', { pin });
      setVerified(true);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid PIN.');
    } finally {
      setBusy('');
    }
  }

  async function restore(id) {
    setBusy(`restore-${id}`);
    try {
      await api.post(`/recycle-bin/${id}/restore`, { pin });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to restore this item.');
    } finally {
      setBusy('');
    }
  }

  async function restoreSelected() {
    if (!selectedIds.length) return;
    setBusy('restore-many');
    try {
      await api.post('/recycle-bin/restore-many', { ids: selectedIds, pin });
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to restore selected items.');
    } finally {
      setBusy('');
    }
  }

  async function purgeSingle() {
    setBusy('purge');
    try {
      await api.delete(`/recycle-bin/${target}`, { data: { pin } });
      setTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete this item permanently.');
    } finally {
      setBusy('');
    }
  }

  async function purgeSelected() {
    if (!selectedIds.length) return;
    setBusy('purge-many');
    try {
      await api.delete('/recycle-bin/purge-many', { data: { ids: selectedIds, pin } });
      setSelectedIds([]);
      setTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete selected items permanently.');
    } finally {
      setBusy('');
    }
  }

  function toggleSelection(id) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleSelectAll() {
    setSelectedIds((current) => (
      allVisibleSelected ? current.filter((id) => !items.some((item) => item._id === id)) : items.map((item) => item._id)
    ));
  }

  function itemLabel(entry) {
    if (entry.itemType === 'collection') return 'Collection';
    if (entry.itemType === 'upload') return 'File';
    return 'QR code';
  }

  function itemName(entry) {
    return entry.qrCode?.name || entry.collection?.name || entry.upload?.originalName || entry.snapshot?.name || entry.snapshot?.originalName;
  }

  if (!verified) {
    return (
      <section className="pin-page">
        <form className="pin-panel" onSubmit={verify}>
          <h1>Recycle Bin PIN</h1>
          <p>Enter the 4 digit PIN to manage deleted QR codes, collections, and files.</p>
          {error && <div className="error-box">{error}</div>}
          <div className="field"><label>PIN</label><input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={4} inputMode="numeric" /></div>
          <button className="primary-button" disabled={busy === 'verify'}>
            {busy === 'verify' ? <><Loader size={18} className="spin" /> Checking...</> : 'Enter'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Recycle Bin</h1>
          <p>Search, filter, restore, and permanently remove deleted collections, QR codes, and files.</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <section className="recycle-toolbar surface-panel">
        <div className="recycle-query-row">
          <label className="search-box recycle-search">
            <Search size={18} />
            <input
              placeholder="Search deleted names, tokens, and descriptions"
              value={query.search}
              onChange={(e) => setQuery((current) => ({ ...current, search: e.target.value }))}
            />
          </label>
          <select className="secondary-button" value={query.type} onChange={(e) => setQuery((current) => ({ ...current, type: e.target.value }))}>
            <option value="all">All items</option>
            <option value="collection">Collections</option>
            <option value="qr">QR codes</option>
            <option value="upload">Files</option>
          </select>
          <select className="secondary-button" value={query.sort} onChange={(e) => setQuery((current) => ({ ...current, sort: e.target.value }))}>
            <option value="newest">Newest deleted</option>
            <option value="oldest">Oldest deleted</option>
            <option value="name">Name</option>
            <option value="type">Type</option>
          </select>
          <button className="secondary-button" onClick={load} disabled={loading}>
            {loading ? <Loader size={18} className="spin" /> : <Search size={18} />}
            Refresh
          </button>
        </div>

        <div className="recycle-bulk-row">
          <button className="secondary-button" onClick={toggleSelectAll} disabled={!items.length}>
            {allVisibleSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            {allVisibleSelected ? 'Clear Selection' : 'Select All'}
          </button>
          <span className="recycle-selection-note">{selectedIds.length} selected</span>
          <button className="secondary-button" onClick={restoreSelected} disabled={!selectedIds.length || busy === 'restore-many'}>
            {busy === 'restore-many' ? <Loader size={18} className="spin" /> : <RotateCcw size={18} />}
            Restore selected
          </button>
          <button className="danger-button" onClick={() => setTarget('bulk')} disabled={!selectedIds.length || busy === 'purge-many'}>
            {busy === 'purge-many' ? <Loader size={18} className="spin" /> : <Trash2 size={18} />}
            Delete selected
          </button>
        </div>
      </section>

      <div className="recycle-list">
        {loading && Array.from({ length: 4 }).map((_, index) => (
          <article className="recycle-row recycle-row-skeleton" key={index}>
            <div className="recycle-select-cell"><span /></div>
            <div>
              <strong />
              <span />
            </div>
            <div className="button-row">
              <span />
              <span />
            </div>
          </article>
        ))}

        {!loading && items.map((entry) => (
          <article className="recycle-row" key={entry._id}>
            <button className="recycle-check" onClick={() => toggleSelection(entry._id)} title="Select item">
              {selectedIds.includes(entry._id) ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <div className="recycle-item-copy">
              <strong>{itemName(entry)}</strong>
              <span><b>{itemLabel(entry)}</b> - Deleted {formatDate(entry.deletedAt)}</span>
            </div>
            <div className="button-row">
              <button className="secondary-button" onClick={() => restore(entry._id)} disabled={busy === `restore-${entry._id}`}>
                {busy === `restore-${entry._id}` ? <Loader size={18} className="spin" /> : <RotateCcw size={18} />}
                Restore
              </button>
              <button className="danger-button" onClick={() => setTarget(entry._id)} disabled={!!busy && busy !== 'purge'}>
                <Trash2 size={18} />
                Delete
              </button>
            </div>
          </article>
        ))}

        {!loading && !items.length && <p className="recycle-empty">No deleted items match this view.</p>}
      </div>

      {target && (
        <Modal
          title={target === 'bulk' ? 'Permanently Delete Selected Items' : 'Permanently Delete Item'}
          onClose={() => setTarget(null)}
        >
          <p>This cannot be undone. Related uploaded files and collection PDF files will also be removed.</p>
          <button
            className="danger-button"
            onClick={target === 'bulk' ? purgeSelected : purgeSingle}
            disabled={busy === 'purge' || busy === 'purge-many'}
          >
            {(busy === 'purge' || busy === 'purge-many') ? <><Loader size={18} className="spin" /> Deleting...</> : 'Confirm Permanent Delete'}
          </button>
        </Modal>
      )}
    </section>
  );
}
