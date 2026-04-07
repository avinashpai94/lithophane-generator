import { useRef, useState } from 'react'

/**
 * useHistory — undo/redo stack for lithophane session state.
 *
 * Each snapshot stores { params, heightmap }. meshData is NOT stored —
 * it is regenerated from the snapshot on restore (MeshGenerator is fast).
 *
 * Pointer is stored in a ref (synchronous, always current) and mirrored
 * to state to trigger re-renders. This avoids stale-closure issues when
 * push() is called multiple times in the same React batch.
 *
 * @param {number} maxDepth - maximum number of snapshots (default 20)
 * @returns {{ push, undo, redo, clear, canUndo, canRedo, current, position }}
 */
export function useHistory(maxDepth = 20) {
  const stack      = useRef([])
  const pointerRef = useRef(-1)
  const [, forceRender] = useState(0)

  const bump = () => forceRender((n) => n + 1)

  /** Add snapshot at pointer+1, truncate redo entries, evict oldest if over limit. */
  function push(snapshot) {
    const next = stack.current.slice(0, pointerRef.current + 1)
    next.push(snapshot)
    if (next.length > maxDepth) next.shift()
    stack.current    = next
    pointerRef.current = next.length - 1
    bump()
  }

  /** Move pointer back one. No-op at start. */
  function undo() {
    if (pointerRef.current > 0) {
      pointerRef.current--
      bump()
    }
  }

  /** Move pointer forward one. No-op at end. */
  function redo() {
    if (pointerRef.current < stack.current.length - 1) {
      pointerRef.current++
      bump()
    }
  }

  /** Clear stack entirely. Call on new image upload. */
  function clear() {
    stack.current      = []
    pointerRef.current = -1
    bump()
  }

  const p = pointerRef.current

  return {
    push,
    undo,
    redo,
    clear,
    canUndo:      p > 0,
    canRedo:      p < stack.current.length - 1,
    current:      p >= 0 ? stack.current[p] : null,
    prevSnapshot: p > 0 ? stack.current[p - 1] : null,
    nextSnapshot: p < stack.current.length - 1 ? stack.current[p + 1] : null,
    position:     { current: p, total: stack.current.length },
  }
}
