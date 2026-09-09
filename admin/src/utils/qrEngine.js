// Core rendering engine for "Design QR Code" — draws a fully styled, framed
// QR code onto an HTML canvas: custom dot/corner shapes, colors, an optional
// centered logo, and a decorative frame with "Scan Me" style caption.
//
// Pure browser Canvas 2D code (no external styling library) so the exact
// same module can be unit-rendered in Node (via a `canvas` polyfill) for
// testing, and bundled as-is for the client app.

import QRCodeLib from 'qrcode';

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const DOT_TYPES = [
  { id: 'square', label: 'Square' },
  { id: 'dots', label: 'Dots' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'classy', label: 'Classy' },
  { id: 'classy-rounded', label: 'Classy Rounded' },
  { id: 'extra-rounded', label: 'Extra Rounded' }
];

// Curated combinations of outer "position" ring + inner "eye" dot, shown as
// a single selectable preset (matches the reference "Corners" picker).
export const CORNER_PRESETS = [
  { id: 'square-square', square: 'square', dot: 'square', label: 'Square' },
  { id: 'rounded-square', square: 'rounded', dot: 'square', label: 'Rounded / Square' },
  { id: 'circle-circle', square: 'circle', dot: 'circle', label: 'Circle' },
  { id: 'rounded-circle', square: 'rounded', dot: 'circle', label: 'Rounded / Dot' },
  { id: 'extra-rounded-rounded', square: 'extra-rounded', dot: 'rounded', label: 'Extra Rounded' },
  { id: 'square-circle', square: 'square', dot: 'circle', label: 'Square / Dot' },
  { id: 'circle-square', square: 'circle', dot: 'square', label: 'Circle / Square' },
  { id: 'extra-rounded-circle', square: 'extra-rounded', dot: 'circle', label: 'Soft / Dot' },
  { id: 'rounded-rounded', square: 'rounded', dot: 'rounded', label: 'Rounded' }
];

export const FRAME_STYLES = [
  { id: 'none', label: 'None' },
  { id: 'bottom-bar', label: 'Bottom Bar' },
  { id: 'bottom-pill', label: 'Bottom Pill' },
  { id: 'top-bar', label: 'Top Bar' },
  { id: 'circle-badge', label: 'Circle' },
  { id: 'phone', label: 'Phone' },
  { id: 'card-border', label: 'Card' }
];

// Frame styles that show an editable caption ("SCAN ME!").
export const FRAME_STYLES_WITH_TEXT = new Set(['bottom-bar', 'bottom-pill', 'top-bar', 'circle-badge', 'phone']);

export const FRAME_TEXT_MODES = [
  { id: 'custom', label: 'Custom text' },
  { id: 'qrName', label: "Use each QR's name" }
];

export const COLOR_SWATCHES = [
  '#17202A', '#FFFFFF', '#D92D20', '#F79009', '#0F8A5F', '#1D6FA5', '#7A5AF8', '#2970FF', '#DD2590'
];

export const DEFAULT_DESIGN = Object.freeze({
  dotsType: 'square',
  cornersSquareType: 'square',
  cornersDotType: 'square',
  dotsColor: '#17202A',
  backgroundColor: '#FFFFFF',
  logoSize: 0.22,
  hideBackgroundDots: true,
  frameStyle: 'none',
  frameTextMode: 'custom',
  frameText: 'SCAN ME!',
  frameColor: '#0F8A5F',
  frameTextColor: '#FFFFFF',
  frameTextBackgroundTransparent: false,
  frameImageScale: 0.55,
  frameImageOffsetY: 0,
  frameImageCaptionSize: 0.13,
  frameImageCaptionOffsetY: 0.06
});

/**
 * Resolves what caption a frame should show: either the fixed custom text,
 * or (when frameTextMode is 'qrName') the QR's own name — most useful for
 * collection-wide bulk exports where every QR should be captioned with its
 * own title rather than one repeated static label.
 */
export function resolveFrameCaption(design, qrName) {
  if (design.frameTextMode === 'qrName' && qrName) {
    return String(qrName).toUpperCase().slice(0, 40);
  }
  return String(design.frameText || 'SCAN ME!').toUpperCase().slice(0, 40);
}

/**
 * Merges a collection's default design with an individual QR's own design.
 * If the QR has not opted into a custom design, the collection default wins
 * outright (this is how "design the frame for an entire collection" cascades
 * down to every QR code inside it).
 */
