const S = {
  root: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: '#1a1a2e',
  },
  placeholder: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, color: 'var(--text-dim)', pointerEvents: 'none',
  },
  hint: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.55)', padding: '6px 14px', borderRadius: 20,
    fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', pointerEvents: 'none',
  },
}

export default function PreviewPanel({ containerRef, hasMesh }) {
  return (
    <div style={S.root}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {!hasMesh && (
        <div style={S.placeholder}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <span>Upload an image and click Apply</span>
        </div>
      )}

      {hasMesh && (
        <div style={S.hint}>
          Left-drag: rotate &nbsp;·&nbsp; Right-drag: pan &nbsp;·&nbsp; Scroll: zoom
        </div>
      )}
    </div>
  )
}
