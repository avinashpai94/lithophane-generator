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
}

function SliderRow({ label, value, min, max, step = 0.1, onChange, unit = 'mm', decimals = 1 }) {
  return (
    <div>
      <div style={S.row}>
        <span style={S.labelTxt}>{label}</span>
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

export default function ParameterPanel({ params, setParams, sourceImage, onApply }) {
  const {
    widthMM, heightMM, lockAspectRatio,
    minThickness, maxThickness,
    borderWidthMM, pixelPitchMM, invertHeight,
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

  return (
    <div style={S.root}>

      <div style={S.section}>
        <div style={S.heading}>Dimensions</div>
        <SliderRow label="Width"  value={widthMM}  min={10} max={300} step={1} decimals={0} onChange={setWidth} />
        <SliderRow label="Height" value={heightMM} min={10} max={300} step={1} decimals={0} onChange={setHeight} />
        <div style={S.row}>
          <label>
            <input type="checkbox" checked={lockAspectRatio}
              onChange={(e) => set('lockAspectRatio', e.target.checked)} />
            Lock aspect ratio
          </label>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.section}>
        <div style={S.heading}>Thickness</div>
        <SliderRow label="Min (light)" value={minThickness} min={0.4} max={maxThickness - 0.1} step={0.1}
          onChange={(v) => set('minThickness', v)} />
        <SliderRow label="Max (dark)"  value={maxThickness} min={minThickness + 0.1} max={6} step={0.1}
          onChange={(v) => set('maxThickness', v)} />
      </div>

      <div style={S.divider} />

      <div style={S.section}>
        <div style={S.heading}>Geometry</div>
        <SliderRow label="Border" value={borderWidthMM} min={0} max={20} step={0.5}
          onChange={(v) => set('borderWidthMM', v)} />
        <div>
          <div style={S.row}>
            <span style={S.labelTxt}>Pixel pitch</span>
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
        <div style={S.row}>
          <label>
            <input type="checkbox" checked={invertHeight}
              onChange={(e) => set('invertHeight', e.target.checked)} />
            Invert height (light = thick)
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
