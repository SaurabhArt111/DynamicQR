import { BarChart3, FolderOpen, Files, QrCode, Recycle, Settings, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '../routes/paths.js';
import './Modules.css';
const modules=[
 ['Overview','Live operational metrics and recent activity.',BarChart3,routes.dashboard],
 ['Collections','Organize QR assets into structured groups.',FolderOpen,routes.collections],
 ['QR Codes','Create, design, publish and manage dynamic codes.',QrCode,routes.qrcodes],
 ['Uploads','Read-only browser for every file stored on the server.',Files,routes.files],
 ['Recycle Bin','Recover soft-deleted QR codes and collections.',Recycle,routes.recycleBin],
 ['Settings','Workspace configuration and administrative controls.',Settings,routes.settings]
];
export default function Modules(){return <section className="page modules-page"><div className="page-header"><div><span className="eyebrow">Workspace map</span><h1>Modules</h1><p>A clean entry point to every part of the DynamicVault control room.</p></div></div><div className="modules-grid">{modules.map(([title,text,Icon,to])=><Link className="module-card" to={to} key={title}><div className="module-icon"><Icon size={20}/></div><div><strong>{title}</strong><p>{text}</p></div><ArrowUpRight size={17}/></Link>)}</div></section>}
