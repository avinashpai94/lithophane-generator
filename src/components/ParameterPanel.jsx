import InfoTooltip from './InfoTooltip.jsx'

const NOZZLE_WIDTH = 0.4

const S = {
  root:    { padding: 12, display: 'flex', flexDirection: 'column', gap: 14 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  heading: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase' },
  row:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  labelTxt:{ flex: 1, color: 'var(--text)' },
  slider:  { flex: 2 },
  divider: { borderTop: '1px solid var(--border)' },
  info:    { fontSize: 11, color: 'var(--text-dim)' },
  warn:    { fontSize: 11, color: 'var(--warn)', marginTop: 2 },
  applyBtn:{ background: 'var(--accent)', color: '#0a1628', fontWeight: 700, width: '100%', padding: '8px 0', fontSize: 13 },
  toggleWrap: { display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' },
  toggleActive:   { flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#0a1628', border: 'none', cursor: 'pointer' },
  toggleInactive: { flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 400, background: 'transparent', color: 'var(--text-dim)', border: 'none', cursor: 'pointer' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 8 },
  colorSwatch: { width: 32, height: 24, borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 },
}

function SliderRow({ label, value, min, max, step = 0.1, onChange, unit = 'mm', decimals = 1, tooltip }) {
  return (
    <div>
      <div style={S.row}>
        <span style={{ ...S.labelTxt, display: 'flex', alignItems: 'center' }}>
          {label}{tooltip && <InfoTooltip text={tooltip} />}
        </span>
        <input
          type="range" min={min} max={max} step={step}
          value={value} style={S.slider}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="number" min={min} max={max} step={step}
          value={value.toFixed(decimals)}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        />
        <span style={{ color: 'var(--text-dim)', width: 22 }}>{unit}</span>
      </div>
    </div>
  )
}

export default function ParameterPanel({ params, setParams, sourceImage, onApply, exportMode, onExportModeChange, twoColorParams, setTwoColorParams, plaqueParams, setPlaqueParams }) {
  const {
    widthMM, heightMM, lockAspectRatio,
    minThickness, maxThickness,
    borderWidthMM, pixelPitchMM, invertHeight,
    contrastMode, layerHeightMM, ditherLevels,
  } = params

  const cols = Math.max(2, Math.round(widthMM  / pixelPitchMM))
  const rows = Math.max(2, Math.round(heightMM / pixelPitchMM))

  function set(key, value) {
    setParams((p) => ({ ...p, [key]: value }))
  }

  function setWidth(w) {
    const clamped = Math.max(10, w)
    if (lockAspectRatio && sourceImage) {
      const ratio = sourceImage.naturalHeight / sourceImage.naturalWidth
      setParams((p) => ({ ...p, widthMM: clamped, heightMM: Math.round(clamped * ratio * 10) / 10 }))
    } else if (lockAspectRatio) {
      const ratio = heightMM / widthMM
      setParams((p) => ({ ...p, widthMM: clamped, heightMM: Math.round(clamped * ratio * 10) / 10 }))
    } else {
      set('widthMM', clamped)
    }
  }

  function setHeight(h) {
    const clamped = Math.max(10, h)
    if (lockAspectRatio && sourceImage) {
      const ratio = sourceImage.naturalWidth / sourceImage.naturalHeight
      setParams((p) => ({ ...p, heightMM: clamped, widthMM: Math.round(clamped * ratio * 10) / 10 }))
    } else if (lockAspectRatio) {
      const ratio = widthMM / heightMM
      setParams((p) => ({ ...p, heightMM: clamped, widthMM: Math.round(clamped * ratio * 10) / 10 }))
    } else {
      set('heightMM', clamped)
    }
  }

  function setTC(key, value) {
    setTwoColorParams((p) => ({ ...p, [key]: value }))
  }

  function setPQ(key, value) {
    setPlaqueParams((p) => ({ ...p, [key]: value }))
  }

  return (
    <div style={S.root}>

      {/* Mode toggle */}
      <div style={S.toggleWrap}>
        <button
          style={exportMode === 'standard' ? S.toggleActive : S.toggleInactive}
          onClick={() => onExportModeChange('standard')}>
          Standard
        </button>
        <button
          style={exportMode === 'twoColor' ? S.toggleActive : S.toggleInactive}
          onClick={() => onExportModeChange('twoColor')}>
          2-Color
        </button>
        <button
          style={exportMode === 'plaque' ? S.toggleActive : S.toggleInactive}
          onClick={() => onExportModeChange('plaque')}>
          Plaque
        </button>
      </div>

      <div style={S.section}>
        <div style={S.heading}>Dimensions</div>
        <SliderRow label="Width"  value={widthMM}  min={10} max={300} step={1} decimals={0} onChange={setWidth}  tooltip="Physical width of the printed lithophane in mm" />
        <SliderRow label="Height" value={heightMM} min={10} max={300} step={1} decimals={0} onChange={setHeight} tooltip="Physical height of the printed lithophane in mm" />
        <div style={S.row}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={lockAspectRatio}
              onChange={(e) => set('lockAspectRatio', e.target.checked)} />
            Lock aspect ratio
            <InfoTooltip text="Keep width and height proportional to the source image" />
          </label>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.section}>
        <div style={S.heading}>Thickness</div>
        {exportMode === 'twoColor' ? (<>
          <SliderRow label="Base" value={twoColorParams.baseThicknessMM} min={0.4} max={3} step={0.1}
            onChange={(v) => setTC('baseThicknessMM', v)} tooltip="Thickness of the solid background base plate (printed in first filament)" />
          <SliderRow label="Relief height" value={twoColorParams.reliefHeightMM} min={0.2} max={4} step={0.1}
            onChange={(v) => setTC('reliefHeightMM', v)} tooltip="Height of the image detail above the base plate (printed in second filament)" />
        </>) : exportMode === 'plaque' ? (<>
          <SliderRow label="Base height" value={plaqueParams.baseHeightMM} min={0.4} max={4} step={0.1}
            onChange={(v) => setPQ('baseHeightMM', v)} tooltip="Thickness of the flat base plate (printed in base color)" />
          <SliderRow label="Column height" value={plaqueParams.columnHeightMM} min={0.2} max={4} step={0.1}
            onChange={(v) => setPQ('columnHeightMM', v)} tooltip="Height of the raised columns above the base (printed in dark color to block reflected light)" />
        </>) : (<>
          <SliderRow label="Min (light)" value={minThickness} min={0.4} max={maxThickness - 0.1} step={0.1}
            onChange={(v) => set('minThickness', v)} tooltip="Thickness at the lightest pixels — thinner lets more light through when backlit" />
          <SliderRow label="Max (dark)"  value={maxThickness} min={minThickness + 0.1} max={6} step={0.1}
            onChange={(v) => set('maxThickness', v)} tooltip="Thickness at the darkest pixels — thicker blocks more light when backlit" />
        </>)}
      </div>

      {exportMode === 'twoColor' && (<>
        <div style={S.divider} />
        <div style={S.section}>
          <div style={S.heading}>Colors (preview only)</div>
          <div style={S.colorRow}>
            <span style={S.labelTxt}>Background</span>
            <input type="color" style={S.colorSwatch} value={twoColorParams.baseColor}
              onChange={(e) => setTC('baseColor', e.target.value)} />
            <span style={{ ...S.info, fontFamily: 'monospace' }}>{twoColorParams.baseColor}</span>
          </div>
          <div style={S.colorRow}>
            <span style={S.labelTxt}>Relief</span>
            <input type="color" style={S.colorSwatch} value={twoColorParams.reliefColor}
              onChange={(e) => setTC('reliefColor', e.target.value)} />
            <span style={{ ...S.info, fontFamily: 'monospace' }}>{twoColorParams.reliefColor}</span>
          </div>
          <div style={S.info}>Preview only — assign filament in Bambu Studio.</div>
        </div>
        <div style={{ ...S.section, background: 'rgba(78,204,163,0.08)', borderRadius: 6, padding: 8 }}>
          <div style={{ ...S.info, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent)' }}>Bambu Studio workflow:</strong><br/>
            1. Import STL → add 2nd filament<br/>
            2. Right-click object → <em>Change Filament by Layer Height</em><br/>
            3. Set split at <strong>{twoColorParams.baseThicknessMM.toFixed(1)}mm</strong><br/>
            4. Below = background · Above = relief
          </div>
        </div>
      </>)}

      {exportMode === 'plaque' && (<>
        <div style={S.divider} />
        <div style={S.section}>
          <div style={S.heading}>Colors (preview only)</div>
          <div style={S.colorRow}>
            <span style={S.labelTxt}>Base</span>
            <input type="color" style={S.colorSwatch} value={plaqueParams.baseColor}
              onChange={(e) => setPQ('baseColor', e.target.value)} />
            <span style={{ ...S.info, fontFamily: 'monospace' }}>{plaqueParams.baseColor}</span>
          </div>
          <div style={S.colorRow}>
            <span style={S.labelTxt}>Columns</span>
            <input type="color" style={S.colorSwatch} value={plaqueParams.columnColor}
              onChange={(e) => setPQ('columnColor', e.target.value)} />
            <span style={{ ...S.info, fontFamily: 'monospace' }}>{plaqueParams.columnColor}</span>
          </div>
          <div style={S.info}>Preview only — assign filament in Bambu Studio.</div>
        </div>
        <div style={{ ...S.section, background: 'rgba(78,204,163,0.08)', borderRadius: 6, padding: 8 }}>
          <div style={{ ...S.info, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--accent)' }}>Bambu Studio workflow:</strong><br/>
            1. Import <em>plaque_base.stl</em> + <em>plaque_columns.stl</em><br/>
            2. Merge objects → assign filament per object<br/>
            3. Base = light color · Columns = dark color<br/>
            4. View under direct light (not backlit)
          </div>
        </div>
      </>)}

      <div style={S.divider} />

      <div style={S.section}>
        <div style={S.heading}>Geometry</div>
        <SliderRow label="Border" value={borderWidthMM} min={0} max={20} step={0.5}
          onChange={(v) => set('borderWidthMM', v)} tooltip="Flat border surrounding the image area, printed at maximum thickness" />
        <div>
          <div style={S.row}>
            <span style={{ ...S.labelTxt, display: 'flex', alignItems: 'center' }}>
              Pixel pitch<InfoTooltip text="Distance between mesh vertices — smaller = more detail but larger file and longer generation time" />
            </span>
            <input
              type="number" min={0.2} max={5} step={0.05}
              value={pixelPitchMM.toFixed(2)}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) set('pixelPitchMM', Math.max(0.2, v)) }}
            />
            <span style={{ color: 'var(--text-dim)', width: 22 }}>mm</span>
          </div>
          {pixelPitchMM < NOZZLE_WIDTH && (
            <div style={S.warn}>Warning: pitch below nozzle width (0.4mm) — detail won't print</div>
          )}
        </div>
        {exportMode !== 'plaque' && (<>
          <div style={S.row}>
            <span style={{ ...S.labelTxt, display: 'flex', alignItems: 'center' }}>
              Contrast mode<InfoTooltip text="How pixel brightness is mapped to thickness before mesh generation" />
            </span>
            <select
              value={contrastMode}
              onChange={(e) => set('contrastMode', e.target.value)}
              style={{ flex: 2, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px' }}
            >
              <option value="linear">Linear (default)</option>
              <option value="quantized">Quantized (layer steps)</option>
              <option value="dithered">Dithered (halftone)</option>
            </select>
          </div>
          {contrastMode === 'quantized' && (
            <div style={S.row}>
              <span style={{ ...S.labelTxt, display: 'flex', alignItems: 'center' }}>
                Layer height<InfoTooltip text="Your printer's layer height — snaps thickness values to printable increments" />
              </span>
              <input
                type="number" min={0.05} max={1.0} step={0.05}
                value={layerHeightMM.toFixed(2)}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) set('layerHeightMM', Math.max(0.05, v)) }}
              />
              <span style={{ color: 'var(--text-dim)', width: 22 }}>mm</span>
            </div>
          )}
          {contrastMode === 'dithered' && (
            <div>
              <div style={S.row}>
                <span style={{ ...S.labelTxt, display: 'flex', alignItems: 'center' }}>
                  Dither levels<InfoTooltip text="Number of discrete thickness steps — 2 = binary halftone (maximum contrast), 3–4 = softer gradients" />
                </span>
                <input
                  type="number" min={2} max={8} step={1}
                  value={ditherLevels}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) set('ditherLevels', Math.max(2, Math.min(8, v))) }}
                />
                <span style={{ color: 'var(--text-dim)', width: 22 }}></span>
              </div>
              {pixelPitchMM < 0.6 && (
                <div style={S.warn}>Tip: dithered mode works best at ≥ 0.6mm pixel pitch</div>
              )}
            </div>
          )}
        </>)}
        {exportMode === 'plaque' && (
          <div style={S.info}>Plaque uses binary dithering — always 2 levels for maximum halftone contrast.</div>
        )}
        <div style={S.row}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={invertHeight}
              onChange={(e) => set('invertHeight', e.target.checked)} />
            Invert height (light = thick)
            <InfoTooltip text="Reverse the brightness-to-thickness mapping — use if your print appears inverted when backlit" />
          </label>
        </div>
      </div>

      <div style={S.divider} />

      <div style={{ ...S.info, textAlign: 'center' }}>
        Grid: {cols} × {rows} &nbsp;·&nbsp; ~{(cols * rows * 2 / 1000).toFixed(0)}k triangles
      </div>

      <button style={S.applyBtn} onClick={onApply} disabled={!sourceImage}>
        Apply
      </button>
    </div>
  )
}
