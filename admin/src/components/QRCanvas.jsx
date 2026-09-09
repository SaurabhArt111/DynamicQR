import { useEffect, useRef, useState } from 'react';
import { renderQrCanvas } from '../utils/qrEngine.js';
import { loadAuthenticatedImage } from '../utils/designHelpers.js';
import './QRCanvas.css';

/**
 * Renders a live, fully-styled preview of a QR code (patterns, corners,
 * colors, logo, frame) onto a <canvas>. Re-renders whenever the data or
 * design changes — this is the single source of truth for "what the QR
 * looks like", shared by the design studio, the QR detail page, and the
 * collection grid thumbnails.
 *
 * Loading the logo/frame images is kept in its own effect, separate from
 * the render effect, and keyed only on the image *paths* — not the whole
 * design object. Otherwise every keystroke on an unrelated slider (e.g.
 * "QR size in frame") would re-fetch and re-decode images that haven't
 * actually changed, which is what made those controls feel sluggish.
 */
export default function QRCanvas({ data, design, logoPath, frameImagePath, qrName = '', qrPixelSize = 320, className = '' }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState('');
  const [logoImg, setLogoImg] = useState(null);
  const [frameImg, setFrameImg] = useState(null);
  const designKey = JSON.stringify(design || {});

  useEffect(() => {
    let cancelled = false;
    let revoke = () => {};
    loadAuthenticatedImage(logoPath).then((result) => {
      revoke = result.revoke;
      if (!cancelled) setLogoImg(result.image);
    });
    return () => { cancelled = true; revoke(); };
  }, [logoPath]);

  useEffect(() => {
    let cancelled = false;
    let revoke = () => {};
    loadAuthenticatedImage(frameImagePath).then((result) => {
      revoke = result.revoke;
      if (!cancelled) setFrameImg(result.image);
    });
    return () => { cancelled = true; revoke(); };
  }, [frameImagePath]);

  useEffect(() => {
    let cancelled = false;

    renderQrCanvas({
      data: data || ' ',
      design,
      logoImageEl: logoImg,
      frameImageEl: frameImg,
      qrName,
      qrPixelSize
    }).then((rendered) => {
      if (cancelled) return;
      const target = canvasRef.current;
      if (!target) return;
      target.width = rendered.width;
      target.height = rendered.height;
      const ctx = target.getContext('2d');
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(rendered, 0, 0);
      setError('');
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Could not render QR preview.');
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, designKey, logoImg, frameImg, qrName, qrPixelSize]);

  return (
    <div className={`qr-canvas-frame ${className}`}>
      <canvas ref={canvasRef} />
      {error && <div className="qr-canvas-error">{error}</div>}
    </div>
  );
}
