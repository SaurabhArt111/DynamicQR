import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Download, FileImage, ImagePlus, Palette, RotateCcw, Save, Smartphone, Square, Trash2, UploadCloud, X } from 'lucide-react';
import Modal from './Modal.jsx';
import QRCanvas from './QRCanvas.jsx';
import { api, getErrorMessage } from '../api/http.js';
import {
  COLOR_SWATCHES, CORNER_PRESETS, DOT_TYPES, FRAME_STYLES, FRAME_STYLES_WITH_TEXT, FRAME_TEXT_MODES, resolveEffectiveDesign
} from '../utils/qrEngine.js';
import { loadAuthenticatedImage, resolveDesignAndLogoUrl } from '../utils/designHelpers.js';
import { downloadSingleQrPng, downloadSingleQrSvg } from '../utils/qrExport.js';
import './QRDesignStudio.css';

// Short sample text used for every preset swatch preview so the pattern /
// corner / frame shape reads clearly at a glance (the real vault URL is only
// used for the one big "your QR" preview on the left).
const SWATCH_SAMPLE_DATA = 'DESIGN-PREVIEW';

// Keeps a slider feeling instantly responsive (the label + thumb update on
// every tick) while debouncing the actual commit into `design` state, which
// is what triggers the (relatively expensive) canvas re-render across every
// visible preview. Without this, dragging a slider re-renders every open
// preview on every single tick and feels sluggish.
function useDebouncedField(committedValue, onCommit, delay = 50) {
  const [local, setLocal] = useState(committedValue);
  const timerRef = useRef(null);

  useEffect(() => { setLocal(committedValue); }, [committedValue]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  function set(next) {
    setLocal(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onCommit(next), delay);
  }

  return [local, set];
}

function ImageThumb({ file, path, alt = 'Preview' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let revoke = () => { };

    async function run() {
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        if (!cancelled) setSrc(objectUrl);
        revoke = () => URL.revokeObjectURL(objectUrl);
        return;
      }
      if (path) {
        const { image, revoke: revokeFn } = await loadAuthenticatedImage(path);
        revoke = revokeFn;
        if (!cancelled) setSrc(image?.src || null);
        return;
      }
      setSrc(null);
    }

    run();
    return () => { cancelled = true; revoke(); };
  }, [file, path]);

  if (!src) return <UploadCloud size={22} />;
  return <img src={src} alt={alt} />;
}

function ColorRow({ label, value, onChange, allowTransparent = false }) {
  const isTransparent = value === 'transparent';
  return (
    <div className="qds-color-row">
      <span className="qds-field-label">{label}</span>
      <div className="qds-swatches">
        {allowTransparent && (
          <button
            type="button"
            className={`qds-swatch qds-swatch-transparent${isTransparent ? ' is-active' : ''}`}
            onClick={() => onChange('transparent')}
            aria-label="Transparent"
            title="Transparent"
          >
            {isTransparent && <Check size={14} color="#17202A" />}
          </button>
        )}
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`qds-swatch${value?.toUpperCase() === swatch ? ' is-active' : ''}`}
            style={{ background: swatch, borderColor: swatch === '#FFFFFF' ? 'var(--border)' : 'transparent' }}
            onClick={() => onChange(swatch)}
            aria-label={swatch}
          >
            {value?.toUpperCase() === swatch && <Check size={14} color={swatch === '#FFFFFF' ? '#17202A' : '#fff'} />}
          </button>
        ))}
        <label className="qds-swatch qds-swatch-custom" style={{ background: isTransparent ? '#fff' : (value || '#fff') }}>
          <Palette size={14} />
          <input type="color" value={isTransparent ? '#000000' : (value || '#000000')} onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
    </div>
  );
}

