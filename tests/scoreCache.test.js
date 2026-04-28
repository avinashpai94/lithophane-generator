import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeCacheKey, getScore, setScore, clearCache } from '../src/modules/scoreCache.js'

// happy-dom's localStorage requires a file path to persist writes — stub with in-memory store
beforeEach(() => {
  const store = {}
  vi.stubGlobal('localStorage', {
    getItem:    (key) => store[key] ?? null,
    setItem:    (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
  })
})

describe('scoreCache', () => {
  describe('makeCacheKey', () => {
    it('returns the same key for the same file metadata', () => {
      const file = { name: 'portrait.jpg', size: 204800, lastModified: 1712800000000 }
      expect(makeCacheKey(file)).toBe(makeCacheKey(file))
    })

    it('returns different keys for different file metadata', () => {
      const a = { name: 'a.jpg', size: 100, lastModified: 1000 }
      const b = { name: 'b.jpg', size: 100, lastModified: 1000 }
      expect(makeCacheKey(a)).not.toBe(makeCacheKey(b))
    })
  })

  describe('getScore', () => {
    it('returns null when the key is not in the cache', () => {
      expect(getScore('nonexistent_key')).toBeNull()
    })
  })

  describe('setScore + getScore', () => {
    it('round-trips a score entry through localStorage', () => {
      const key = 'portrait.jpg_204800_1712800000000'
      const result = {
        verdict: 'Good candidate',
        color: '#4ecca3',
        tonalRange: 0.78,
        stdDev: 0.22,
        darkRatio: 0.12,
        brightRatio: 0.08,
      }
      setScore(key, result)
      const retrieved = getScore(key)
      expect(retrieved.verdict).toBe(result.verdict)
      expect(retrieved.tonalRange).toBeCloseTo(result.tonalRange)
      expect(retrieved.stdDev).toBeCloseTo(result.stdDev)
      expect(retrieved.darkRatio).toBeCloseTo(result.darkRatio)
      expect(retrieved.brightRatio).toBeCloseTo(result.brightRatio)
      expect(typeof retrieved.cachedAt).toBe('number')
    })

    it('overwrites an existing entry when set twice with the same key', () => {
      const key = 'photo.png_512_999'
      setScore(key, { verdict: 'Poor — check lighting', color: '#e05252', tonalRange: 0.2, stdDev: 0.05, darkRatio: 0, brightRatio: 0 })
      setScore(key, { verdict: 'Excellent candidate', color: '#a8e6cf', tonalRange: 0.92, stdDev: 0.31, darkRatio: 0.15, brightRatio: 0.09 })
      expect(getScore(key).verdict).toBe('Excellent candidate')
    })
  })

  describe('clearCache', () => {
    it('removes all cached entries', () => {
      const key1 = 'a.jpg_100_1000'
      const key2 = 'b.jpg_200_2000'
      setScore(key1, { verdict: 'Good candidate', color: '#4ecca3', tonalRange: 0.75, stdDev: 0.2, darkRatio: 0.1, brightRatio: 0.06 })
      setScore(key2, { verdict: 'Marginal — low contrast', color: '#e0a052', tonalRange: 0.55, stdDev: 0.12, darkRatio: 0.03, brightRatio: 0.03 })
      clearCache()
      expect(getScore(key1)).toBeNull()
      expect(getScore(key2)).toBeNull()
    })
  })
})
