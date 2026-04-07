import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from '../src/hooks/useHistory.js'

function setup(maxDepth) {
  return renderHook(() => useHistory(maxDepth))
}

describe('useHistory', () => {

  // Test 1
  it('basic undo/redo: pointer moves correctly', () => {
    const { result } = setup()

    act(() => result.current.push({ id: 1 }))
    act(() => result.current.push({ id: 2 }))
    act(() => result.current.push({ id: 3 }))
    expect(result.current.current).toEqual({ id: 3 })

    act(() => result.current.undo())
    expect(result.current.current).toEqual({ id: 2 })

    act(() => result.current.undo())
    expect(result.current.current).toEqual({ id: 1 })

    act(() => result.current.redo())
    expect(result.current.current).toEqual({ id: 2 })
  })

  // Test 2
  it('new push after undo truncates redo entries', () => {
    const { result } = setup()

    act(() => result.current.push({ id: 1 }))
    act(() => result.current.push({ id: 2 }))
    act(() => result.current.push({ id: 3 }))

    act(() => result.current.undo())  // back to 2
    act(() => result.current.push({ id: 4 }))  // truncates 3, pushes 4

    expect(result.current.canRedo).toBe(false)
    expect(result.current.current).toEqual({ id: 4 })
    expect(result.current.position.total).toBe(3)  // [1, 2, 4]
  })

  // Test 3
  it('stack depth is capped at maxDepth, oldest entries evicted', () => {
    const { result } = setup(20)

    act(() => {
      for (let i = 0; i < 25; i++) result.current.push({ id: i })
    })

    expect(result.current.position.total).toBe(20)
    // Oldest 5 entries (id 0–4) evicted; current should be id 24
    expect(result.current.current).toEqual({ id: 24 })
  })

  // Test 4
  it('clear resets stack to empty', () => {
    const { result } = setup()

    act(() => result.current.push({ id: 1 }))
    act(() => result.current.push({ id: 2 }))
    act(() => result.current.clear())

    expect(result.current.current).toBeNull()
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.position).toEqual({ current: -1, total: 0 })
  })

  // Test 5
  it('undo at start is a no-op', () => {
    const { result } = setup()

    act(() => result.current.push({ id: 1 }))
    act(() => result.current.undo())  // now at pointer=0, can't go further

    expect(() => act(() => result.current.undo())).not.toThrow()
    expect(result.current.current).toEqual({ id: 1 })
    expect(result.current.canUndo).toBe(false)
  })

  // Test 6
  it('redo at end is a no-op', () => {
    const { result } = setup()

    act(() => result.current.push({ id: 1 }))
    act(() => result.current.push({ id: 2 }))

    expect(() => act(() => result.current.redo())).not.toThrow()
    expect(result.current.current).toEqual({ id: 2 })
    expect(result.current.canRedo).toBe(false)
  })

})
