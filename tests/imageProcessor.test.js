import { describe, it, expect } from 'vitest'
import { _pixelsToHeightmap } from '../src/modules/imageProcessor.js'

/**
 * Build a flat RGBA Uint8ClampedArray from a per-pixel fill function.
 * fillFn(col, row) → [r, g, b, a?]
 */
function makePixels(cols, rows, fillFn) {
  const data = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4
      const [r, g, b, a = 255] = fillFn(col, row)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}

describe('ImageProcessor — _pixelsToHeightmap', () => {
  // Test 1
  it('pure white image → all values 1.0', () => {
    const pixels = makePixels(10, 10, () => [255, 255, 255])
    const hm = _pixelsToHeightmap(pixels, 10, 10)
    expect(hm.every(row => row.every(v => v === 1.0))).toBe(true)
  })

  // Test 2
  it('pure black image → all values 0.0', () => {
    const pixels = makePixels(10, 10, () => [0, 0, 0])
    const hm = _pixelsToHeightmap(pixels, 10, 10)
    expect(hm.every(row => row.every(v => v === 0.0))).toBe(true)
  })

  // Test 3
  it('known RGB → Rec.601 luma', () => {
    const redPixels   = makePixels(1, 1, () => [255, 0,   0  ])
    const greenPixels = makePixels(1, 1, () => [0,   255, 0  ])
    const bluePixels  = makePixels(1, 1, () => [0,   0,   255])

    expect(_pixelsToHeightmap(redPixels,   1, 1)[0][0]).toBeCloseTo(0.299, 3)
    expect(_pixelsToHeightmap(greenPixels, 1, 1)[0][0]).toBeCloseTo(0.587, 3)
    expect(_pixelsToHeightmap(bluePixels,  1, 1)[0][0]).toBeCloseTo(0.114, 3)
  })

  // Test 4
  it('output dimensions match targetCols × targetRows', () => {
    const pixels = makePixels(50, 30, () => [128, 128, 128])
    const hm = _pixelsToHeightmap(pixels, 50, 30)
    expect(hm.length).toBe(30)
    expect(hm.every(row => row.length === 50)).toBe(true)
  })

  // Test 5
  it('all values are in [0.0, 1.0]', () => {
    // Mix of random-ish RGB values
    const pixels = makePixels(20, 20, (col, row) => [
      (col * 13) % 256,
      (row * 17) % 256,
      ((col + row) * 7) % 256,
    ])
    const hm = _pixelsToHeightmap(pixels, 20, 20)
    expect(hm.every(row => row.every(v => v >= 0.0 && v <= 1.0))).toBe(true)
  })

  // Test 6
  it('left-to-right gradient produces monotonically increasing column values', () => {
    // Each column is a uniform grey ramp: col 0 = black, col N-1 = white
    const cols = 10
    const rows = 5
    const pixels = makePixels(cols, rows, (col) => {
      const v = Math.round((col / (cols - 1)) * 255)
      return [v, v, v]
    })
    const hm = _pixelsToHeightmap(pixels, cols, rows)
    for (const row of hm) {
      for (let c = 1; c < row.length; c++) {
        expect(row[c]).toBeGreaterThan(row[c - 1])
      }
    }
  })
})
