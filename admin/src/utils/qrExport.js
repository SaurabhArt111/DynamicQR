// Builds the actual downloadable artifacts (single PNG/SVG, a ZIP, or a PDF
// sheet) by rendering each QR through the design engine client-side, so the
// exact same "Design QR Code" look shown in the preview is what gets
// downloaded — no separate server-side renderer to keep in sync.

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { api } from '../api/http.js';
import { renderQrCanvas, canvasToBlob, FRAME_STYLES_WITH_TEXT } from './qrEngine.js';
import { renderQrSvgString, imageElementToDataUrl } from './qrSvg.js';
import { loadAuthenticatedImage, triggerBlobDownload, safeFileName } from './designHelpers.js';

const EXPORT_QR_PIXEL_SIZE = 640;
const FETCH_PAGE_SIZE = 100;

/**
 * Collections are paginated server-side (so the on-screen grid stays fast),
 * but an export needs every QR in the collection regardless of what's
 * currently loaded on screen. This loops through every page.
 */
export async function fetchAllCollectionQrItems(collectionId) {
  let page = 1;
  let pages = 1;
  let collection = null;
  const items = [];

  do {
    const { data } = await api.get(`/collections/${collectionId}/qrcodes`, {
      params: { page, limit: FETCH_PAGE_SIZE }
    });
    items.push(...data.items);
    collection = data.collection;
    pages = data.pages || 1;
    page += 1;
  } while (page <= pages);

  return { items, collection };
}

/**
 * Renders one QR and triggers a browser download of the resulting PNG.
 */
export async function downloadSingleQrPng({ vaultUrl, design, logoPath, frameImagePath, qrName, filenameBase }) {
  const [{ image, revoke }, { image: frameImage, revoke: revokeFrame }] = await Promise.all([
    loadAuthenticatedImage(logoPath),
    loadAuthenticatedImage(frameImagePath)
  ]);
  try {
    const canvas = await renderQrCanvas({
      data: vaultUrl,
      design,
      logoImageEl: image,
      frameImageEl: frameImage,
      qrName: qrName ?? filenameBase,
      qrPixelSize: EXPORT_QR_PIXEL_SIZE
    });
    const blob = await canvasToBlob(canvas);
    triggerBlobDownload(blob, `${safeFileName(filenameBase)}.png`);
  } finally {
    revoke();
    revokeFrame();
  }
}

/**
 * Renders one QR as a true vector SVG (real paths/shapes for the QR itself,
 * finder patterns, and any built-in frame chrome/caption — only a logo or a
 * custom uploaded frame image, if present, are embedded as raster data)
 * and triggers a download.
 */
export async function downloadSingleQrSvg({ vaultUrl, design, logoPath, frameImagePath, qrName, filenameBase }) {
  const [{ image, revoke }, { image: frameImage, revoke: revokeFrame }] = await Promise.all([
    loadAuthenticatedImage(logoPath),
    loadAuthenticatedImage(frameImagePath)
  ]);
  try {
    const svgString = renderQrSvgString({
      data: vaultUrl,
      design,
      logoDataUrl: imageElementToDataUrl(image),
      frameImageDataUrl: imageElementToDataUrl(frameImage),
      frameImageNaturalSize: frameImage ? { width: frameImage.naturalWidth, height: frameImage.naturalHeight } : null,
      qrName: qrName ?? filenameBase,
      qrPixelSize: EXPORT_QR_PIXEL_SIZE
    });
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    triggerBlobDownload(blob, `${safeFileName(filenameBase)}.svg`);
  } finally {
    revoke();
    revokeFrame();
  }
}

/**
 * Renders every QR in `qrs` using the SAME design (the collection's default),
 * so a bulk export always looks like one consistent, on-brand batch — and
 * zips the results as either PNGs or true-vector SVGs. When the design's
 * caption is set to use each QR's own name, every file in the ZIP gets its
 * own caption automatically.
 *
 * `qrs` items need: { name, vaultUrl }.
 */