export function resolveEffectiveDesign(collectionDesign, qrDesign, useCustomDesign) {
  const base = { ...DEFAULT_DESIGN, ...(collectionDesign || {}) };
  if (useCustomDesign && qrDesign) return { ...base, ...qrDesign };
  return base;
}

// ---------------------------------------------------------------------------
// QR matrix
// ---------------------------------------------------------------------------

export function getQrMatrix(text) {
  const qr = QRCodeLib.create(String(text || ' '), { errorCorrectionLevel: 'H' });
  return qr.modules; // { size, get(row, col) }
}

function isFinderZone(row, col, size) {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= size - 7) ||
    (row >= size - 7 && col < 7)
  );
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Rounded rect with optionally-independent corner radii: number, or
// [topLeft, topRight, bottomRight, bottomLeft].
function roundRectPath(ctx, x, y, w, h, r) {
  const radii = typeof r === 'number' ? [r, r, r, r] : r;
  const maxR = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((v) => Math.max(0, Math.min(v, maxR)));

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function drawCenteredText(ctx, text, cx, cy, fontSize, color, weight = 800) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${Math.round(fontSize)}px "Segoe UI", ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

// Draws `text` curving along the bottom arc of a circle centered at (cx, cy).
function drawTextOnArc(ctx, text, cx, cy, radius, fontSize, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(fontSize)}px "Segoe UI", ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const chars = text.split('');
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const letterSpacing = fontSize * 0.32;
  const totalWidth = widths.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, chars.length - 1);
  const totalAngle = totalWidth / radius;

  let angle = Math.PI / 2 - totalAngle / 2;

  for (let i = 0; i < chars.length; i += 1) {
    const charAngle = widths[i] / radius;
    const midAngle = angle + charAngle / 2;
    const x = cx + radius * Math.cos(midAngle);
    const y = cy + radius * Math.sin(midAngle);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(midAngle + Math.PI / 2);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += charAngle + letterSpacing / radius;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Data module (dot) shapes
// ---------------------------------------------------------------------------

function drawDotShape(ctx, x, y, cell, type) {
  if (type === 'square') {
    ctx.fillRect(x, y, cell, cell);
    return;
  }

  const pad = cell * 0.07;
  const size = cell - pad * 2;
  const cx = x + pad;
  const cy = y + pad;

  switch (type) {
    case 'dots':
      ctx.beginPath();
      ctx.arc(cx + size / 2, cy + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rounded':
      roundRectPath(ctx, cx, cy, size, size, size * 0.35);
      ctx.fill();
      break;
    case 'classy':
      roundRectPath(ctx, cx, cy, size, size, [size * 0.5, 0, size * 0.5, 0]);
      ctx.fill();
      break;
    case 'classy-rounded':
      roundRectPath(ctx, cx, cy, size, size, [size * 0.68, size * 0.12, size * 0.68, size * 0.12]);
      ctx.fill();
      break;
    case 'extra-rounded':
      roundRectPath(ctx, cx, cy, size, size, size * 0.5);
      ctx.fill();
      break;
    default:
      ctx.fillRect(x, y, cell, cell);
  }
}

// ---------------------------------------------------------------------------
// Finder pattern (the three big "eyes")
// ---------------------------------------------------------------------------

function finderShapePath(ctx, x, y, size, type) {
  if (type === 'circle') {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    return;
  }
  const radius = type === 'rounded' ? size * 0.22 : type === 'extra-rounded' ? size * 0.34 : 0;
  roundRectPath(ctx, x, y, size, size, radius);
}

function drawFinderPattern(ctx, x, y, cellSize, squareType, dotType, dotsColor, backgroundColor) {
  const outerSize = 7 * cellSize;
  const ringThickness = cellSize;
  const innerHoleSize = outerSize - ringThickness * 2;
  const innerDotSize = 3 * cellSize;
  const innerDotOffset = 2 * cellSize;
  const isTransparentBg = backgroundColor === 'transparent';

  ctx.fillStyle = dotsColor;
  finderShapePath(ctx, x, y, outerSize, squareType);
  ctx.fill();

  if (isTransparentBg) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
    finderShapePath(ctx, x + ringThickness, y + ringThickness, innerHoleSize, squareType);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = backgroundColor;
    finderShapePath(ctx, x + ringThickness, y + ringThickness, innerHoleSize, squareType);
    ctx.fill();
  }

  ctx.fillStyle = dotsColor;
  finderShapePath(ctx, x + innerDotOffset, y + innerDotOffset, innerDotSize, dotType);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Styled QR body
// ---------------------------------------------------------------------------

export function drawStyledQr(ctx, matrix, design, canvasSize) {
  const size = matrix.size;
  const margin = 2;
  const totalModules = size + margin * 2;
  const cellSize = canvasSize / totalModules;

  if (design.backgroundColor !== 'transparent') {
    ctx.fillStyle = design.backgroundColor || '#FFFFFF';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
  }

  ctx.fillStyle = design.dotsColor || '#000000';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isFinderZone(row, col, size)) continue;
      if (!matrix.get(row, col)) continue;
      const x = (col + margin) * cellSize;
      const y = (row + margin) * cellSize;
      drawDotShape(ctx, x, y, cellSize, design.dotsType);
    }
  }

  const finderCoords = [[0, 0], [0, size - 7], [size - 7, 0]];
  for (const [row, col] of finderCoords) {
    const x = (col + margin) * cellSize;
    const y = (row + margin) * cellSize;
    drawFinderPattern(ctx, x, y, cellSize, design.cornersSquareType, design.cornersDotType, design.dotsColor, design.backgroundColor);
  }
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function drawLogo(ctx, logoImg, canvasSize, design) {
  if (!logoImg) return;
  const ratio = Math.min(Math.max(design.logoSize || 0.22, 0.1), 0.35);
  const logoSize = canvasSize * ratio;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  if (design.hideBackgroundDots !== false) {
    const pad = logoSize * 0.16;
    if (design.backgroundColor === 'transparent') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000000';
      roundRectPath(ctx, cx - logoSize / 2 - pad, cy - logoSize / 2 - pad, logoSize + pad * 2, logoSize + pad * 2, (logoSize + pad * 2) * 0.22);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = design.backgroundColor || '#FFFFFF';
      roundRectPath(ctx, cx - logoSize / 2 - pad, cy - logoSize / 2 - pad, logoSize + pad * 2, logoSize + pad * 2, (logoSize + pad * 2) * 0.22);
      ctx.fill();
    }
  }

  ctx.save();
  roundRectPath(ctx, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize, logoSize * 0.18);
  ctx.clip();
  ctx.drawImage(logoImg, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

export function computeFrameLayout(frameStyle, qrSize, design = {}, frameImageEl = null) {
  const pad = Math.round(qrSize * 0.07);

  switch (frameStyle) {
    case 'bottom-bar': {
      const barHeight = Math.round(qrSize * 0.22);
      return { frameStyle, canvasWidth: qrSize + pad * 2, canvasHeight: qrSize + pad * 2 + barHeight, qrX: pad, qrY: pad, qrSize, barHeight, pad };
    }
    case 'top-bar': {
      const barHeight = Math.round(qrSize * 0.22);
      return { frameStyle, canvasWidth: qrSize + pad * 2, canvasHeight: qrSize + pad * 2 + barHeight, qrX: pad, qrY: pad + barHeight, qrSize, barHeight, pad };
    }
    case 'bottom-pill': {
      const pillGap = Math.round(qrSize * 0.06);
      const pillHeight = Math.round(qrSize * 0.15);
      return { frameStyle, canvasWidth: qrSize + pad * 2, canvasHeight: Math.round(qrSize + pad * 2 + pillGap + pillHeight), qrX: pad, qrY: pad, qrSize, pillGap, pillHeight, pad };
    }
    case 'circle-badge': {
      const outer = Math.round(qrSize * 1.32);
      return { frameStyle, canvasWidth: outer, canvasHeight: outer, qrX: (outer - qrSize) / 2, qrY: (outer - qrSize) / 2 - qrSize * 0.04, qrSize, outer };
    }
    case 'phone': {
      const bezel = Math.round(qrSize * 0.09);
      const topBar = Math.round(qrSize * 0.11);
      const bottomBar = Math.round(qrSize * 0.2);
      return { frameStyle, canvasWidth: qrSize + bezel * 2, canvasHeight: qrSize + bezel * 2 + topBar + bottomBar, qrX: bezel, qrY: bezel + topBar, qrSize, bezel, topBar, bottomBar };
    }
    case 'card-border': {
      return { frameStyle, canvasWidth: qrSize + pad * 2, canvasHeight: qrSize + pad * 2, qrX: pad, qrY: pad, qrSize, pad };
    }
    case 'custom-image': {
      if (!frameImageEl) {
        // No image loaded (yet, or upload failed) — fall back to a plain QR
        // rather than showing nothing.
        return { frameStyle: 'none', canvasWidth: qrSize, canvasHeight: qrSize, qrX: 0, qrY: 0, qrSize };
      }
      const iw = frameImageEl.naturalWidth || frameImageEl.width || qrSize;
      const ih = frameImageEl.naturalHeight || frameImageEl.height || qrSize;
      const scale = Math.min(Math.max(design.frameImageScale ?? 0.55, 0.2), 0.9);
      const offsetY = Math.min(Math.max(design.frameImageOffsetY ?? 0, -0.35), 0.35);
      const innerQrSize = Math.min(iw, ih) * scale;
      const centerY = ih / 2 + offsetY * ih;
      return {
        frameStyle,
        canvasWidth: iw,
        canvasHeight: ih,
        qrX: iw / 2 - innerQrSize / 2,
        qrY: centerY - innerQrSize / 2,
        qrSize: innerQrSize,
        frameImageEl
      };
    }
    case 'none':
    default:
      return { frameStyle: 'none', canvasWidth: qrSize, canvasHeight: qrSize, qrX: 0, qrY: 0, qrSize };
  }
}

// Drawn *before* the QR is pasted in (device bodies, card backgrounds, rings).
export function drawFrameBackdrop(ctx, frameStyle, layout, design) {
  const { canvasWidth: w, canvasHeight: h, qrSize } = layout;

  switch (frameStyle) {
    case 'bottom-bar':
    case 'top-bar':
    case 'bottom-pill':
    case 'card-border':
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, 0, 0, w, h, Math.round(qrSize * 0.05));
      ctx.fill();
      break;
    case 'circle-badge': {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      const lineWidth = Math.max(2, w * 0.012);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = design.frameColor || '#0F8A5F';
      ctx.setLineDash([w * 0.02, w * 0.018]);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - lineWidth, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'phone':
      ctx.fillStyle = '#1B1F24';
      roundRectPath(ctx, 0, 0, w, h, Math.round(qrSize * 0.14));
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, layout.bezel * 0.5, layout.bezel * 0.5, w - layout.bezel, h - layout.bezel, Math.round(qrSize * 0.1));
      ctx.fill();
      break;
    case 'custom-image':
      if (layout.frameImageEl) {
        ctx.drawImage(layout.frameImageEl, 0, 0, w, h);
      }
      break;
    case 'none':
    default:
      break;
  }
}

