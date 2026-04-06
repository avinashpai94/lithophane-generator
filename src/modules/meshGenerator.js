/**
 * MeshGenerator — converts a heightmap + parameters into a triangle mesh.
 *
 * Phase 3a: top surface (relief grid) only.
 * Phase 3b will add: bottom surface + side walls.
 * Phase 3c will add: border ring + shared-vertex manifold connection.
 *
 * @param {number[][]} heightmap - row-major 2D array of brightness values [0.0, 1.0]
 * @param {object} params - MeshParams
 * @param {number} params.widthMM
 * @param {number} params.heightMM
 * @param {number} params.minThickness
 * @param {number} params.maxThickness
 * @param {number} params.borderWidthMM
 * @param {boolean} params.invertHeight
 * @returns {{ vertices: Float32Array, faces: Uint32Array, normals: Float32Array }}
 */
export function generate(heightmap, params) {
  const { widthMM, heightMM, minThickness, maxThickness, borderWidthMM, invertHeight } = params

  const rows = heightmap.length
  const cols = heightmap[0].length

  // Relief area is inset by the border on all sides.
  // In 3c, border vertices will fill the outer ring.
  const x0 = borderWidthMM
  const x1 = widthMM - borderWidthMM
  const y0 = borderWidthMM
  const y1 = heightMM - borderWidthMM
  const reliefW = x1 - x0
  const reliefH = y1 - y0

  // --- Top surface vertices (row-major: index = row * cols + col) ---
  const topVertexCount = rows * cols
  const vertices = new Float32Array(topVertexCount * 3)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const brightness = heightmap[row][col]
      // Standard lithophane (invertHeight=false): dark (0.0) → maxThickness (blocks light)
      //                                           light (1.0) → minThickness (transmits light)
      // Inverted (invertHeight=true): mapping reversed.
      const t = invertHeight ? brightness : 1.0 - brightness
      const z = minThickness + t * (maxThickness - minThickness)

      const x = cols > 1 ? x0 + (col / (cols - 1)) * reliefW : x0 + reliefW / 2
      const y = rows > 1 ? y0 + (row / (rows - 1)) * reliefH : y0 + reliefH / 2

      const vi = (row * cols + col) * 3
      vertices[vi]     = x
      vertices[vi + 1] = y
      vertices[vi + 2] = z
    }
  }

  // --- Top surface faces (two CCW triangles per quad cell) ---
  // For a quad with corners A(col,row), B(col+1,row), C(col,row+1), D(col+1,row+1):
  //   Triangle 1: A, B, D  →  (B-A)×(D-A) has +Z component  ✓
  //   Triangle 2: A, D, C  →  (D-A)×(C-A) has +Z component  ✓
  const quadCount = (cols - 1) * (rows - 1)
  const faces = new Uint32Array(quadCount * 6)
  let fi = 0

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col
      const b = row * cols + (col + 1)
      const c = (row + 1) * cols + col
      const d = (row + 1) * cols + (col + 1)

      faces[fi++] = a; faces[fi++] = b; faces[fi++] = d  // Triangle 1
      faces[fi++] = a; faces[fi++] = d; faces[fi++] = c  // Triangle 2
    }
  }

  const normals = computeVertexNormals(vertices, faces, topVertexCount)

  return { vertices, faces, normals }
}

/**
 * Compute per-vertex normals by averaging adjacent face normals.
 * @param {Float32Array} vertices
 * @param {Uint32Array} faces
 * @param {number} vertexCount
 * @returns {Float32Array}
 */
function computeVertexNormals(vertices, faces, vertexCount) {
  const normals = new Float32Array(vertexCount * 3)

  for (let i = 0; i < faces.length; i += 3) {
    const ai = faces[i]     * 3
    const bi = faces[i + 1] * 3
    const ci = faces[i + 2] * 3

    const ax = vertices[ai], ay = vertices[ai + 1], az = vertices[ai + 2]
    const bx = vertices[bi], by = vertices[bi + 1], bz = vertices[bi + 2]
    const cx = vertices[ci], cy = vertices[ci + 1], cz = vertices[ci + 2]

    const ex = bx - ax, ey = by - ay, ez = bz - az
    const fx = cx - ax, fy = cy - ay, fz = cz - az

    const nx = ey * fz - ez * fy
    const ny = ez * fx - ex * fz
    const nz = ex * fy - ey * fx

    normals[ai]     += nx; normals[ai + 1] += ny; normals[ai + 2] += nz
    normals[bi]     += nx; normals[bi + 1] += ny; normals[bi + 2] += nz
    normals[ci]     += nx; normals[ci + 1] += ny; normals[ci + 2] += nz
  }

  for (let i = 0; i < vertexCount; i++) {
    const ni = i * 3
    const len = Math.sqrt(normals[ni] ** 2 + normals[ni + 1] ** 2 + normals[ni + 2] ** 2)
    if (len > 0) {
      normals[ni]     /= len
      normals[ni + 1] /= len
      normals[ni + 2] /= len
    }
  }

  return normals
}
