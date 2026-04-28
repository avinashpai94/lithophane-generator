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

export default function Toolbar({ onUndo, onRedo, canUndo, canRedo, exportMode, onDownload, canDownload, onDownload2Color, canDownloadTwo, onDownloadPlaqueBase, onDownloadPlaqueColumns, canDownloadPlaque, onScanFolder, stats, historyPos }) {
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

      <button style={S.undoBtn} onClick={onScanFolder} title="Scan a folder of photos and score each one for lithophane suitability">
        ⊞ Scan Folder
      </button>

      <div style={S.sep} />

      {exportMode === 'plaque' ? (<>
        <button style={S.dlBtn} onClick={onDownloadPlaqueBase}    disabled={!canDownloadPlaque} title="Export base plate as STL — print in base color">↓ Base STL</button>
        <button style={S.dlBtn} onClick={onDownloadPlaqueColumns} disabled={!canDownloadPlaque} title="Export column mesh as STL — print in dark color on top of base">↓ Columns STL</button>
      </>) : exportMode === 'twoColor' ? (
        <button style={S.dlBtn} onClick={onDownload2Color} disabled={!canDownloadTwo} title="Export combined mesh as STL — assign filament by layer height in Bambu Studio">↓ Download STL</button>
      ) : (
        <button style={S.dlBtn} onClick={onDownload} disabled={!canDownload} title="Export mesh as binary STL file ready for slicing">↓ Download STL</button>
      )}

      {stats && (
        <span style={S.stats}>
          {stats.triangles.toLocaleString()} triangles
          {stats.plaque  && ` · base ${stats.stlBaseMB} MB · cols ${stats.stlColsMB} MB`}
          {!stats.plaque && ` · ${stats.stlSizeMB} MB`}
          {stats.twoColor && ` · split at ${stats.transitionMM}mm`}
          {historyPos != null && ` · history ${historyPos}`}
        </span>
      )}
    </div>
  )
}
