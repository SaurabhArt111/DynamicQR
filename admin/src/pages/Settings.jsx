import { useEffect, useState } from 'react';
import { Database, Download, KeyRound, LogOut, Palette, Save, ShieldCheck, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';
import { themes, useTheme } from '../context/ThemeContext.jsx';
import { routes } from '../routes/paths.js';
import { formatBytes, formatDate } from '../utils/format.js';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/settings/overview');
      setOverview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load settings overview.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy('password');
    setError('');
    setMessage('');
    try {
      await api.post('/auth/change-password', form);
      setForm({ currentPassword: '', newPassword: '' });
      setMessage('Password changed successfully.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to change password.');
    } finally {
      setBusy('');
    }
  }

  async function submitPin(event) {
    event.preventDefault();
    setBusy('pin');
    setError('');
    setMessage('');
    try {
      await api.post('/auth/change-recycle-pin', pinForm);
      setPinForm({ currentPin: '', newPin: '' });
      setMessage('Recycle bin PIN changed successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to change PIN.');
    } finally {
      setBusy('');
    }
  }

  async function exportBackup() {
    setBusy('export');
    setError('');
    try {
      const response = await api.get('/settings/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dynamic-qr-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to export backup.');
    } finally {
      setBusy('');
    }
  }

  function signOut() {
    logout();
    navigate(routes.login);
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Account, security, storage, theming, exports, and administrative safeguards for the DynamicVault QR workspace.</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="settings-grid">
        <section className="settings-panel">
          <h2><UserCircle2 size={19} /> Account</h2>
          <dl className="settings-meta-list">
            <div><dt>Email</dt><dd>{overview?.account?.email || 'Loading...'}</dd></div>
            <div><dt>Created</dt><dd>{overview?.account?.createdAt ? formatDate(overview.account.createdAt) : 'Loading...'}</dd></div>
            <div><dt>Last login</dt><dd>{overview?.account?.lastLoginAt ? formatDate(overview.account.lastLoginAt) : 'Not available'}</dd></div>
            <div><dt>Password changed</dt><dd>{overview?.account?.passwordChangedAt ? formatDate(overview.account.passwordChangedAt) : 'Not yet recorded'}</dd></div>
          </dl>
        </section>

        <section className="settings-panel">
          <h2><Database size={19} /> Storage</h2>
          <div className="settings-stat-grid">
            <article><strong>{overview?.storage?.totalCollections ?? 0}</strong><span>Collections</span></article>
            <article><strong>{overview?.storage?.totalQrs ?? 0}</strong><span>QR codes</span></article>
            <article><strong>{overview?.storage?.activeUploads ?? 0}</strong><span>Active uploads</span></article>
            <article><strong>{overview?.storage?.recycleItems ?? 0}</strong><span>Recycle items</span></article>
          </div>
          <p className="settings-storage-note">Current active storage usage: <strong>{formatBytes(overview?.storage?.usageBytes || 0)}</strong></p>
        </section>

        <form className="settings-panel" onSubmit={submit}>
          <h2><ShieldCheck size={19} /> Security</h2>
          <div className="field"><label>Current Password</label><input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></div>
          <div className="field"><label>New Password</label><input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required minLength={8} /></div>
          <button className="primary-button" disabled={busy === 'password'}><Save size={18} /> {busy === 'password' ? 'Saving...' : 'Save Password'}</button>
        </form>

        <form className="settings-panel" onSubmit={submitPin}>
          <h2><KeyRound size={19} /> Recycle Bin Security</h2>
          <div className="field"><label>Current PIN</label><input value={pinForm.currentPin} onChange={(e) => setPinForm({ ...pinForm, currentPin: e.target.value })} maxLength={4} inputMode="numeric" required /></div>
          <div className="field"><label>New PIN</label><input value={pinForm.newPin} onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value })} maxLength={4} inputMode="numeric" required /></div>
          <button className="primary-button" disabled={busy === 'pin'}><Save size={18} /> {busy === 'pin' ? 'Saving...' : 'Save PIN'}</button>
        </form>

        <section className="settings-panel">
          <h2><Palette size={19} /> Theme</h2>
          <div className="theme-grid">
            {themes.map((option) => (
              <button
                type="button"
                key={option.id}
                data-theme-id={option.id}
                className={`theme-card ${theme === option.id ? 'active' : ''}`}
                onClick={() => setTheme(option.id)}
              >
                <span className="theme-card-swatch" aria-hidden="true">
                  <i className="swatch-bg" />
                  <i className="swatch-primary" />
                  <i className="swatch-accent" />
                </span>
                <strong>{option.label}</strong>
                <span>{theme === option.id ? 'Active workspace theme' : option.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-panel">
          <h2><Download size={19} /> Backup / Export</h2>
          <p className="settings-note">Download a JSON export containing collections, QR codes, uploads, and recycle-bin records for operational backup and migration review.</p>
          <button className="secondary-button" onClick={exportBackup} disabled={busy === 'export'}>
            <Download size={18} />
            {busy === 'export' ? 'Preparing export...' : 'Download JSON Export'}
          </button>
        </section>

        <section className="settings-panel settings-danger">
          <h2><LogOut size={19} /> Danger Zone</h2>
          <p className="settings-note">Permanent removal of deleted data is handled from the Recycle Bin. Use this area for high-impact session actions and final safety checks.</p>
          <div className="button-row">
            <button className="danger-button" onClick={() => navigate(routes.recycleBin)}>
              Open Recycle Bin
            </button>
            <button className="secondary-button" onClick={signOut}>
              <LogOut size={18} />
              Logout This Session
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
