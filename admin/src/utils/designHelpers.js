// Small helpers that sit between the API layer and the pure canvas engine
// in qrEngine.js: figuring out which design applies to a given QR, and
// loading (auth-protected) logo images into <img> elements for canvas use.

import { api } from '../api/http.js';
import { resolveEffectiveDesign } from './qrEngine.js';

/**
 * Determines the design that should actually be rendered for a QR code, plus
 * the API paths (if any) for its logo and custom frame image.
 *
 * - If the QR has opted into a custom design, only ITS OWN logo/frame image
 *   are used (never silently inherited from the collection) — an empty
 *   custom design means "no logo/frame", not "whatever the collection has".
 * - Otherwise, the collection's default logo/frame image are used.
 */
export function resolveDesignAndLogoUrl(qr, collectionDesign) {
  const useCustom = !!qr?.useCustomDesign;
  const design = resolveEffectiveDesign(collectionDesign, qr?.design, useCustom);
  const collectionId = qr?.collectionId || qr?.collection;

  let logoPath = null;
  let frameImagePath = null;

  if (useCustom) {
    if (qr?.design?.logo) logoPath = `/qrcodes/${qr._id}/design/logo`;
    if (qr?.design?.frameImage) frameImagePath = `/qrcodes/${qr._id}/design/frame-image`;
  } else {
    if (collectionDesign?.logo && collectionId) logoPath = `/collections/${collectionId}/design/logo`;
    if (collectionDesign?.frameImage && collectionId) frameImagePath = `/collections/${collectionId}/design/frame-image`;
  }

  return { design, logoPath, frameImagePath };
}

/**
 * Fetches an auth-protected image endpoint as a blob and resolves an
 * <img> element ready to be drawn onto a canvas. Returns { image, revoke }
 * — call revoke() once you're done with the image to free the object URL.
 *
 * `path` may either be a server API path (e.g. "/qrcodes/:id/design/logo",
 * fetched with the auth header) or an already-usable URL such as a local
 * "blob:" URL from a freshly-picked file — those are loaded directly.
 *
 * This never throws: a missing file (404, deleted upload, network hiccup)
 * simply resolves with `image: null` so callers can render "no logo"
 * instead of crashing.
 */
export async function loadAuthenticatedImage(path) {
  if (!path) return { image: null, revoke: () => {} };

  try {
    const isDirectlyUsableUrl = /^(blob:|data:|https?:)/i.test(path);
    if (isDirectlyUsableUrl) {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load image.'));
        img.src = path;
      });
      return { image, revoke: () => {} };
    }

    const res = await api.get(path, { responseType: 'blob', __silent: true });
    const objectUrl = URL.createObjectURL(res.data);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image.'));
      img.src = objectUrl;
    });
    return { image, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    // Missing/failed image (e.g. the file was lost on the server, or a
    // stale reference) — treat as "no image" rather than a hard failure.
    return { image: null, revoke: () => {} };
  }
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileName(value, fallback = 'qr-code') {
  const cleaned = String(value || fallback).trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
