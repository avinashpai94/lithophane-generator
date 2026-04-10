import { describe, it, expect } from 'vitest'
import {
  _pixelsToHeightmap,
  histogramEqualize,
  quantizeToLevels,
  floydSteinbergDither,
  applyContrastMode,
} from '../src/modules/imageProcessor.js'

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

// Helper: build a small heightmap from a flat array of values (row-major)
function makeHeightmap(cols, rows, fillFn) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => fillFn(c, r))
  )
}

describe('ImageProcessor — contrast preprocessing', () => {
  // Test 7
  it('histogramEqualize: min maps to 0.0 and max maps to 1.0', () => {
    const hm = makeHeightmap(4, 3, (c, r) => 0.2 + (c + r * 4) * (0.6 / 11))
    const eq = histogramEqualize(hm)
    const flat = eq.flat()
    expect(Math.min(...flat)).toBeCloseTo(0.0, 5)
    expect(Math.max(...flat)).toBeCloseTo(1.0, 5)
  })

  // Test 8
  it('histogramEqualize: uniform image returns all-zero heightmap without crashing', () => {
    const hm = makeHeightmap(4, 4, () => 0.5)
    const eq = histogramEqualize(hm)
    expect(eq.flat().every(v => v === 0)).toBe(true)
  })

  // Test 9
  it('quantizeToLevels: values snap to nearest step', () => {
    // numLevels=5 → steps at 0, 0.25, 0.5, 0.75, 1.0
    const hm = [[0.3, 0.6, 0.1, 0.9]]
    const q = quantizeToLevels(hm, 5)
    expect(q[0][0]).toBeCloseTo(0.25, 5) // 0.3 → nearest 0.25
    expect(q[0][1]).toBeCloseTo(0.5,  5) // 0.6 → nearest 0.5
    expect(q[0][2]).toBeCloseTo(0.0,  5) // 0.1 → nearest 0.0
    expect(q[0][3]).toBeCloseTo(1.0,  5) // 0.9 → nearest 1.0
  })

  // Test 10
  it('quantizeToLevels: binary (numLevels=2) outputs only 0.0 and 1.0', () => {
    const hm = makeHeightmap(10, 10, (c, r) => (c + r) / 18)
    const q = quantizeToLevels(hm, 2)
    expect(q.flat().every(v => v === 0 || v === 1)).toBe(true)
  })

  // Test 11
  it('floydSteinbergDither: all output values belong to the discrete level set', () => {
    const numLevels = 4
    const steps = numLevels - 1
    const hm = makeHeightmap(12, 8, (c, r) => (c + r * 12) / (12 * 8 - 1))
    const d = floydSteinbergDither(hm, numLevels)
    const validLevels = new Set(
      Array.from({ length: numLevels }, (_, i) =>
        Math.round((i / steps) * 1e6) / 1e6
      )
    )
    for (const v of d.flat()) {
      const rounded = Math.round(v * steps) / steps
      expect(validLevels.has(Math.round(rounded * 1e6) / 1e6)).toBe(true)
    }
  })

  // Test 12
  it('floydSteinbergDither: average output brightness ≈ average input brightness', () => {
    const hm = makeHeightmap(20, 20, (c, r) => (c + r) / 38)
    const avg = v => v.flat().reduce((a, b) => a + b, 0) / v.flat().length
    const d = floydSteinbergDither(hm, 8)
    expect(avg(d)).toBeCloseTo(avg(hm), 1)
  })

  // Test 13
  it('applyContrastMode linear: returns the original heightmap unchanged', () => {
    const hm = makeHeightmap(5, 5, (c, r) => (c + r) / 8)
    const result = applyContrastMode(hm, 'linear', { numLevels: 5 })
    expect(result).toBe(hm) // reference equality — no copy made
  })
})
