/**
 * ImageProcessor — converts an HTMLImageElement into a 2D brightness heightmap.
 *
 * Exported for testing:
 *   _pixelsToHeightmap(pixels, cols, rows) — pure function, takes raw RGBA data
 */

/**
 * Downsample an image to targetCols × targetRows and return a row-major 2D
 * array of normalized brightness values in [0.0, 1.0].
 * 0.0 = black, 1.0 = white.
 *
 * @param {HTMLImageElement} img
 * @param {number} targetCols
 * @param {number} targetRows
 * @returns {number[][]}
 */
export function processImage(img, targetCols, targetRows) {
  const canvas = document.createElement('canvas')
  canvas.width = targetCols
  canvas.height = targetRows
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, targetCols, targetRows)
  const { data } = ctx.getImageData(0, 0, targetCols, targetRows)
  // Reverse row order: canvas row 0 = top of image, but mesh row 0 = bottom of slab.
  // Flipping here means top of image → top of slab when viewed from the front.
  return _pixelsToHeightmap(data, targetCols, targetRows).reverse()
}

/**
 * Render a grayscale preview of the image, scaled to fit within maxWidth.
 *
 * @param {HTMLImageElement} img
 * @param {number} maxWidth
 * @returns {string} data URL (image/png)
 */
export function getGrayscalePreview(img, maxWidth = 300) {
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Pure function: convert raw RGBA pixel data into a row-major 2D brightness array.
 * Exported for unit testing.
 *
 * @param {Uint8ClampedArray|number[]} pixels - flat RGBA array, length = cols * rows * 4
 * @param {number} cols
 * @param {number} rows
 * @returns {number[][]}
 */
export function _pixelsToHeightmap(pixels, cols, rows) {
  const heightmap = []
  for (let row = 0; row < rows; row++) {
    const rowData = []
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4
      const luma = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
      rowData.push(luma / 255)
    }
    heightmap.push(rowData)
  }
  return heightmap
}

/**
 * Stretch the brightness distribution to fill [0, 1].
 * min pixel → 0.0, max pixel → 1.0, others linearly interpolated.
 * Uniform images (min === max) return an all-zero heightmap.
 *
 * @param {number[][]} heightmap
 * @returns {number[][]}
 */
export function histogramEqualize(heightmap) {
  let min = Infinity
  let max = -Infinity
  for (const row of heightmap) {
    for (const v of row) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const range = max - min
  if (range === 0) return heightmap.map(row => row.map(() => 0))
  return heightmap.map(row => row.map(v => (v - min) / range))
}

/**
 * Snap each value to the nearest of numLevels evenly spaced steps in [0, 1].
 * e.g. numLevels=5 → steps at 0, 0.25, 0.5, 0.75, 1.0
 *
 * @param {number[][]} heightmap
 * @param {number} numLevels - must be >= 2
 * @returns {number[][]}
 */
export function quantizeToLevels(heightmap, numLevels) {
  const steps = Math.max(2, numLevels) - 1
  return heightmap.map(row =>
    row.map(v => Math.round(v * steps) / steps)
  )
}

/**
 * Floyd-Steinberg error diffusion dither to numLevels discrete levels.
 * Distributes quantization error to right (7/16), lower-left (3/16),
 * below (5/16), lower-right (1/16). Does not mutate input.
 *
 * @param {number[][]} heightmap
 * @param {number} numLevels - must be >= 2
 * @returns {number[][]}
 */
export function floydSteinbergDither(heightmap, numLevels) {
  const rows = heightmap.length
  const cols = heightmap[0].length
  const steps = Math.max(2, numLevels) - 1
  // Working copy — values may temporarily exceed [0,1] during error propagation
  const buf = heightmap.map(row => [...row])

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const old = buf[r][c]
      const quantized = Math.round(old * steps) / steps
      buf[r][c] = quantized
      const err = old - quantized
      if (c + 1 < cols)              buf[r][c + 1]     += err * 7 / 16
      if (r + 1 < rows) {
        if (c - 1 >= 0)              buf[r + 1][c - 1] += err * 3 / 16
                                     buf[r + 1][c]     += err * 5 / 16
        if (c + 1 < cols)            buf[r + 1][c + 1] += err * 1 / 16
      }
    }
  }
  return buf
}

/**
 * Analyze a heightmap and return suitability metrics for lithophane printing.
 *
 * @param {number[][]} heightmap
 * @returns {{ tonalRange: number, stdDev: number, darkRatio: number, brightRatio: number }}
 */
export function analyzeHeightmap(heightmap) {
  const flat = heightmap.flat().sort((a, b) => a - b)
  const n = flat.length

  const p05 = flat[Math.floor(0.05 * n)]
  const p95 = flat[Math.floor(0.95 * n)]
  const tonalRange = p95 - p05

  const mean = flat.reduce((sum, v) => sum + v, 0) / n
  const stdDev = Math.sqrt(flat.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n)

  const darkRatio  = flat.filter(v => v < 0.1).length / n
  const brightRatio = flat.filter(v => v > 0.75).length / n

  return { tonalRange, stdDev, darkRatio, brightRatio }
}

/**
 * Derive a traffic-light verdict from analyzeHeightmap() output.
 *
 * @param {{ tonalRange, stdDev, darkRatio, brightRatio }} analysis
 * @returns {{ label: string, color: string }}
 */
export function verdictFromAnalysis(analysis) {
  const { tonalRange, stdDev, darkRatio, brightRatio } = analysis
  // Primary metrics — determine printability
  if (tonalRange < 0.5 || stdDev < 0.10)
    return { label: 'Poor — check lighting', color: '#e05252' }
  // Ratio checks — poor only if both extremes are missing entirely
  if (darkRatio < 0.02 && brightRatio < 0.02)
    return { label: 'Poor — missing blacks and whites', color: '#e05252' }
  // Marginal only if primary metrics are weak — ratios are advisory
  if (tonalRange < 0.7 || stdDev < 0.15)
    return { label: 'Marginal — low contrast', color: '#e0a052' }
  // Excellent: strong primary metrics + meaningful presence of both extremes
  if (tonalRange > 0.85 && stdDev > 0.25 && darkRatio > 0.10 && brightRatio > 0.05)
    return { label: 'Excellent candidate', color: '#a8e6cf' }
  return { label: 'Good candidate', color: '#4ecca3' }
}

/**
 * Map a metric value to a traffic-light color given good/marginal thresholds.
 *
 * @param {number} value
 * @param {number} good      - value >= good → green
 * @param {number} marginal  - value >= marginal → yellow, else red
 * @returns {string} hex color
 */
export function metricColor(value, good, marginal) {
  if (value >= good)     return '#4ecca3'
  if (value >= marginal) return '#e0a052'
  return '#e05252'
}

/**
 * Apply a contrast preprocessing mode to a heightmap before mesh generation.
 *
 * Modes:
 *   'linear'    — no change (default behavior)
 *   'quantized' — histogram equalize → quantize to discrete layer steps
 *   'dithered'  — histogram equalize → Floyd-Steinberg dither to discrete levels
 *
 * @param {number[][]} heightmap
 * @param {string} mode - 'linear' | 'quantized' | 'dithered'
 * @param {{ numLevels: number }} options
 * @returns {number[][]}
 */
export function applyContrastMode(heightmap, mode, { numLevels } = {}) {
  if (mode === 'quantized') {
    return quantizeToLevels(histogramEqualize(heightmap), numLevels)
  }
  if (mode === 'dithered') {
    return floydSteinbergDither(histogramEqualize(heightmap), numLevels)
  }
  return heightmap
}
