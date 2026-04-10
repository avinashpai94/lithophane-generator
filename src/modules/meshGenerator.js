/**
 * MeshGenerator — converts a heightmap + parameters into a watertight triangle mesh.
 *
 * Vertex buffer layout:
 *   [0,          rows*cols)   — top surface, row-major (r*cols+c)
 *   [rows*cols,  +4)          — bottom corners at Z=0: BL, BR, TL, TR
 *   [rows*cols+4,+4)          — outer border corners at Z=maxThickness: BL, BR, TL, TR
 *
 * Face topology (all CCW winding, outward normals):
 *   Top surface    — (rows-1)*(cols-1)*2 triangles, +Z normals
 *   Bottom face    — 2 triangles, -Z normals
 *   Border strips  — 4 fan strips connecting relief outer edge to outer corners, +Z normals
 *   Side walls     — 4 quads (8 triangles) connecting outer corners to bottom corners
 *
 * @param {number[][]} heightmap - row-major brightness values [0.0, 1.0]
 * @param {object} params
 * @param {number} params.widthMM
 * @param {number} params.heightMM
 * @param {number} params.minThickness
 * @param {number} params.maxThickness
 * @param {number} params.borderWidthMM
 * @param {boolean} params.invertHeight
 * @returns {{ vertices: Float32Array, faces: Uint32Array, normals: Float32Array }}
 */
