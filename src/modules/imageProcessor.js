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
  return _pixelsToHeightmap(data, targetCols, targetRows)
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