export default function QRDesignStudio({ scope, qr, collection, onClose, onSaved }) {
  const isQrScope = scope === 'qr';

  const initialDesign = useMemo(() => {
    if (isQrScope) {
      const { design } = resolveDesignAndLogoUrl(qr, collection?.design);
      return design;
    }
    return resolveEffectiveDesign(null, collection?.design, true);
  }, [isQrScope, qr, collection]);

  const initialLogoPath = useMemo(() => {
    if (isQrScope) return resolveDesignAndLogoUrl(qr, collection?.design).logoPath;
    return collection?.design?.logo ? `/collections/${collection._id}/design/logo` : null;
  }, [isQrScope, qr, collection]);

  const initialFrameImagePath = useMemo(() => {
    if (isQrScope) return resolveDesignAndLogoUrl(qr, collection?.design).frameImagePath;
    return collection?.design?.frameImage ? `/collections/${collection._id}/design/frame-image` : null;
  }, [isQrScope, qr, collection]);

  const [design, setDesign] = useState(initialDesign);
  const [activeTab, setActiveTab] = useState('frame');
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [frameImageFile, setFrameImageFile] = useState(null);
  const [removeFrameImage, setRemoveFrameImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const frameImageInputRef = useRef(null);

  const previewQrName = isQrScope ? (qr?.name || 'Your QR') : 'Product Name';
  const publicBase = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
  const previewVaultUrl = isQrScope ? qr?.vaultUrl : `${publicBase.replace(/\/$/, '')}/q/sample-qr-code`;

  const [localLogoObjectUrl, setLocalLogoObjectUrl] = useState(null);
  useEffect(() => {
    if (!logoFile) { setLocalLogoObjectUrl(null); return undefined; }
    const url = URL.createObjectURL(logoFile);
    setLocalLogoObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const [localFrameImageObjectUrl, setLocalFrameImageObjectUrl] = useState(null);
  useEffect(() => {
    if (!frameImageFile) { setLocalFrameImageObjectUrl(null); return undefined; }
    const url = URL.createObjectURL(frameImageFile);
    setLocalFrameImageObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frameImageFile]);

  const effectiveLogoPath = removeLogo ? null : (localLogoObjectUrl || initialLogoPath);
  const effectiveFrameImagePath = removeFrameImage ? null : (localFrameImageObjectUrl || initialFrameImagePath);
  const hasCustomFrameImage = !!(frameImageFile || (initialFrameImagePath && !removeFrameImage));

  function updateDesign(patch) {
    setDesign((prev) => ({ ...prev, ...patch }));
  }

  const [logoSizeLocal, setLogoSizeLocal] = useDebouncedField(
    design.logoSize ?? 0.22,
    (value) => updateDesign({ logoSize: value })
  );
  const [frameImageScaleLocal, setFrameImageScaleLocal] = useDebouncedField(
    design.frameImageScale ?? 0.55,
    (value) => updateDesign({ frameImageScale: value })
  );
  const [frameImageOffsetYLocal, setFrameImageOffsetYLocal] = useDebouncedField(
    design.frameImageOffsetY ?? 0,
    (value) => updateDesign({ frameImageOffsetY: value })
  );
  const [frameImageCaptionSizeLocal, setFrameImageCaptionSizeLocal] = useDebouncedField(
    design.frameImageCaptionSize ?? 0.13,
    (value) => updateDesign({ frameImageCaptionSize: value })
  );
  const [frameImageCaptionOffsetYLocal, setFrameImageCaptionOffsetYLocal] = useDebouncedField(
    design.frameImageCaptionOffsetY ?? 0.06,
    (value) => updateDesign({ frameImageCaptionOffsetY: value })
  );

  function handleLogoPick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setRemoveLogo(false);
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFrameImagePick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFrameImageFile(file);
    setRemoveFrameImage(false);
    updateDesign({ frameStyle: 'custom-image' });
  }

  function handleRemoveFrameImage() {
    setFrameImageFile(null);
    setRemoveFrameImage(true);
    if (frameImageInputRef.current) frameImageInputRef.current.value = '';
    if (design.frameStyle === 'custom-image') updateDesign({ frameStyle: 'none' });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const basePath = isQrScope ? `/qrcodes/${qr._id}` : `/collections/${collection._id}`;
      const { logo, frameImage, ...designPayload } = design;
      await api.put(`${basePath}/design`, designPayload);

      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await api.post(`${basePath}/design/logo`, formData);
      } else if (removeLogo) {
        await api.delete(`${basePath}/design/logo`).catch(() => { });
      }

      if (frameImageFile) {
        const formData = new FormData();
        formData.append('frameImage', frameImageFile);
        await api.post(`${basePath}/design/frame-image`, formData);
      } else if (removeFrameImage) {
        await api.delete(`${basePath}/design/frame-image`).catch(() => { });
      }

      await onSaved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToCollection() {
    setResetting(true);
    setError('');
    try {
      await api.delete(`/qrcodes/${qr._id}/design`);
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }

  const showResetOption = isQrScope && !!qr?.collectionId;
  const [downloading, setDownloading] = useState('');

  async function handleQuickDownload(format) {
    if (!isQrScope || !qr?.vaultUrl) return;
    setDownloading(format);
    try {
      const fn = format === 'svg' ? downloadSingleQrSvg : downloadSingleQrPng;
      await fn({ vaultUrl: qr.vaultUrl, design, logoPath: effectiveLogoPath, frameImagePath: effectiveFrameImagePath, qrName: previewQrName, filenameBase: qr.name });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download.'));
    } finally {
      setDownloading('');
    }
  }

  return (
    <Modal
      title={isQrScope ? `Design "${qr?.name}"` : `Design frame for "${collection?.name}"`}
      onClose={onClose}
      wide
    >
      {!isQrScope && (
        <p className="qds-scope-note">
          This look applies to every QR code in this collection that hasn't been given its own custom design.
        </p>
      )}
      {isQrScope && qr?.collectionId && !qr?.useCustomDesign && (
        <p className="qds-scope-note">
          This QR is currently following <strong>{collection?.name}</strong>'s collection design. Making
          changes below gives it its own custom look.
        </p>
      )}

      <div className="qds-layout">
        <div className="qds-preview">
          <div className="qds-preview-canvas">
            <QRCanvas data={previewVaultUrl} design={design} logoPath={effectiveLogoPath} frameImagePath={effectiveFrameImagePath} qrName={previewQrName} qrPixelSize={520} />
          </div>
          {showResetOption && (
            <button className="secondary-button qds-reset-button" onClick={handleResetToCollection} disabled={resetting || saving}>
              <RotateCcw size={16} /> {resetting ? 'Resetting…' : 'Use collection design instead'}
            </button>
          )}
          {isQrScope && (
            <div className="qds-quick-download">
              <button className="secondary-button" onClick={() => handleQuickDownload('png')} disabled={!!downloading}>
                {downloading === 'png' ? <span className="spinner small-spinner" /> : <Download size={16} />} PNG
              </button>
              <button className="secondary-button" onClick={() => handleQuickDownload('svg')} disabled={!!downloading}>
                {downloading === 'svg' ? <span className="spinner small-spinner" /> : <FileImage size={16} />} SVG
              </button>
            </div>
          )}
        </div>

        <div className="qds-editor">
          <div className="qds-tabs">
            <button className={`qds-tab${activeTab === 'frame' ? ' is-active' : ''}`} onClick={() => setActiveTab('frame')}>
              <Smartphone size={16} /> Frame
            </button>
            <button className={`qds-tab${activeTab === 'shape' ? ' is-active' : ''}`} onClick={() => setActiveTab('shape')}>
              <Square size={16} /> Shape
            </button>
            <button className={`qds-tab${activeTab === 'logo' ? ' is-active' : ''}`} onClick={() => setActiveTab('logo')}>
              <Circle size={16} /> Logo
            </button>
          </div>

          <div className="qds-tab-panel">
            {activeTab === 'frame' && (
              <div className="qds-section">
                <span className="qds-field-label">Frame style</span>
                <div className="qds-grid qds-grid-frames">
                  {FRAME_STYLES.map((frame) => (
                    <button
                      key={frame.id}
                      type="button"
                      className={`qds-preset${design.frameStyle === frame.id ? ' is-active' : ''}`}
                      onClick={() => updateDesign({ frameStyle: frame.id })}
                      title={frame.label}
                    >
                      <QRCanvas
                        data={SWATCH_SAMPLE_DATA}
                        design={{ ...design, frameStyle: frame.id }}
                        qrPixelSize={160}
                      />
                      <span>{frame.label}</span>
                    </button>
                  ))}
                </div>

                {FRAME_STYLES_WITH_TEXT.has(design.frameStyle) && (
                  <>
                    <span className="qds-field-label">Caption</span>
                    <div className="qds-radio-row">
                      {FRAME_TEXT_MODES.map((mode) => (
                        <label key={mode.id} className="qds-radio">
                          <input
                            type="radio"
                            name="frameTextMode"
                            checked={(design.frameTextMode || 'custom') === mode.id}
                            onChange={() => updateDesign({ frameTextMode: mode.id })}
                          />
                          {mode.label}
                        </label>
                      ))}
                    </div>

                    {(design.frameTextMode || 'custom') === 'custom' ? (
                      <div className="field">
                        <label>Caption text</label>
                        <input
                          type="text"
                          maxLength={20}
                          value={design.frameText || ''}
                          onChange={(event) => updateDesign({ frameText: event.target.value })}
                          placeholder="SCAN ME!"
                        />
                      </div>
                    ) : (
                      <p className="field-hint">
                        Each QR will show its own name as the caption — useful for a collection ZIP or
                        PDF where every code needs its own label.
                      </p>
                    )}
                    <label className="qds-checkbox">
                      <input
                        type="checkbox"
                        checked={!!design.frameTextBackgroundTransparent}
                        onChange={(event) => updateDesign({ frameTextBackgroundTransparent: event.target.checked })}
                      />
                      Transparent caption background
                    </label>
                    <ColorRow label="Frame color" value={design.frameColor} onChange={(frameColor) => updateDesign({ frameColor })} />
                    <ColorRow label="Text color" value={design.frameTextColor} onChange={(frameTextColor) => updateDesign({ frameTextColor })} />
                  </>
                )}

                <span className="qds-field-label">Or upload your own frame image</span>
                <p className="field-hint">
                  Use a fully custom design (a certificate border, branded template, etc). Your QR is
                  placed centered on top of it.
                </p>
                <div className="qds-logo-row">
                  <div className="qds-logo-preview qds-frame-image-preview">
                    {removeFrameImage ? <UploadCloud size={22} /> : <ImageThumb file={frameImageFile} path={initialFrameImagePath} alt="Custom frame preview" />}
                  </div>
                  <div className="qds-logo-actions">
                    <button type="button" className="secondary-button" onClick={() => frameImageInputRef.current?.click()}>
                      <ImagePlus size={16} /> {hasCustomFrameImage ? 'Replace frame' : 'Upload frame image'}
                    </button>
                    {hasCustomFrameImage && design.frameStyle !== 'custom-image' && (
                      <button type="button" className="secondary-button" onClick={() => updateDesign({ frameStyle: 'custom-image' })}>
                        Use this frame
                      </button>
                    )}
                    {hasCustomFrameImage && (
                      <button type="button" className="danger-button" onClick={handleRemoveFrameImage}>
                        <Trash2 size={16} /> Remove
                      </button>
                    )}
                    <input ref={frameImageInputRef} type="file" accept="image/*" hidden onChange={handleFrameImagePick} />
                  </div>
                </div>

                {design.frameStyle === 'custom-image' && hasCustomFrameImage && (
                  <>
                    <div className="qds-range-field">
                      <span className="qds-field-label">QR size in frame ({Math.round(frameImageScaleLocal * 100)}%)</span>
                      <input
                        type="range"
                        min="0.2"
                        max="0.9"
                        step="0.01"
                        value={frameImageScaleLocal}
                        onChange={(event) => setFrameImageScaleLocal(Number(event.target.value))}
                      />
                    </div>
                    <div className="qds-range-field">
                      <span className="qds-field-label">Vertical position</span>
                      <input
                        type="range"
                        min="-0.35"
                        max="0.35"
                        step="0.01"
                        value={frameImageOffsetYLocal}
                        onChange={(event) => setFrameImageOffsetYLocal(Number(event.target.value))}
                      />
                    </div>

                    <label className="qds-checkbox">
                      <input
                        type="checkbox"
                        checked={!!design.frameImageShowCaption}
                        onChange={(event) => updateDesign({ frameImageShowCaption: event.target.checked })}
                      />
                      Add a caption on top of my frame image
                    </label>

                    {design.frameImageShowCaption && (
                      <>
                        <span className="qds-field-label">Caption</span>
                        <div className="qds-radio-row">
                          {FRAME_TEXT_MODES.map((mode) => (
                            <label key={mode.id} className="qds-radio">
                              <input
                                type="radio"
                                name="frameImageTextMode"
                                checked={(design.frameTextMode || 'custom') === mode.id}
                                onChange={() => updateDesign({ frameTextMode: mode.id })}
                              />
                              {mode.label}
                            </label>
                          ))}
                        </div>

                        {(design.frameTextMode || 'custom') === 'custom' ? (
                          <div className="field">
                            <label>Caption text</label>
                            <input
                              type="text"
                              maxLength={20}
                              value={design.frameText || ''}
                              onChange={(event) => updateDesign({ frameText: event.target.value })}
                              placeholder="SCAN ME!"
                            />
                          </div>
                        ) : (
                          <p className="field-hint">Each QR will show its own name as the caption.</p>
                        )}
                        <label className="qds-checkbox">
                          <input
                            type="checkbox"
                            checked={!!design.frameTextBackgroundTransparent}
                            onChange={(event) => updateDesign({ frameTextBackgroundTransparent: event.target.checked })}
                          />
                          Transparent caption background
                        </label>
                        <ColorRow label="Caption color" value={design.frameColor} onChange={(frameColor) => updateDesign({ frameColor })} />
                        <ColorRow label="Text color" value={design.frameTextColor} onChange={(frameTextColor) => updateDesign({ frameTextColor })} />
                        <div className="qds-range-field">
                          <span className="qds-field-label">Caption size ({Math.round(frameImageCaptionSizeLocal * 100)}%)</span>
                          <input
                            type="range"
                            min="0.06"
                            max="0.3"
                            step="0.01"
                            value={frameImageCaptionSizeLocal}
                            onChange={(event) => setFrameImageCaptionSizeLocal(Number(event.target.value))}
                          />
                        </div>
                        <div className="qds-range-field">
                          <span className="qds-field-label">Caption vertical position</span>
                          <input
                            type="range"
                            min="-0.35"
                            max="0.35"
                            step="0.01"
                            value={frameImageCaptionOffsetYLocal}
                            onChange={(event) => setFrameImageCaptionOffsetYLocal(Number(event.target.value))}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'shape' && (
              <div className="qds-section">
                <span className="qds-field-label">Patterns</span>
                <div className="qds-grid qds-grid-shapes">
                  {DOT_TYPES.map((dot) => (
                    <button
                      key={dot.id}
                      type="button"
                      className={`qds-preset${design.dotsType === dot.id ? ' is-active' : ''}`}
                      onClick={() => updateDesign({ dotsType: dot.id })}
                      title={dot.label}
                    >
                      <QRCanvas
                        data={SWATCH_SAMPLE_DATA}
                        design={{ ...design, dotsType: dot.id, frameStyle: 'none' }}
                        qrPixelSize={140}
                      />
                    </button>
                  ))}
                </div>

                <span className="qds-field-label">Corners</span>
                <div className="qds-grid qds-grid-shapes">
                  {CORNER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`qds-preset${design.cornersSquareType === preset.square && design.cornersDotType === preset.dot ? ' is-active' : ''}`}
                      onClick={() => updateDesign({ cornersSquareType: preset.square, cornersDotType: preset.dot })}
                      title={preset.label}
                    >
                      <QRCanvas
                        data={SWATCH_SAMPLE_DATA}
                        design={{ ...design, cornersSquareType: preset.square, cornersDotType: preset.dot, frameStyle: 'none' }}
                        qrPixelSize={140}
                      />
                    </button>
                  ))}
                </div>

                <ColorRow label="Code color" value={design.dotsColor} onChange={(dotsColor) => updateDesign({ dotsColor })} />
                <ColorRow label="Background color" value={design.backgroundColor} onChange={(backgroundColor) => updateDesign({ backgroundColor })} allowTransparent />
                {design.backgroundColor === 'transparent' && design.frameStyle !== 'none' && design.frameStyle !== 'custom-image' && (
                  <p className="field-hint">
                    A transparent background only shows through with Frame style "None" — the other
                    built-in frames sit on a solid card.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'logo' && (
              <div className="qds-section">
                <span className="qds-field-label">Logo</span>
                <div className="qds-logo-row">
                  <div className="qds-logo-preview">
                    {removeLogo ? <UploadCloud size={22} /> : <ImageThumb file={logoFile} path={initialLogoPath} alt="Logo preview" />}
                  </div>
                  <div className="qds-logo-actions">
                    <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud size={16} /> {effectiveLogoPath ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {effectiveLogoPath && (
                      <button type="button" className="danger-button" onClick={handleRemoveLogo}>
                        <Trash2 size={16} /> Remove
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleLogoPick} />
                  </div>
                </div>

                <div className="qds-range-field">
                  <span className="qds-field-label">Logo size ({Math.round(logoSizeLocal * 100)}%)</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.35"
                    step="0.01"
                    value={logoSizeLocal}
                    onChange={(event) => setLogoSizeLocal(Number(event.target.value))}
                  />
                </div>

                <label className="qds-checkbox">
                  <input
                    type="checkbox"
                    checked={design.hideBackgroundDots !== false}
                    onChange={(event) => updateDesign({ hideBackgroundDots: event.target.checked })}
                  />
                  Clear background dots behind the logo
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="qds-footer">
        <button className="secondary-button" onClick={onClose} disabled={saving}><X size={16} /> Cancel</button>
        <button className="primary-button" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : (isQrScope ? 'Save design' : 'Save collection design')}
        </button>
      </div>
    </Modal>
  );
}