export function generate(heightmap, params) {
  const { widthMM, heightMM, minThickness, maxThickness, borderWidthMM, invertHeight, floorZ = 0 } = params

  const rows = heightmap.length
  const cols = heightmap[0].length

  // Relief area is inset by border on all sides.
  const x0 = borderWidthMM
  const x1 = widthMM - borderWidthMM
  const y0 = borderWidthMM
  const y1 = heightMM - borderWidthMM
  const reliefW = x1 - x0
  const reliefH = y1 - y0

  // ── Vertex buffer ────────────────────────────────────────────────────────
  const topCount  = rows * cols
  const botOffset = topCount          // bottom corners start here
  const outOffset = topCount + 4      // outer border corners start here
  const totalVerts = topCount + 8

  const vertices = new Float32Array(totalVerts * 3)

  // Top surface (row-major)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const brightness = heightmap[row][col]
      // invertHeight=false (standard lithophane): dark→maxThickness, light→minThickness
      // invertHeight=true: reversed
      const t = invertHeight ? brightness : 1.0 - brightness
      const z = minThickness + t * (maxThickness - minThickness)
      const x = cols > 1 ? x0 + (col / (cols - 1)) * reliefW : x0 + reliefW / 2
      const y = rows > 1 ? y0 + (row / (rows - 1)) * reliefH : y0 + reliefH / 2
      const vi = (row * cols + col) * 3
      vertices[vi] = x; vertices[vi + 1] = y; vertices[vi + 2] = z
    }
  }

  // Bottom corners (Z=floorZ): BL, BR, TL, TR
  const botData = [0, 0, floorZ,  widthMM, 0, floorZ,  0, heightMM, floorZ,  widthMM, heightMM, floorZ]
  for (let i = 0; i < 12; i++) vertices[botOffset * 3 + i] = botData[i]

  // Outer border corners (Z=maxThickness): BL, BR, TL, TR
  const outData = [
    0,       0,        maxThickness,
    widthMM, 0,        maxThickness,
    0,       heightMM, maxThickness,
    widthMM, heightMM, maxThickness,
  ]
  for (let i = 0; i < 12; i++) vertices[outOffset * 3 + i] = outData[i]

  // ── Named vertex indices ─────────────────────────────────────────────────
  const rv     = (r, c) => r * cols + c   // top surface vertex
  const BL_bot = botOffset + 0, BR_bot = botOffset + 1
  const TL_bot = botOffset + 2, TR_bot = botOffset + 3
  const BL_out = outOffset + 0, BR_out = outOffset + 1
  const TL_out = outOffset + 2, TR_out = outOffset + 3

  // ── Face buffer (flat array, 3 indices per triangle) ─────────────────────
  const f = []

  // Top surface: two CCW triangles per quad cell
  // A,B,D winding: (B-A)×(D-A) has +Z  ✓
  // A,D,C winding: (D-A)×(C-A) has +Z  ✓
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = rv(row, col),     b = rv(row, col + 1)
      const c = rv(row + 1, col), d = rv(row + 1, col + 1)
      f.push(a, b, d,  a, d, c)
    }
  }

  // Bottom face: two triangles, -Z normals
  // (TL_bot-BL_bot)×(BR_bot-BL_bot) = (0,H,0)×(W,0,0) = (0,0,-WH) → -Z  ✓
  f.push(BL_bot, TL_bot, BR_bot,  BR_bot, TL_bot, TR_bot)

  // ── Border strip fan triangulation ───────────────────────────────────────
  //
  // Each strip connects N inner perimeter vertices to 2 outer corner vertices.
  // mid = ⌊(N-1)/2⌋ — the "bridge" triangle index containing the L–R outer edge.
  //
  // 'bottomRight' = true  → outer corner sits between inner vertices in the winding:
  //   (inner[i], oL, inner[i+1])  for left fan
  //   (inner[mid], oL, oR)        bridge
  //   (inner[i], oR, inner[i+1]) for right fan
  //
  // 'bottomRight' = false → outer corner sits after the inner pair:
  //   (inner[i], inner[i+1], oL)  for left fan
  //   (inner[mid], oR, oL)        bridge
  //   (inner[i], inner[i+1], oR) for right fan
  //
  // The winding difference comes from whether the outer is at -Y/-X (bottom/left)
  // or +Y/+X (top/right) relative to the inner edge.
  const strip = (inner, oL, oR, bottomRight) => {
    const N   = inner.length
    const mid = Math.floor((N - 1) / 2)
    if (bottomRight) {
      for (let i = 0; i < mid; i++)     f.push(inner[i], oL, inner[i + 1])
      f.push(inner[mid], oL, oR)
      for (let i = mid; i < N - 1; i++) f.push(inner[i], oR, inner[i + 1])
    } else {
      for (let i = 0; i < mid; i++)     f.push(inner[i], inner[i + 1], oL)
      f.push(inner[mid], oR, oL)
      for (let i = mid; i < N - 1; i++) f.push(inner[i], inner[i + 1], oR)
    }
  }

  const botRow = Array.from({ length: cols }, (_, c) => rv(0,        c))
  const rgtCol = Array.from({ length: rows }, (_, r) => rv(r,        cols - 1))
  const topRow = Array.from({ length: cols }, (_, c) => rv(rows - 1, c))
  const lftCol = Array.from({ length: rows }, (_, r) => rv(r,        0))

  strip(botRow, BL_out, BR_out, true)   // bottom strip: outer at -Y
  strip(rgtCol, BR_out, TR_out, true)   // right strip:  outer at +X
  strip(topRow, TL_out, TR_out, false)  // top strip:    outer at +Y
  strip(lftCol, BL_out, TL_out, false)  // left strip:   outer at -X

  // ── Side walls ───────────────────────────────────────────────────────────
  // Each wall is one quad (2 triangles) connecting outer corners to bottom corners.
  // Verified normals (cross product of two edges):
  //   Bottom: -Y  Right: +X  Top: +Y  Left: -X
  f.push(
    BL_out, BL_bot, BR_out,  BL_bot, BR_bot, BR_out,  // bottom wall (-Y)
    BR_out, BR_bot, TR_out,  BR_bot, TR_bot, TR_out,  // right wall  (+X)
    TR_out, TR_bot, TL_out,  TR_bot, TL_bot, TL_out,  // top wall    (+Y)
    TL_out, TL_bot, BL_out,  TL_bot, BL_bot, BL_out,  // left wall   (-X)
  )

  const faces   = new Uint32Array(f)
  const normals = computeVertexNormals(vertices, faces, totalVerts)

  return { vertices, faces, normals }
}

