import { useState, useEffect, useRef } from 'react'

const TOOLTIP_WIDTH = 200
const VIEWPORT_PADDING = 8

export default function InfoTooltip({ text }) {
  const [pos, setPos] = useState(null) // { top, left } in viewport coords
  const iconRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!pos) return
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPos(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pos])

  function handleClick(e) {
    e.stopPropagation()
    e.preventDefault()
    if (pos) { setPos(null); return }
    const rect = iconRef.current.getBoundingClientRect()
    const rawLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rawLeft, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING)
    )
    setPos({ top: rect.bottom + 6, left })
  }

  return (
    <span ref={wrapRef} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span
        ref={iconRef}
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          color: pos ? 'var(--accent)' : 'var(--text-dim)',
          fontSize: 11,
          marginLeft: 3,
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        ⓘ
      </span>
      {pos && (
        <div style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: TOOLTIP_WIDTH,
          background: '#1a2a44',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '7px 10px',
          fontSize: 11,
          lineHeight: 1.5,
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}
