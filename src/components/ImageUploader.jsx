import { useRef, useState } from 'react'
import { verdictFromAnalysis, metricColor } from '../modules/imageProcessor.js'
import InfoTooltip from './InfoTooltip.jsx'

const S = {
  root: { padding: 12, borderBottom: '1px solid var(--border)' },
  zone: (drag) => ({
    border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 6,
    padding: '20px 12px',
    textAlign: 'center',
    cursor: 'pointer',
    color: drag ? 'var(--accent)' : 'var(--text-dim)',
    transition: 'all 0.15s',
    background: drag ? 'rgba(78,204,163,0.05)' : 'transparent',
  }),
  preview: {
    marginTop: 10,
    width: '100%',
    borderRadius: 4,
    display: 'block',
    imageRendering: 'pixelated',
  },
}

export default function ImageUploader({ onImageLoad, grayscalePreview, imageAnalysis }) {
  const inputRef = useRef(null)
  const [drag, setDrag]   = useState(false)
  const [error, setError] = useState(null)

  function loadFile(file) {
    if (!file) return
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      setError('Only JPEG and PNG are supported.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => onImageLoad(img)
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    loadFile(e.dataTransfer.files[0])
  }

  return (
    <div style={S.root}>
      <div
        style={S.zone(drag)}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {grayscalePreview
          ? 'Click or drop to replace image'
          : <>Drop image here<br /><small>or click to browse (JPEG / PNG)</small></>}
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 6 }}>{error}</div>
      )}

      {grayscalePreview && (
        <img src={grayscalePreview} alt="Grayscale preview" style={S.preview} />
      )}

      {imageAnalysis && (() => {
        const v = verdictFromAnalysis(imageAnalysis)
        const { tonalRange, stdDev, darkRatio, brightRatio } = imageAnalysis
        const row = (label, value, display, good, marginal, tooltip) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 11, display: 'flex', alignItems: 'center' }}>
              {label}<InfoTooltip text={tooltip} />
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text)' }}>{display}</span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: metricColor(value, good, marginal), flexShrink: 0 }} />
            </span>
          </div>
        )
        const tiers = [
          { label: 'Poor',      color: '#e05252' },
          { label: 'Marginal',  color: '#e0a052' },
          { label: 'Good',      color: '#4ecca3' },
          { label: 'Excellent', color: '#a8e6cf' },
        ]
        return (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
              {tiers.map(t => {
                const active = v.label.startsWith(t.label)
                return (
                  <div key={t.label} style={{
                    flex: 1, padding: '3px 0', textAlign: 'center',
                    fontSize: 9, fontWeight: active ? 700 : 400,
                    background: active ? t.color : 'var(--border)',
                    color: active ? '#0a1628' : 'var(--text-dim)',
                    opacity: active ? 1 : 0.5,
                    transition: 'all 0.15s',
                  }}>
                    {t.label}
                  </div>
                )
              })}
            </div>
            {row('Tonal range',   tonalRange,  tonalRange.toFixed(2),               0.7,  0.5,  'Spread between 5th and 95th brightness percentile — higher means more usable contrast')}
            {row('Contrast',      stdDev,      stdDev.toFixed(2),                   0.15, 0.10, 'Standard deviation of pixel brightness — measures overall tonal variation')}
            {row('Dark pixels',   darkRatio,   (darkRatio  * 100).toFixed(0) + '%', 0.05, 0.02, 'Percentage of pixels below 10% brightness — represents true blacks in the print')}
            {row('Bright pixels', brightRatio, (brightRatio * 100).toFixed(0) + '%', 0.05, 0.02, 'Percentage of pixels above 75% brightness — represents highlights in the print')}
          </div>
        )
      })()}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={(e) => loadFile(e.target.files[0])}
      />
    </div>
  )
}
