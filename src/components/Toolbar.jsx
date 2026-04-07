const S = {
  root: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px',
    background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: { fontWeight: 700, fontSize: 14, color: 'var(--accent)', marginRight: 8, letterSpacing: 0.5 },
  sep:   { width: 1, height: 20, background: 'var(--border)', margin: '0 4px' },
  stats: { marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' },
  undoBtn:  { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' },
  dlBtn:    { background: 'var(--accent)', color: '#0a1628', fontWeight: 700 },
}

export default function Toolbar({ onUndo, onRedo, canUndo, canRedo, onDownload, canDownload, stats, historyPos }) {
  return (
    <div style={S.root}>
      <span style={S.title}>Lithophane</span>

      <div style={S.sep} />

      <button style={S.undoBtn} onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
        ↩ Undo
      </button>
      <button style={S.undoBtn} onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
        ↪ Redo
      </button>

      <div style={S.sep} />

      <button style={S.dlBtn} onClick={onDownload} disabled={!canDownload}>
        ↓ Download STL
      </button>

      {stats && (
        <span style={S.stats}>
          {stats.triangles.toLocaleString()} triangles &nbsp;·&nbsp; {stats.stlSizeMB} MB
          {historyPos != null && ` · history ${historyPos}`}
        </span>
      )}
    </div>
  )
}