/**
 * Generate two separate watertight meshes for 2-color/multi-material printing.
 *
 * baseMesh:   flat box covering the full W × H footprint at baseThicknessMM.
 *             This is printed in the background color.
 * reliefMesh: the image relief layer sitting on top of the base plate.
 *             Floor at Z = baseThicknessMM, peaks at baseThicknessMM + reliefHeightMM.
 *             This is printed in the foreground color.
 *
 * The two meshes share the same XY footprint but have non-overlapping Z ranges:
 *   baseMesh:   Z ∈ [0, baseThicknessMM]
 *   reliefMesh: Z ∈ [baseThicknessMM + Z_INTERFACE_GAP, baseThicknessMM + Z_INTERFACE_GAP + reliefHeightMM]
 *
 * Z_INTERFACE_GAP (0.01mm) prevents Bambu Studio's "conflicting gcode paths" error
 * that occurs when two objects share an exact Z plane. The gap is smaller than any
 * practical layer height so it has no effect on the print.
 *
 * @param {number[][]} heightmap
 * @param {{
 *   widthMM: number,
 *   heightMM: number,
 *   baseThicknessMM: number,
 *   reliefHeightMM: number,
 *   borderWidthMM: number,
 *   invertHeight: boolean,
 * }} params
 * @returns {{ baseMesh: MeshData, reliefMesh: MeshData }}
 */
const Z_INTERFACE_GAP = 0.01  // mm — prevents coplanar-face conflict in Bambu Studio

export function generateTwoColor(heightmap, params) {
  const { widthMM, heightMM, baseThicknessMM, reliefHeightMM, borderWidthMM, invertHeight } = params
  const floorZ = baseThicknessMM + Z_INTERFACE_GAP

  return {
    baseMesh:   _buildBaseMesh(widthMM, heightMM, baseThicknessMM),
    reliefMesh: generate(heightmap, {
      widthMM,
      heightMM,
      minThickness: floorZ,
      maxThickness: floorZ + reliefHeightMM,
      borderWidthMM,
      invertHeight,
      floorZ,
    }),
  }
}

/**
 * Build a simple flat watertight box: W × H × thickness, origin at (0,0,0).
 * 8 vertices, 12 triangles.
 */
function _buildBaseMesh(widthMM, heightMM, thickness) {
  // Vertices: 4 top corners (Z=thickness) + 4 bottom corners (Z=0)
  // Index:  0=BL_top, 1=BR_top, 2=TL_top, 3=TR_top
  //         4=BL_bot, 5=BR_bot, 6=TL_bot, 7=TR_bot
  const vertices = new Float32Array([
    0,       0,        thickness,   // 0 BL_top
    widthMM, 0,        thickness,   // 1 BR_top
    0,       heightMM, thickness,   // 2 TL_top
    widthMM, heightMM, thickness,   // 3 TR_top
    0,       0,        0,           // 4 BL_bot
    widthMM, 0,        0,           // 5 BR_bot
    0,       heightMM, 0,           // 6 TL_bot
    widthMM, heightMM, 0,           // 7 TR_bot
  ])

  // All CCW winding, outward normals
  const faces = new Uint32Array([
    // Top face (+Z)
    0, 1, 3,   0, 3, 2,
    // Bottom face (-Z)
    4, 6, 5,   5, 6, 7,
    // Front wall (-Y)
    0, 4, 1,   1, 4, 5,
    // Back wall (+Y)
    3, 7, 2,   2, 7, 6,
    // Right wall (+X)
    1, 5, 3,   3, 5, 7,
    // Left wall (-X)
    0, 2, 4,   4, 2, 6,
  ])

  const normals = computeVertexNormals(vertices, faces, 8)
  return { vertices, faces, normals }
}

/**
 * Compute per-vertex normals by accumulating and averaging adjacent face normals.
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
    const ni  = i * 3
    const len = Math.sqrt(normals[ni] ** 2 + normals[ni + 1] ** 2 + normals[ni + 2] ** 2)
    if (len > 0) {
      normals[ni] /= len; normals[ni + 1] /= len; normals[ni + 2] /= len
    }
  }

  return normals
}
