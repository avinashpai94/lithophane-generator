import { describe, it, expect } from 'vitest'
import {
  _pixelsToHeightmap,
  histogramEqualize,
  quantizeToLevels,
  floydSteinbergDither,
  applyContrastMode,
  analyzeHeightmap,
  verdictFromAnalysis,
  metricColor,
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

describe('ImageProcessor — analyzeHeightmap', () => {
  // Test 14
  it('uniform image: tonalRange=0, stdDev=0, no dark or bright pixels', () => {
    const hm = makeHeightmap(10, 10, () => 0.5)
    const { tonalRange, stdDev, darkRatio, brightRatio } = analyzeHeightmap(hm)
    expect(tonalRange).toBeCloseTo(0, 5)
    expect(stdDev).toBeCloseTo(0, 5)
    expect(darkRatio).toBe(0)
    expect(brightRatio).toBe(0)
  })

  // Test 15
  it('half black (0.0), half bright (1.0): tonalRange=1, stdDev≈0.5, darkRatio=0.5, brightRatio=0.5', () => {
    const hm2 = [
      Array(10).fill(0.0),  // below 0.1 → dark
      Array(10).fill(1.0),  // above 0.75 → bright
    ]
    const { tonalRange, stdDev, darkRatio, brightRatio } = analyzeHeightmap(hm2)
    expect(tonalRange).toBeCloseTo(1.0, 5)
    expect(stdDev).toBeCloseTo(0.5, 5)
    expect(darkRatio).toBeCloseTo(0.5, 5)
    expect(brightRatio).toBeCloseTo(0.5, 5)
  })

  // Test 16
  it('tonal range ignores outliers: 98% at 0.5, 1% at 0.0, 1% at 1.0', () => {
    // 200 pixels: 196 at 0.5, 2 at 0.0, 2 at 1.0
    const flat = [
      ...Array(2).fill(0.0),
      ...Array(196).fill(0.5),
      ...Array(2).fill(1.0),
    ]
    const hm = [flat]
    const { tonalRange } = analyzeHeightmap(hm)
    // p05 and p95 should both land on 0.5, so range ≈ 0
    expect(tonalRange).toBeCloseTo(0, 3)
  })

  // Test 17
  it('stdDev correctness: known 2×2 heightmap', () => {
    // values: 0.0, 0.5, 0.5, 1.0 → mean=0.5, variance=0.125, stdDev≈0.3536
    const hm = [[0.0, 0.5], [0.5, 1.0]]
    const { stdDev } = analyzeHeightmap(hm)
    expect(stdDev).toBeCloseTo(Math.sqrt(0.125), 4)
  })

  // Test 18
  it('darkRatio and brightRatio: correct fractions for known distribution', () => {
    // 4 dark (0.05, < 0.1), 6 mid (0.5), 2 bright (0.80, > 0.75) — 12 pixels total
    const hm = [[0.05, 0.05, 0.05, 0.05, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.80, 0.80]]
    const { darkRatio, brightRatio } = analyzeHeightmap(hm)
    expect(darkRatio).toBeCloseTo(4 / 12, 5)
    expect(brightRatio).toBeCloseTo(2 / 12, 5)
  })
})

describe('ImageProcessor — verdictFromAnalysis + metricColor', () => {
  const good     = { tonalRange: 0.82, stdDev: 0.21, darkRatio: 0.18, brightRatio: 0.12 }
  const goodLowBright = { tonalRange: 0.72, stdDev: 0.27, darkRatio: 0.49, brightRatio: 0.04 } // portrait-like
  const marginal = { tonalRange: 0.60, stdDev: 0.13, darkRatio: 0.04, brightRatio: 0.04 }
  const poorFlat = { tonalRange: 0.30, stdDev: 0.05, darkRatio: 0.00, brightRatio: 0.00 }
  const poorBoth = { tonalRange: 0.80, stdDev: 0.20, darkRatio: 0.01, brightRatio: 0.01 } // both extremes missing

  // Test 19
  it('verdictFromAnalysis: good image → "Good candidate"', () => {
    expect(verdictFromAnalysis(good).label).toBe('Good candidate')
    expect(verdictFromAnalysis(good).color).toBe('#4ecca3')
  })

  // Test 20
  it('verdictFromAnalysis: strong primary metrics override low bright ratio → "Good candidate"', () => {
    expect(verdictFromAnalysis(goodLowBright).label).toBe('Good candidate')
    expect(verdictFromAnalysis(goodLowBright).color).toBe('#4ecca3')
  })

  // Test 21
  it('verdictFromAnalysis: weak primary metrics → "Marginal — low contrast"', () => {
    expect(verdictFromAnalysis(marginal).label).toBe('Marginal — low contrast')
    expect(verdictFromAnalysis(marginal).color).toBe('#e0a052')
  })

  // Test 22
  it('verdictFromAnalysis: flat image → "Poor — check lighting"', () => {
    expect(verdictFromAnalysis(poorFlat).label).toBe('Poor — check lighting')
    expect(verdictFromAnalysis(poorFlat).color).toBe('#e05252')
  })

  // Test 23
  it('verdictFromAnalysis: both dark and bright ratios near zero → "Poor — missing blacks and whites"', () => {
    expect(verdictFromAnalysis(poorBoth).label).toBe('Poor — missing blacks and whites')
    expect(verdictFromAnalysis(poorBoth).color).toBe('#e05252')
  })

  // Test 24
  it('verdictFromAnalysis: excellent image → "Excellent candidate"', () => {
    const excellent = { tonalRange: 0.92, stdDev: 0.30, darkRatio: 0.20, brightRatio: 0.15 }
    expect(verdictFromAnalysis(excellent).label).toBe('Excellent candidate')
    expect(verdictFromAnalysis(excellent).color).toBe('#a8e6cf')
  })

  // Test 23
  it('metricColor: returns correct color for each band', () => {
    expect(metricColor(0.80, 0.7, 0.5)).toBe('#4ecca3') // above good
    expect(metricColor(0.60, 0.7, 0.5)).toBe('#e0a052') // between marginal and good
    expect(metricColor(0.30, 0.7, 0.5)).toBe('#e05252') // below marginal
  })
})
