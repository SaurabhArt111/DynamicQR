import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, FolderOpen, Files, Grid2X2, LogOut, Menu, Moon, QrCode, Recycle, Settings, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { useTheme } from './context/ThemeContext.jsx';
import { routes } from './routes/paths.js';
import './App.css';

const appName = import.meta.env.VITE_APP_NAME || 'DynamicVault QR';
const nav = [
  { to: routes.dashboard, label: 'Overview', icon: BarChart3, end: true },
  { to: routes.modules, label: 'Modules', icon: Grid2X2 },
  { to: routes.collections, label: 'Collections', icon: FolderOpen },
  { to: routes.qrcodes, label: 'QR Codes', icon: QrCode },
  { to: routes.settings, label: 'Settings', icon: Settings },
  { to: routes.recycleBin, label: 'Recycle Bin', icon: Recycle },
  { to: routes.files, label: 'Uploads', icon: Files }
];

export default function App() {
  const { logout, admin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleLogout() { logout(); navigate(routes.login); }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand"><span className="brand-mark"><QrCode size={19} /></span><span>{appName}</span></div>
        </div>
        <div className="workspace-card"><span className="workspace-dot"/><div><strong>Admin workspace</strong><small>{admin?.email || 'Control center'}</small></div></div>
        <nav className="nav-links desktop-nav">
          {nav.map(({to,label,icon:Icon,end}) => <NavLink key={label} to={to} end={end} onClick={() => setOpen(false)}><Icon size={18}/><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="theme-toggle-rail" onClick={toggleTheme} aria-label="Toggle theme"><span className={theme === 'linen' ? 'active' : ''}><Sun size={14}/>Light</span><span className={theme === 'dark' ? 'active' : ''}><Moon size={14}/>Dark</span></button>
          <button className="logout-button" onClick={handleLogout}><LogOut size={18}/><span>Sign out</span></button>
        </div>
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
      <main className="main-panel">
        <header className="mobile-topbar"><button className="icon-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><strong>{appName}</strong><button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button></header>
        <Outlet />
      </main>
      <div className="mobile-bottom-nav">{nav.slice(0,5).map(({to,label,icon:Icon,end}) => <NavLink key={label} to={to} end={end}><Icon size={19}/><span>{label === 'Overview' ? 'Home' : label}</span></NavLink>)}</div>
    </div>
  );
}