// Drawn *after* the QR is pasted in (labels, notches, borders).
export function drawFrameOverlay(ctx, frameStyle, layout, design, qrName = '') {
  const { canvasWidth: w, qrSize } = layout;
  const text = resolveFrameCaption(design, qrName);
  const frameColor = design.frameColor || '#0F8A5F';
  const textColor = design.frameTextColor || '#FFFFFF';

  switch (frameStyle) {
    case 'bottom-bar': {
      const barY = layout.pad + qrSize;
      if (!design.frameTextBackgroundTransparent) {
        ctx.fillStyle = frameColor;
        roundRectPath(ctx, 0, barY, w, layout.barHeight, [0, 0, Math.round(qrSize * 0.05), Math.round(qrSize * 0.05)]);
        ctx.fill();
      }
      drawCenteredText(ctx, text, w / 2, barY + layout.barHeight / 2, layout.barHeight * 0.4, textColor);
      break;
    }
    case 'top-bar': {
      if (!design.frameTextBackgroundTransparent) {
        ctx.fillStyle = frameColor;
        roundRectPath(ctx, 0, 0, w, layout.barHeight, [Math.round(qrSize * 0.05), Math.round(qrSize * 0.05), 0, 0]);
        ctx.fill();
      }
      drawCenteredText(ctx, text, w / 2, layout.barHeight / 2, layout.barHeight * 0.4, textColor);
      break;
    }
    case 'bottom-pill': {
      const pillY = layout.pad + qrSize + layout.pillGap;
      const pillW = w * 0.66;
      const pillX = (w - pillW) / 2;
      if (!design.frameTextBackgroundTransparent) {
        ctx.fillStyle = frameColor;
        roundRectPath(ctx, pillX, pillY, pillW, layout.pillHeight, layout.pillHeight / 2);
        ctx.fill();
      }
      drawCenteredText(ctx, text, w / 2, pillY + layout.pillHeight / 2, layout.pillHeight * 0.42, textColor);
      break;
    }
    case 'circle-badge': {
      const h = layout.canvasHeight;
      drawTextOnArc(ctx, text, w / 2, h / 2, (w / 2) * 0.88, qrSize * 0.085, frameColor);
      break;
    }
    case 'phone': {
      ctx.fillStyle = '#1B1F24';
      roundRectPath(ctx, w / 2 - qrSize * 0.09, layout.bezel * 0.7, qrSize * 0.18, qrSize * 0.025, qrSize * 0.012);
      ctx.fill();
      const barY = layout.bezel + layout.topBar + qrSize;
      const barH = layout.bottomBar - layout.bezel * 0.5;
      if (!design.frameTextBackgroundTransparent) {
        ctx.fillStyle = frameColor;
        roundRectPath(ctx, layout.bezel * 0.5, barY, w - layout.bezel, barH, Math.round(qrSize * 0.08));
        ctx.fill();
      }
      drawCenteredText(ctx, text, w / 2, barY + barH / 2, qrSize * 0.07, textColor);
      break;
    }
    case 'card-border': {
      const lineWidth = Math.max(2, qrSize * 0.012);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = frameColor;
      roundRectPath(ctx, lineWidth, lineWidth, w - lineWidth * 2, layout.canvasHeight - lineWidth * 2, Math.round(qrSize * 0.05));
      ctx.stroke();
      break;
    }
    case 'custom-image': {
      // The uploaded image already contains its own chrome; a caption is
      // opt-in since most custom frames already have their own text baked
      // in and a repeated caption on top would usually be unwanted.
      if (design.frameImageShowCaption) {
        const h = layout.canvasHeight;
        const captionSizeMul = Math.max(0.04, Number(design.frameImageCaptionSize ?? 0.13));
        const captionOffsetMul = Number(design.frameImageCaptionOffsetY ?? 0.06);
        const pillHeight = qrSize * captionSizeMul;
        const pillW = w * 0.7;
        const pillX = (w - pillW) / 2;
        const pillY = h - pillHeight - qrSize * captionOffsetMul;
        if (!design.frameTextBackgroundTransparent) {
          ctx.fillStyle = frameColor;
          roundRectPath(ctx, pillX, pillY, pillW, pillHeight, pillHeight / 2);
          ctx.fill();
        }
        drawCenteredText(ctx, text, w / 2, pillY + pillHeight / 2, pillHeight * 0.4, textColor);
      }
      break;
    }
    case 'none':
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load logo image.'));
    img.src = url;
  });
}

