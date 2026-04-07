import { useRef, useState } from 'react'

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

export default function ImageUploader({ onImageLoad, grayscalePreview }) {
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
