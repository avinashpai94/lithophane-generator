import { useState } from 'react'
import { clearCache } from '../modules/scoreCache.js'

// Lower rank = better. Used for sorting cards Excellent → Poor.
function verdictRank(label) {
  if (!label) return 4
  if (label.startsWith('Excellent')) return 0
  if (label.startsWith('Good'))      return 1
  if (label.startsWith('Marginal'))  return 2
  return 3
}

const S = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, width: 'min(92vw, 980px)', height: '88vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  scrollWrap: {
    overflowY: 'auto', flex: 1, minHeight: 0,
  },
  innerGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
    gap: 10, padding: 14,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  title:    { fontWeight: 700, fontSize: 14, color: 'var(--accent)', flex: 1 },
  closeBtn: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  progressWrap: { padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  progressTrack: { height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginTop: 5 },
  progressFill:  { height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.15s ease' },
  filterRow: { display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  grid: { display: 'none' }, // replaced by scrollWrap + innerGrid
  card: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.12s',
  },
  thumb: { width: '100%', height: 116, objectFit: 'cover', display: 'block', background: '#111' },
  cardBody: { padding: '6px 8px 8px' },
  filename: {
    fontSize: 11, color: 'var(--text)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4,
  },
  metrics: { fontSize: 10, color: 'var(--text-dim)', marginTop: 3 },
  footer: {
    padding: '8px 16px', borderTop: '1px solid var(--border)',
    display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
  },
  clearBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-dim)', fontSize: 11, padding: '4px 10px',
    borderRadius: 4, cursor: 'pointer',
  },
  empty: {
    gridColumn: '1/-1', textAlign: 'center',
    color: 'var(--text-dim)', padding: 48, fontSize: 13,
  },
}

function filterBtn(active) {
  return {
    padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#0a1628' : 'var(--text-dim)',
    border: '1px solid var(--border)', fontWeight: active ? 600 : 400,
  }
}

function badge(color) {
  return {
    display: 'inline-block', fontSize: 10, fontWeight: 600,
    padding: '2px 7px', borderRadius: 10,
    background: color + '28', color, marginBottom: 2,
  }
}

export default function GalleryModal({ results, progress, onClose, onSelectImage }) {
  const [filter, setFilter] = useState('all') // 'all' | 'good' | 'excellent'
  const [cacheCleared, setCacheCleared] = useState(false)

  const isAnalyzing = progress.done < progress.total
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)

  const sorted = [...results].sort((a, b) => {
    const ra = verdictRank(a.score?.verdict)
    const rb = verdictRank(b.score?.verdict)
    if (ra !== rb) return ra - rb
    return a.file.name.localeCompare(b.file.name)
  })

  const excellentCount = sorted.filter(r => verdictRank(r.score?.verdict) === 0).length
  const goodPlusCount  = sorted.filter(r => verdictRank(r.score?.verdict) <= 1).length

  const filtered = sorted.filter(({ score }) => {
    if (!score) return filter === 'all'
    const rank = verdictRank(score.verdict)
    if (filter === 'excellent') return rank === 0
    if (filter === 'good')      return rank <= 1
    return true
  })

  function handleClearCache() {
    clearCache()
    setCacheCleared(true)
  }

  return (
    <div style={S.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.panel}>

        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>
            Photo Gallery — {progress.total} photo{progress.total !== 1 ? 's' : ''}
            {!isAnalyzing && progress.cached > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 12 }}>
                {' '}· {progress.total - progress.cached} analyzed · {progress.cached} from cache
              </span>
            )}
          </span>
          <button style={S.closeBtn} onClick={onClose}>✕ Close</button>
        </div>

        {/* Progress bar */}
        {isAnalyzing && (
          <div style={S.progressWrap}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Analyzing {progress.done} / {progress.total}…
            </div>
            <div style={S.progressTrack}>
              <div style={{ ...S.progressFill, width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Filter strip */}
        {!isAnalyzing && results.length > 0 && (
          <div style={S.filterRow}>
            <button style={filterBtn(filter === 'all')}       onClick={() => setFilter('all')}>All ({results.length})</button>
            <button style={filterBtn(filter === 'good')}      onClick={() => setFilter('good')}>Good+ ({goodPlusCount})</button>
            <button style={filterBtn(filter === 'excellent')} onClick={() => setFilter('excellent')}>Excellent ({excellentCount})</button>
          </div>
        )}

        {/* Photo grid — scrollWrap owns the overflow, innerGrid handles layout */}
        <div style={S.scrollWrap}>
          <div style={S.innerGrid}>
          {filtered.length === 0 && isAnalyzing && (
            <div style={S.empty}>Analyzing photos…</div>
          )}
          {filtered.length === 0 && !isAnalyzing && (
            <div style={S.empty}>No photos match this filter.</div>
          )}
          {filtered.map(({ file, score, thumbnail }) => (
            <div
              key={`${file.name}_${file.size}`}
              style={S.card}
              onClick={() => onSelectImage(file)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <img src={thumbnail} alt={file.name} style={S.thumb} />
              <div style={S.cardBody}>
                <div style={S.filename} title={file.name}>{file.name}</div>
                {score ? (<>
                  <div style={badge(score.color)}>{score.verdict}</div>
                  <div style={S.metrics}>
                    tonal {score.tonalRange.toFixed(2)} · σ {score.stdDev.toFixed(2)}
                  </div>
                </>) : (
                  <div style={{ ...S.metrics, color: 'var(--warn)' }}>Could not analyze</div>
                )}
              </div>
            </div>
          ))}
          </div>{/* end innerGrid */}
        </div>{/* end scrollWrap */}

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.clearBtn} onClick={handleClearCache} disabled={cacheCleared}>
            {cacheCleared ? 'Cache cleared' : 'Clear score cache'}
          </button>
        </div>

      </div>
    </div>
  )
}
