import { describe, it, expect } from 'vitest'
import { generate } from '../src/modules/meshGenerator.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeightmap(cols, rows, value = 0.5) {
  return Array.from({ length: rows }, () => Array(cols).fill(value))
}

/** Compute the face normal for triangle (a, b, c) given flat vertex array. */
function faceNormal(vertices, a, b, c) {
  const ax = vertices[a*3], ay = vertices[a*3+1], az = vertices[a*3+2]
  const bx = vertices[b*3], by = vertices[b*3+1], bz = vertices[b*3+2]
  const cx = vertices[c*3], cy = vertices[c*3+1], cz = vertices[c*3+2]
  const ex = bx-ax, ey = by-ay, ez = bz-az
  const fx = cx-ax, fy = cy-ay, fz = cz-az
  return [ey*fz - ez*fy, ez*fx - ex*fz, ex*fy - ey*fx]
}

const BASE = {
  widthMM: 40,
  heightMM: 30,
  minThickness: 0.8,
  maxThickness: 3.0,
  borderWidthMM: 4,
  invertHeight: false,
}

// ---------------------------------------------------------------------------
// Phase 3a tests (top surface only) — all should PASS
// ---------------------------------------------------------------------------

describe('MeshGenerator — Phase 3a (top surface)', () => {

  // Test 2
  it('face index bounds: every index < vertices.length / 3', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices, faces } = generate(hm, BASE)
    const vertexCount = vertices.length / 3
    for (let i = 0; i < faces.length; i++) {
      expect(faces[i]).toBeLessThan(vertexCount)
    }
  })

  // Test 3
  it('top surface face normals have Z > 0', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices, faces } = generate(hm, BASE)
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i+1], c = faces[i+2]
      // Skip bottom faces (any vertex at Z=0 means it's not a top surface triangle)
      const isBottom = [a, b, c].some(vi => Math.abs(vertices[vi*3+2]) < 1e-6)
      if (isBottom) continue
      const [, , nz] = faceNormal(vertices, a, b, c)
      expect(nz).toBeGreaterThan(0)
    }
  })

  // Test 7a
  it('invertHeight=false: brightness 0.0 → maxThickness, 1.0 → minThickness', () => {
    const hm = [[0.0, 1.0], [0.0, 1.0]]  // 2 rows × 2 cols
    const params = { ...BASE, borderWidthMM: 0, invertHeight: false }
    const { vertices } = generate(hm, params)
    // col=0 → brightness 0.0 → maxThickness
    expect(vertices[2]).toBeCloseTo(BASE.maxThickness, 5)
    // col=1 → brightness 1.0 → minThickness
    expect(vertices[5]).toBeCloseTo(BASE.minThickness, 5)
  })

  // Test 7b
  it('invertHeight=true: brightness 0.0 → minThickness, 1.0 → maxThickness', () => {
    const hm = [[0.0, 1.0], [0.0, 1.0]]
    const params = { ...BASE, borderWidthMM: 0, invertHeight: true }
    const { vertices } = generate(hm, params)
    expect(vertices[2]).toBeCloseTo(BASE.minThickness, 5)
    expect(vertices[5]).toBeCloseTo(BASE.maxThickness, 5)
  })

  // Test 9 (zero border — relief grid spans full dimensions)
  // Note: updated in 3c to use non-zero border once border/bottom vertices are added.
  it('bounding box (zero border): X in [0, widthMM], Y in [0, heightMM]', () => {
    const hm = makeHeightmap(4, 3)
    const params = { ...BASE, borderWidthMM: 0 }
    const { vertices } = generate(hm, params)
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i])
      maxX = Math.max(maxX, vertices[i])
      minY = Math.min(minY, vertices[i+1])
      maxY = Math.max(maxY, vertices[i+1])
    }
    expect(minX).toBeCloseTo(0, 5)
    expect(maxX).toBeCloseTo(BASE.widthMM, 5)
    expect(minY).toBeCloseTo(0, 5)
    expect(maxY).toBeCloseTo(BASE.heightMM, 5)
  })

})

// ---------------------------------------------------------------------------
// Phase 3b tests — bottom surface
// ---------------------------------------------------------------------------

describe('MeshGenerator — Phase 3b (bottom surface)', () => {

  // Test 4
  it('bottom face normals have Z < 0', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices, faces } = generate(hm, BASE)
    let foundBottom = false
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2]
      const allAtZero = [a, b, c].every(vi => Math.abs(vertices[vi * 3 + 2]) < 1e-6)
      if (allAtZero) {
        foundBottom = true
        const [, , nz] = faceNormal(vertices, a, b, c)
        expect(nz).toBeLessThan(0)
      }
    }
    expect(foundBottom).toBe(true)
  })

})

// ---------------------------------------------------------------------------
// Phase 3c tests — border ring + side walls
// ---------------------------------------------------------------------------

describe('MeshGenerator — Phase 3c (border + side walls + watertight)', () => {

  // Test 1
  it('vertex count = rows*cols + 8 (4 bottom + 4 outer border corners)', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices } = generate(hm, BASE)
    expect(vertices.length / 3).toBe(4 * 3 + 8)
  })

  // Test 5
  it('watertight: every edge appears exactly twice', () => {
    const hm = makeHeightmap(4, 3)
    const { faces } = generate(hm, BASE)
    const edgeCount = new Map()
    const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2]
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = key(u, v)
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
      }
    }
    for (const [k, count] of edgeCount) {
      expect(count, `edge ${k} appears ${count} times (expected 2)`).toBe(2)
    }
  })

  // Test 6
  it('outer border vertices are all at Z = maxThickness', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices } = generate(hm, BASE)
    const b = BASE.borderWidthMM
    const w = BASE.widthMM, h = BASE.heightMM
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
      const outsideRelief = x < b - 1e-6 || x > w - b + 1e-6 || y < b - 1e-6 || y > h - b + 1e-6
      if (outsideRelief && z > 1e-6) {
        expect(z).toBeCloseTo(BASE.maxThickness, 5)
      }
    }
  })

  // Test 8
  it('zero border width: mesh is still watertight', () => {
    const hm = makeHeightmap(4, 3)
    const params = { ...BASE, borderWidthMM: 0 }
    const { faces } = generate(hm, params)
    const edgeCount = new Map()
    const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2]
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = key(u, v)
        edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
      }
    }
    for (const [k, count] of edgeCount) {
      expect(count, `edge ${k} appears ${count} times`).toBe(2)
    }
  })

  // Test 9 (updated from 3a: now uses non-zero border, full mesh spans full dimensions)
  it('bounding box (non-zero border): full mesh spans [0, widthMM] × [0, heightMM]', () => {
    const hm = makeHeightmap(4, 3)
    const { vertices } = generate(hm, BASE)
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i])
      maxX = Math.max(maxX, vertices[i])
      minY = Math.min(minY, vertices[i + 1])
      maxY = Math.max(maxY, vertices[i + 1])
    }
    expect(minX).toBeCloseTo(0, 5)
    expect(maxX).toBeCloseTo(BASE.widthMM, 5)
    expect(minY).toBeCloseTo(0, 5)
    expect(maxY).toBeCloseTo(BASE.heightMM, 5)
  })

})
