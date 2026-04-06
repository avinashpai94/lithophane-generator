import { describe, it, expect } from 'vitest'
import { exportBinary } from '../src/modules/stlExporter.js'
import { generate }     from '../src/modules/meshGenerator.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeightmap(cols, rows, value = 0.5) {
  return Array.from({ length: rows }, () => Array(cols).fill(value))
}

/**
 * Parse a binary STL Blob back into structured data.
 * Returns { buffer, triCount, triangles } where each triangle is
 * { normal: [nx,ny,nz], verts: [[x,y,z], [x,y,z], [x,y,z]] }.
 */
async function parseSTL(blob) {
  const buffer   = await blob.arrayBuffer()
  const view     = new DataView(buffer)
  const triCount = view.getUint32(80, true)
  const triangles = []
  let off = 84
  for (let t = 0; t < triCount; t++) {
    const normal = [
      view.getFloat32(off,      true),
      view.getFloat32(off +  4, true),
      view.getFloat32(off +  8, true),
    ]
    off += 12
    const verts = []
    for (let v = 0; v < 3; v++) {
      verts.push([
        view.getFloat32(off,     true),
        view.getFloat32(off + 4, true),
        view.getFloat32(off + 8, true),
      ])
      off += 12
    }
    off += 2  // attribute
    triangles.push({ normal, verts })
  }
  return { buffer, triCount, triangles, finalOffset: off }
}

const BASE = {
  widthMM: 40, heightMM: 30,
  minThickness: 0.8, maxThickness: 3.0,
  borderWidthMM: 4, invertHeight: false,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STLExporter', () => {

  // Test 1
  it('file size = 84 + 50 × triCount bytes exactly', () => {
    const mesh = generate(makeHeightmap(4, 3), BASE)
    const blob = exportBinary(mesh)
    expect(blob.size).toBe(84 + 50 * (mesh.faces.length / 3))
  })

  // Test 2
  it('header: first 80 bytes are ASCII, trailing bytes are zero-padded', async () => {
    const mesh   = generate(makeHeightmap(4, 3), BASE)
    const blob   = exportBinary(mesh)
    const buffer = await blob.arrayBuffer()
    const view   = new DataView(buffer)
    const bytes  = Array.from({ length: 80 }, (_, i) => view.getUint8(i))
    // All bytes must be valid printable ASCII or zero
    expect(bytes.every(b => b <= 127)).toBe(true)
    // After the first zero byte, all remaining bytes must also be zero
    const firstZero = bytes.findIndex(b => b === 0)
    if (firstZero !== -1) {
      expect(bytes.slice(firstZero).every(b => b === 0)).toBe(true)
    }
  })

  // Test 3
  it('bytes 80–83 (uint32 LE) = faces.length / 3', async () => {
    const mesh   = generate(makeHeightmap(4, 3), BASE)
    const blob   = exportBinary(mesh)
    const buffer = await blob.arrayBuffer()
    const view   = new DataView(buffer)
    expect(view.getUint32(80, true)).toBe(mesh.faces.length / 3)
  })

  // Test 4
  it('round-trip: parsed vertex positions match input mesh within float32 tolerance', async () => {
    const mesh = generate(makeHeightmap(4, 3), BASE)
    const blob = exportBinary(mesh)
    const { triangles } = await parseSTL(blob)
    for (let t = 0; t < triangles.length; t++) {
      const { verts } = triangles[t]
      for (let v = 0; v < 3; v++) {
        const vi = mesh.faces[t * 3 + v] * 3
        expect(verts[v][0]).toBeCloseTo(mesh.vertices[vi],     4)
        expect(verts[v][1]).toBeCloseTo(mesh.vertices[vi + 1], 4)
        expect(verts[v][2]).toBeCloseTo(mesh.vertices[vi + 2], 4)
      }
    }
  })

  // Test 5
  it('all normals have unit magnitude ≈ 1.0 (degenerate zero-normals excepted)', async () => {
    const mesh = generate(makeHeightmap(4, 3), BASE)
    const blob = exportBinary(mesh)
    const { triangles } = await parseSTL(blob)
    for (const { normal: [nx, ny, nz] } of triangles) {
      const mag = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (mag > 1e-6) {
        expect(mag).toBeCloseTo(1.0, 4)
      }
    }
  })

  // Test 6
  it('bottom face triangles (all vertices at Z=0) have normal Z < 0', async () => {
    const mesh = generate(makeHeightmap(4, 3), BASE)
    const blob = exportBinary(mesh)
    const { triangles } = await parseSTL(blob)
    let foundBottom = false
    for (const { normal, verts } of triangles) {
      if (verts.every(([, , z]) => Math.abs(z) < 1e-6)) {
        foundBottom = true
        expect(normal[2]).toBeLessThan(0)
      }
    }
    expect(foundBottom).toBe(true)
  })

  // Test 7
  it('valid binary structure: file size matches header triangle count, no extra bytes', async () => {
    const mesh = generate(makeHeightmap(4, 3), BASE)
    const blob = exportBinary(mesh)
    const { buffer, triCount, finalOffset } = await parseSTL(blob)
    // Internal consistency: header count drives the expected size
    expect(buffer.byteLength).toBe(84 + 50 * triCount)
    // After sequential parsing, offset lands exactly at end of file
    expect(finalOffset).toBe(buffer.byteLength)
  })

})
