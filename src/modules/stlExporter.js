/**
 * STLExporter — serializes a triangle mesh to binary STL format.
 *
 * Binary STL layout:
 *   Bytes 0–79:   Header (80 bytes, ASCII string padded with zeros)
 *   Bytes 80–83:  Triangle count (uint32, little-endian)
 *   Per triangle (50 bytes):
 *     Bytes  0–11: Normal vector (3 × float32 LE)
 *     Bytes 12–23: Vertex 1     (3 × float32 LE)
 *     Bytes 24–35: Vertex 2     (3 × float32 LE)
 *     Bytes 36–47: Vertex 3     (3 × float32 LE)
 *     Bytes 48–49: Attribute    (uint16 LE, 0)
 *
 * Face normals are recomputed from vertex cross products — the input
 * vertex normals (for smooth shading) are intentionally ignored here.
 *
 * @param {{ vertices: Float32Array, faces: Uint32Array }} mesh
 * @returns {Blob} binary STL with MIME type application/octet-stream
 */
export function exportBinary({ vertices, faces }) {
  const triCount  = faces.length / 3
  const bufSize   = 84 + 50 * triCount
  const buffer    = new ArrayBuffer(bufSize)
  const view      = new DataView(buffer)

  // Header (80 bytes): ASCII string, remainder zero-padded
  const header = 'Lithophane Generator — binary STL export'
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0)
  }

  // Triangle count
  view.setUint32(80, triCount, /* littleEndian */ true)

  // Per-triangle data
  let off = 84
  for (let t = 0; t < triCount; t++) {
    const ai = faces[t * 3]     * 3
    const bi = faces[t * 3 + 1] * 3
    const ci = faces[t * 3 + 2] * 3

    const ax = vertices[ai],     ay = vertices[ai + 1], az = vertices[ai + 2]
    const bx = vertices[bi],     by = vertices[bi + 1], bz = vertices[bi + 2]
    const cx = vertices[ci],     cy = vertices[ci + 1], cz = vertices[ci + 2]

    // Face normal via cross product of edges (B-A) × (C-A)
    const ex = bx - ax, ey = by - ay, ez = bz - az
    const fx = cx - ax, fy = cy - ay, fz = cz - az
    let nx = ey * fz - ez * fy
    let ny = ez * fx - ex * fz
    let nz = ex * fy - ey * fx
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len > 0) { nx /= len; ny /= len; nz /= len }

    // Normal
    view.setFloat32(off, nx, true); off += 4
    view.setFloat32(off, ny, true); off += 4
    view.setFloat32(off, nz, true); off += 4
    // Vertex A
    view.setFloat32(off, ax, true); off += 4
    view.setFloat32(off, ay, true); off += 4
    view.setFloat32(off, az, true); off += 4
    // Vertex B
    view.setFloat32(off, bx, true); off += 4
    view.setFloat32(off, by, true); off += 4
    view.setFloat32(off, bz, true); off += 4
    // Vertex C
    view.setFloat32(off, cx, true); off += 4
    view.setFloat32(off, cy, true); off += 4
    view.setFloat32(off, cz, true); off += 4
    // Attribute byte count (always 0)
    view.setUint16(off, 0, true);   off += 2
  }

  return new Blob([buffer], { type: 'application/octet-stream' })
}
