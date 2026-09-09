// A true-vector SVG counterpart to qrEngine.js's canvas renderer. Every
// shape here is a real <path>/<rect>/<circle> — not a rasterized image — so
// the output stays crisp at any print size. Logos and uploaded custom frame
// images are still embedded as raster <image> data (there's no vector
// source for a user's photo), but the QR itself, its finder patterns, and
// every built-in frame's chrome/caption are fully vector.

import { getQrMatrix, resolveFrameCaption, computeFrameLayout, DEFAULT_DESIGN } from './qrEngine.js';

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isFinderZone(row, col, size) {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= size - 7) ||
    (row >= size - 7 && col < 7)
  );
}

// Builds the `d` attribute for a rectangle with optionally-independent
// corner radii: a single number, or [topLeft, topRight, bottomRight, bottomLeft].
function roundedRectPathD(x, y, w, h, r) {
  const radii = typeof r === 'number' ? [r, r, r, r] : r;
  const maxR = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((v) => Math.max(0, Math.min(v, maxR)));

  return [
    `M ${x + tl} ${y}`,
    `L ${x + w - tr} ${y}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : '',
    `L ${x + w} ${y + h - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : '',
    `L ${x + bl} ${y + h}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : '',
    `L ${x} ${y + tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : '',
    'Z'
  ].filter(Boolean).join(' ');
}

function circlePathD(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

// --- Data module (dot) shapes ------------------------------------------

function dotShapeMarkup(x, y, cell, type, fill) {
  if (type === 'square') {
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`;
  }

  const pad = cell * 0.07;
  const size = cell - pad * 2;
  const cx = x + pad;
  const cy = y + pad;

  switch (type) {
    case 'dots':
      return `<circle cx="${cx + size / 2}" cy="${cy + size / 2}" r="${size / 2}" fill="${fill}"/>`;
    case 'rounded':
      return `<path d="${roundedRectPathD(cx, cy, size, size, size * 0.35)}" fill="${fill}"/>`;
    case 'classy':
      return `<path d="${roundedRectPathD(cx, cy, size, size, [size * 0.5, 0, size * 0.5, 0])}" fill="${fill}"/>`;
    case 'classy-rounded':
      return `<path d="${roundedRectPathD(cx, cy, size, size, [size * 0.68, size * 0.12, size * 0.68, size * 0.12])}" fill="${fill}"/>`;
    case 'extra-rounded':
      return `<path d="${roundedRectPathD(cx, cy, size, size, size * 0.5)}" fill="${fill}"/>`;
    default:
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`;
  }
}

// --- Finder pattern (the three big "eyes"), a true ring via evenodd ----

function finderShapeD(x, y, size, type) {
  if (type === 'circle') return circlePathD(x + size / 2, y + size / 2, size / 2);
  const radius = type === 'rounded' ? size * 0.22 : type === 'extra-rounded' ? size * 0.34 : 0;
  return roundedRectPathD(x, y, size, size, radius);
}

function finderPatternMarkup(x, y, cellSize, squareType, dotType, dotsColor) {
  const outerSize = 7 * cellSize;
  const ringThickness = cellSize;
  const innerHoleSize = outerSize - ringThickness * 2;
  const innerDotSize = 3 * cellSize;
  const innerDotOffset = 2 * cellSize;

  // A true geometric hole: two nested closed subpaths in one <path> with
  // fill-rule="evenodd" — whatever is *behind* this element shows through
  // the hole, whether that's a solid background or nothing at all.
  const outerD = finderShapeD(x, y, outerSize, squareType);
  const innerD = finderShapeD(x + ringThickness, y + ringThickness, innerHoleSize, squareType);
  const ring = `<path fill-rule="evenodd" d="${outerD} ${innerD}" fill="${dotsColor}"/>`;
  const dot = `<path d="${finderShapeD(x + innerDotOffset, y + innerDotOffset, innerDotSize, dotType)}" fill="${dotsColor}"/>`;

  return ring + dot;
}

// --- QR body -------------------------------------------------------------

function qrBodyMarkup(matrix, design, canvasSize) {
  const size = matrix.size;
  const margin = 2;
  const totalModules = size + margin * 2;
  const cellSize = canvasSize / totalModules;
  const dotsColor = design.dotsColor || '#000000';

  let markup = '';
  if (design.backgroundColor && design.backgroundColor !== 'transparent') {
    markup += `<rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="${design.backgroundColor}"/>`;
  }

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isFinderZone(row, col, size)) continue;
      if (!matrix.get(row, col)) continue;
      const x = (col + margin) * cellSize;
      const y = (row + margin) * cellSize;
      markup += dotShapeMarkup(x, y, cellSize, design.dotsType, dotsColor);
    }
  }

  const finderCoords = [[0, 0], [0, size - 7], [size - 7, 0]];
  for (const [row, col] of finderCoords) {
    const x = (col + margin) * cellSize;
    const y = (row + margin) * cellSize;
    markup += finderPatternMarkup(x, y, cellSize, design.cornersSquareType, design.cornersDotType, dotsColor);
  }

  return markup;
}

