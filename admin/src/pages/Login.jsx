import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { ArrowLeft, Lock, LogIn, QrCode, ShieldCheck } from 'lucide-react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';
import { routes } from '../routes/paths.js';
import './Login.css';

const appName = import.meta.env.VITE_APP_NAME || 'DynamicVault QR';
const publicUrl = import.meta.env.VITE_PUBLIC_APP_URL || '/';

export default function Login() {
  const { login, token } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in
  if (token) {
    return <Navigate to={routes.dashboard} replace />;
  }

  async function submit(event) {
    event.preventDefault();

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', form);

      login(data);

      navigate(routes.dashboard, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Login failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-side" aria-hidden="true">
        <div className="login-side-content">
          <span className="login-side-mark"><QrCode size={22} /></span>
          <h2>The control room for every scan.</h2>
          <p>Collections, dynamic QR codes, and a governed recycle bin — all behind one secure sign-in.</p>
          <div className="login-side-badge"><ShieldCheck size={15} /> JWT protected session</div>
        </div>
      </div>

      <form className="login-panel" onSubmit={submit}>
        <a href={publicUrl} className="login-back-link">
          <ArrowLeft size={14} /> Back to home
        </a>

        <div className="login-brand">
          <QrCode size={22} />
          <span>{appName}</span>
        </div>

        <h1>Admin login</h1>
        <p>Secure access for the organization administrator.</p>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value
              })
            }
            placeholder="Enter your email"
            required
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm({
                ...form,
                password: e.target.value
              })
            }
            placeholder="Enter your password"
            required
          />
        </div>

        <button
          type="submit"
          className="primary-button"
          disabled={loading}
        >
          <LogIn size={18} />
          {loading ? 'Signing in...' : 'Login'}
        </button>

        <div className="login-lock">
          <Lock size={15} />
          JWT protected session
        </div>
      </form>
    </main>
  );
}
