import { ArrowRight, CheckCircle2, FolderOpen, Layers3, Moon, QrCode, ScanLine, Sparkles, Sun, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../context/ThemeContext.jsx';
import './Landing.css';

const name = import.meta.env.VITE_APP_NAME || 'DynamicQR';

export default function Landing() {
    const { theme, toggleTheme } = useTheme();
    const [qrDataUrl, setQrDataUrl] = useState('');

    useEffect(() => {
        const landingUrl = window.location.origin;

        QRCode.toDataURL(landingUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 180,
            color: { dark: '#211d19', light: '#fffdf7' },
        }).then(setQrDataUrl);
    }, []);

    return <main className="public-landing">
        <header className="public-nav"><a className="public-brand" href="/"><span><QrCode size={18} /></span>{name}</a><nav><a href="#features">Features</a><a href="#flow">How it works</a><a href="#formats">Formats</a><button className="public-theme" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} {theme === 'dark' ? 'Light' : 'Dark'}</button></nav></header>
        <section className="public-hero"><div className="hero-copy"><div className="public-kicker"><Sparkles size={14} /> Dynamic content, one printed code</div><h1>Scan once.<br /><em>Always see the latest.</em></h1><p>DynamicQR turns a QR code into a clean, responsive content page for product sheets, manuals, galleries, videos and more. The printed code stays the same while your content evolves.</p><div className="hero-actions"><a className="hero-primary" href="#flow">Explore the experience <ArrowRight size={17} /></a><a className="hero-secondary" href="#formats">Supported formats</a></div><div className="hero-proof"><span><CheckCircle2 size={15} /> No app required</span><span><CheckCircle2 size={15} /> Mobile-first viewer</span><span><CheckCircle2 size={15} /> Live content</span></div></div><div className="hero-art"><div className="scan-orbit orbit-a" /><div className="scan-orbit orbit-b" /><div className="phone-frame"><div className="phone-notch" /><div className="phone-screen"><div className="mini-top"><span>DynamicQR</span><span className="live-dot" /></div><div className="mini-qr">{qrDataUrl && <img src={qrDataUrl} alt="Scan to open the DynamicQR landing page" />}</div><strong>Product Catalogue</strong><small>Updated just now</small><div className="mini-file"><FolderOpen size={16} /><div><b>Catalogue.pdf</b><small>8.4 MB</small></div></div><div className="mini-file"><Layers3 size={16} /><div><b>Installation Guide</b><small>PDF · 12 pages</small></div></div></div></div><div className="float-pill scan-pill"><ScanLine size={15} /> QR → viewer</div><div className="float-pill live-pill"><Zap size={15} /> Live destination</div></div></section>
        <section className="public-strip"><div><b>01</b><span>Print</span></div><div><b>02</b><span>Scan</span></div><div><b>03</b><span>View</span></div><div><b>04</b><span>Update anytime</span></div></section>
        <section id="features" className="public-section"><div className="section-heading"><span>Why it feels better</span><h2>A viewer designed for the person holding the phone.</h2><p>The public side stays focused: no admin controls, no login, no clutter — just your content, presented beautifully on desktop and mobile.</p></div><div className="feature-grid">{[['Instant', 'Open a QR destination directly on the public domain.'], ['Responsive', 'The same page adapts into a purpose-built mobile or desktop layout.'], ['Flexible', 'Images, PDF, video, audio and supported documents can live behind one code.'], ['Animated', 'Subtle transitions and loading states make the experience feel intentional.']].map(([t, d]) => <article key={t}><span>{t[0]}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
        <section id="flow" className="public-section dark-band"><div className="section-heading"><span>How it works</span><h2>One public destination, separate from the control room.</h2></div><div className="flow-grid"><div><b>01</b><strong>Admin creates a QR</strong><p>The admin workspace publishes a token using your public domain.</p></div><div><b>02</b><strong>Customer scans it</strong><p>The printed QR opens the public landing/viewer application directly.</p></div><div><b>03</b><strong>Content loads</strong><p>The viewer asks the backend for the current files and renders the best experience for the device.</p></div></div></section>
        <section id="formats" className="public-section formats"><div className="section-heading"><span>Formats</span><h2>Everything important, without the admin UI.</h2></div><div className="format-list"><span>Images</span><span>PDF</span><span>Video</span><span>Audio</span><span>Text</span><span>CSV</span></div></section>
        <footer className="public-footer"><span>© {new Date().getFullYear()} {name}</span><span>Public viewer · Admin separated by domain</span></footer>
    </main>
}