/**
 * Renders a fully designed & framed QR code onto a new canvas element.
 * `data` is the URL/text encoded by the QR. `design` is a design object
 * (merge collection + QR overrides beforehand via resolveEffectiveDesign).
 * `logoImageEl` is an already-loaded HTMLImageElement, or null.
 * `frameImageEl` is an already-loaded custom frame image, used when
 * `design.frameStyle === 'custom-image'`.
 * `qrName` is used as the caption when `design.frameTextMode === 'qrName'`.
 */
export async function renderQrCanvas({ data, design, logoImageEl = null, frameImageEl = null, qrName = '', qrPixelSize = 640 }) {
  const finalDesign = { ...DEFAULT_DESIGN, ...design };
  const matrix = getQrMatrix(data);

  const qrCanvas = document.createElement('canvas');
  qrCanvas.width = qrPixelSize;
  qrCanvas.height = qrPixelSize;
  const qctx = qrCanvas.getContext('2d');
  drawStyledQr(qctx, matrix, finalDesign, qrPixelSize);
  if (logoImageEl) drawLogo(qctx, logoImageEl, qrPixelSize, finalDesign);

  const layout = computeFrameLayout(finalDesign.frameStyle, qrPixelSize, finalDesign, frameImageEl);
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = layout.canvasWidth;
  finalCanvas.height = layout.canvasHeight;
  const fctx = finalCanvas.getContext('2d');
  drawFrameBackdrop(fctx, layout.frameStyle, layout, finalDesign);
  fctx.drawImage(qrCanvas, layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
  drawFrameOverlay(fctx, layout.frameStyle, layout, finalDesign, qrName);

  return finalCanvas;
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