function logoMarkup(logoDataUrl, canvasSize, design) {
  if (!logoDataUrl) return { defs: '', markup: '', maskId: null };
  const ratio = Math.min(Math.max(design.logoSize || 0.22, 0.1), 0.35);
  const logoSize = canvasSize * ratio;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  let markup = '';
  let defs = '';
  let maskId = null;

  // If hiding background dots, either render a backdrop (opaque) or
  // create a mask to punch a transparent hole through the QR dots.
  if (design.hideBackgroundDots !== false) {
    const pad = logoSize * 0.16;
    const backdropSize = logoSize + pad * 2;
    if (design.backgroundColor !== 'transparent') {
      markup += `<path d="${roundedRectPathD(cx - backdropSize / 2, cy - backdropSize / 2, backdropSize, backdropSize, backdropSize * 0.22)}" fill="${design.backgroundColor || '#FFFFFF'}"/>`;
    } else {
      maskId = `logo-mask-${Math.round(cx)}-${Math.round(cy)}`;
      defs += `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
        `<rect x="0" y="0" width="${canvasSize}" height="${canvasSize}" fill="#ffffff"/>` +
        `<path d="${roundedRectPathD(cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize, logoSize * 0.18)}" fill="#000000"/>` +
        `</mask>`;
    }
  }

  const clipId = `logo-clip-${Math.round(cx)}-${Math.round(cy)}`;
  defs += `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${roundedRectPathD(cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize, logoSize * 0.18)}"/></clipPath>`;
  markup += `<image href="${logoDataUrl}" x="${cx - logoSize / 2}" y="${cy - logoSize / 2}" width="${logoSize}" height="${logoSize}" clip-path="url(#${clipId})" preserveAspectRatio="none"/>`;
  return { defs, markup, maskId };
}

// --- Frame chrome ----------------------------------------------------------

function centeredTextMarkup(text, cx, cy, fontSize, color, weight = 800) {
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI', ui-sans-serif, system-ui, sans-serif" font-weight="${weight}" font-size="${fontSize}" fill="${color}">${esc(text)}</text>`;
}

function frameChromeMarkup(layout, design, qrName, frameImageDataUrl) {
  const { frameStyle, canvasWidth: w, canvasHeight: h, qrSize } = layout;
  const text = resolveFrameCaption(design, qrName);
  const frameColor = design.frameColor || '#0F8A5F';
  const textColor = design.frameTextColor || '#FFFFFF';
  let backdrop = '';
  let overlay = '';

  switch (frameStyle) {
    case 'bottom-bar': {
      backdrop = `<path d="${roundedRectPathD(0, 0, w, h, qrSize * 0.05)}" fill="#FFFFFF"/>`;
      const barY = layout.pad + qrSize;
      overlay = `<path d="${roundedRectPathD(0, barY, w, layout.barHeight, [0, 0, qrSize * 0.05, qrSize * 0.05])}" fill="${frameColor}"/>` +
        centeredTextMarkup(text, w / 2, barY + layout.barHeight / 2, layout.barHeight * 0.4, textColor);
      break;
    }
    case 'top-bar': {
      backdrop = `<path d="${roundedRectPathD(0, 0, w, h, qrSize * 0.05)}" fill="#FFFFFF"/>`;
      overlay = `<path d="${roundedRectPathD(0, 0, w, layout.barHeight, [qrSize * 0.05, qrSize * 0.05, 0, 0])}" fill="${frameColor}"/>` +
        centeredTextMarkup(text, w / 2, layout.barHeight / 2, layout.barHeight * 0.4, textColor);
      break;
    }
    case 'bottom-pill': {
      backdrop = `<path d="${roundedRectPathD(0, 0, w, h, qrSize * 0.05)}" fill="#FFFFFF"/>`;
      const pillY = layout.pad + qrSize + layout.pillGap;
      const pillW = w * 0.66;
      const pillX = (w - pillW) / 2;
      overlay = `<path d="${roundedRectPathD(pillX, pillY, pillW, layout.pillHeight, layout.pillHeight / 2)}" fill="${frameColor}"/>` +
        centeredTextMarkup(text, w / 2, pillY + layout.pillHeight / 2, layout.pillHeight * 0.42, textColor);
      break;
    }
    case 'circle-badge': {
      backdrop = `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="#FFFFFF"/>`;
      const lineWidth = Math.max(2, w * 0.012);
      const arcId = `caption-arc-${Math.round(w)}`;
      const arcR = (w / 2) * 0.88;
      overlay =
        `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - lineWidth}" fill="none" stroke="${frameColor}" stroke-width="${lineWidth}" stroke-dasharray="${w * 0.02} ${w * 0.018}"/>` +
        `<path id="${arcId}" d="M ${w / 2 - arcR} ${h / 2} A ${arcR} ${arcR} 0 0 0 ${w / 2 + arcR} ${h / 2}" fill="none"/>` +
        `<text font-family="'Segoe UI', ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="${qrSize * 0.085}" fill="${frameColor}" text-anchor="middle">` +
        `<textPath href="#${arcId}" startOffset="50%">${esc(text)}</textPath></text>`;
      break;
    }
    case 'phone': {
      backdrop = `<path d="${roundedRectPathD(0, 0, w, h, qrSize * 0.14)}" fill="#1B1F24"/>` +
        `<path d="${roundedRectPathD(layout.bezel * 0.5, layout.bezel * 0.5, w - layout.bezel, h - layout.bezel, qrSize * 0.1)}" fill="#FFFFFF"/>`;
      const barY = layout.bezel + layout.topBar + qrSize;
      const barH = layout.bottomBar - layout.bezel * 0.5;
      overlay = `<path d="${roundedRectPathD(w / 2 - qrSize * 0.09, layout.bezel * 0.7, qrSize * 0.18, qrSize * 0.025, qrSize * 0.012)}" fill="#1B1F24"/>` +
        `<path d="${roundedRectPathD(layout.bezel * 0.5, barY, w - layout.bezel, barH, qrSize * 0.08)}" fill="${frameColor}"/>` +
        centeredTextMarkup(text, w / 2, barY + barH / 2, qrSize * 0.07, textColor);
      break;
    }
    case 'card-border': {
      const lineWidth = Math.max(2, qrSize * 0.012);
      backdrop = `<path d="${roundedRectPathD(0, 0, w, h, qrSize * 0.05)}" fill="#FFFFFF"/>`;
      overlay = `<path d="${roundedRectPathD(lineWidth, lineWidth, w - lineWidth * 2, h - lineWidth * 2, qrSize * 0.05)}" fill="none" stroke="${frameColor}" stroke-width="${lineWidth}"/>`;
      break;
    }
    case 'custom-image': {
      if (frameImageDataUrl) {
        backdrop = `<image href="${frameImageDataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
      }
      if (design.frameImageShowCaption) {
        const captionSizeMul = Math.max(0.04, Number(design.frameImageCaptionSize ?? 0.13));
        const captionOffsetMul = Number(design.frameImageCaptionOffsetY ?? 0.06);
        const pillHeight = qrSize * captionSizeMul;
        const pillW = w * 0.7;
        const pillX = (w - pillW) / 2;
        const pillY = h - pillHeight - qrSize * captionOffsetMul;
        overlay = `<path d="${roundedRectPathD(pillX, pillY, pillW, pillHeight, pillHeight / 2)}" fill="${frameColor}"/>` +
          centeredTextMarkup(text, w / 2, pillY + pillHeight / 2, pillHeight * 0.4, textColor);
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return { backdrop, overlay };
}

/**
 * Renders a fully designed & framed QR code as a self-contained SVG string
 * — real vector shapes throughout (rects/paths/circles/text), so it stays
 * crisp printed at any size. Logos and uploaded custom frame images are
 * embedded as raster data URIs (there's no vector source for those), but
 * everything else — the QR modules, finder patterns, and every built-in
 * frame's chrome and caption — is true vector.
 */
export function renderQrSvgString({ data, design, logoDataUrl = null, frameImageDataUrl = null, qrName = '', qrPixelSize = 640, frameImageNaturalSize = null }) {
  const finalDesign = { ...DEFAULT_DESIGN, ...design };
  const matrix = getQrMatrix(data);

  const layout = computeFrameLayout(
    finalDesign.frameStyle,
    qrPixelSize,
    finalDesign,
    finalDesign.frameStyle === 'custom-image' && frameImageNaturalSize
      ? { naturalWidth: frameImageNaturalSize.width, naturalHeight: frameImageNaturalSize.height }
      : (finalDesign.frameStyle === 'custom-image' ? { naturalWidth: qrPixelSize, naturalHeight: qrPixelSize } : null)
  );

  const { backdrop, overlay } = frameChromeMarkup(layout, finalDesign, qrName, frameImageDataUrl);

  const logo = logoMarkup(logoDataUrl, qrPixelSize, finalDesign);
  const body = logo.maskId
    ? `<g mask="url(#${logo.maskId})">${qrBodyMarkup(matrix, finalDesign, qrPixelSize)}</g>`
    : qrBodyMarkup(matrix, finalDesign, qrPixelSize);
  const qrGroup =
    `<g transform="translate(${layout.qrX}, ${layout.qrY}) scale(${layout.qrSize / qrPixelSize})">` +
    `<defs>${logo.defs}</defs>` +
    body +
    logo.markup +
    `</g>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${Math.round(layout.canvasWidth)}" height="${Math.round(layout.canvasHeight)}" ` +
    `viewBox="0 0 ${layout.canvasWidth} ${layout.canvasHeight}">` +
    backdrop +
    qrGroup +
    overlay +
    `</svg>`
  );
}

/**
 * Converts an already-loaded <img> element into a base64 data URL, so it
 * can be embedded directly in a self-contained SVG file.
 */
export function imageElementToDataUrl(img) {
  if (!img) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