export async function downloadCollectionZip({ qrs, design, logoPath, frameImagePath, collectionName, format = 'png' }) {
  const [{ image, revoke }, { image: frameImage, revoke: revokeFrame }] = await Promise.all([
    loadAuthenticatedImage(logoPath),
    loadAuthenticatedImage(frameImagePath)
  ]);
  try {
    const zip = new JSZip();
    const usedNames = new Map();
    const logoDataUrl = format === 'svg' ? imageElementToDataUrl(image) : null;
    const frameImageDataUrl = format === 'svg' ? imageElementToDataUrl(frameImage) : null;
    const frameImageNaturalSize = frameImage ? { width: frameImage.naturalWidth, height: frameImage.naturalHeight } : null;

    for (const qr of qrs) {
      const base = safeFileName(qr.name);
      const count = usedNames.get(base) || 0;
      usedNames.set(base, count + 1);
      const suffix = count ? `-${count + 1}` : '';

      if (format === 'svg') {
        const svgString = renderQrSvgString({
          data: qr.vaultUrl,
          design,
          logoDataUrl,
          frameImageDataUrl,
          frameImageNaturalSize,
          qrName: qr.name,
          qrPixelSize: EXPORT_QR_PIXEL_SIZE
        });
        zip.file(`${base}${suffix}.svg`, svgString);
      } else {
        const canvas = await renderQrCanvas({
          data: qr.vaultUrl,
          design,
          logoImageEl: image,
          frameImageEl: frameImage,
          qrName: qr.name,
          qrPixelSize: EXPORT_QR_PIXEL_SIZE
        });
        const blob = await canvasToBlob(canvas);
        zip.file(`${base}${suffix}.png`, blob);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(zipBlob, `${safeFileName(collectionName, 'collection')}-qr-codes-${format}.zip`);
  } finally {
    revoke();
    revokeFrame();
  }
}

/**
 * Same idea as the ZIP export, but lays every QR out on PDF pages (a grid of
 * cards with the QR's name printed underneath) instead.
 */
export async function downloadCollectionPdf({ qrs, design, logoPath, frameImagePath, collectionName }) {
  const [{ image, revoke }, { image: frameImage, revoke: revokeFrame }] = await Promise.all([
    loadAuthenticatedImage(logoPath),
    loadAuthenticatedImage(frameImagePath)
  ]);
  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 36;
    const cols = 2;
    const rows = 2;
    const cellW = (pageWidth - margin * 2) / cols;
    const cellH = (pageHeight - margin * 2) / rows;
    const cardSize = Math.min(cellW, cellH) - 44;

    let col = 0;
    let row = 0;
    let firstPage = true;

    for (const qr of qrs) {
      if (col === 0 && row === 0) {
        if (!firstPage) pdf.addPage();
        firstPage = false;
      }

      const canvas = await renderQrCanvas({
        data: qr.vaultUrl,
        design,
        logoImageEl: image,
        frameImageEl: frameImage,
        qrName: qr.name,
        qrPixelSize: EXPORT_QR_PIXEL_SIZE
      });
      const dataUrl = canvas.toDataURL('image/png');

      const cellX = margin + col * cellW;
      const cellY = margin + row * cellH;
      const scale = cardSize / canvas.width;
      const drawW = canvas.width * scale;
      const drawH = canvas.height * scale;
      const imgX = cellX + (cellW - drawW) / 2;
      const imgY = cellY + (cellH - drawH) / 2 - 10;

      pdf.addImage(dataUrl, 'PNG', imgX, imgY, drawW, drawH);
      // When the frame itself already shows the QR's name as a caption,
      // printing it again underneath would be redundant.
      if (design.frameTextMode !== 'qrName' || !FRAME_STYLES_WITH_TEXT.has(design.frameStyle)) {
        pdf.setFontSize(10);
        pdf.setTextColor('#4B5563');
        pdf.text(String(qr.name || ''), cellX + cellW / 2, cellY + cellH - 14, { align: 'center', maxWidth: cellW - 16 });
      }

      col += 1;
      if (col >= cols) { col = 0; row += 1; }
      if (row >= rows) { row = 0; }
    }

    pdf.save(`${safeFileName(collectionName, 'collection')}-qr-codes.pdf`);
  } finally {
    revoke();
    revokeFrame();
  }
}
