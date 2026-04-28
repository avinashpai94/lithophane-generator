const STORAGE_KEY = 'lithophane_score_cache'

/**
 * Build a stable cache key from a File object.
 * Changes if the file is renamed, resized, or modified.
 * @param {File} file
 * @returns {string}
 */
export function makeCacheKey(file) {
  return `${file.name}_${file.size}_${file.lastModified}`
}

/**
 * Retrieve a cached score, or null if not found.
 * @param {string} cacheKey
 * @returns {{ verdict, color, tonalRange, stdDev, darkRatio, brightRatio, cachedAt } | null}
 */
export function getScore(cacheKey) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    return cache[cacheKey] ?? null
  } catch {
    return null
  }
}

/**
 * Store a score for a given cache key.
 * @param {string} cacheKey
 * @param {{ verdict, color, tonalRange, stdDev, darkRatio, brightRatio }} result
 */
export function setScore(cacheKey, result) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const cache = raw ? JSON.parse(raw) : {}
    cache[cacheKey] = { ...result, cachedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

/**
 * Remove all cached scores.
 */
export function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
