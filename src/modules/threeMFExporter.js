/**
 * ThreeMFExporter — serializes two meshes (base + relief) into a .3mf file.
 *
 * A .3mf file is a ZIP archive containing:
 *   [Content_Types].xml  — MIME type declarations
 *   _rels/.rels          — relationship pointing to the model
 *   3D/3dmodel.model     — XML with two <object> elements
 *
 * When imported into Bambu Studio, both objects appear in the object list
 * and can be assigned separate AMS filament slots.
 */
import { zipSync, strToU8 } from 'fflate'

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`

/**
 * Serialize one mesh's vertices + faces into 3MF <object> XML.
 * Uses array push + join to avoid O(n²) string concatenation.
 */
function meshToObjectXml(mesh, id, name) {
  const { vertices, faces } = mesh
  const parts = []

  parts.push(`    <object id="${id}" name="${name}" type="model">\n`)
  parts.push(`      <mesh>\n        <vertices>\n`)

  for (let i = 0; i < vertices.length; i += 3) {
    parts.push(
      `          <vertex x="${vertices[i].toFixed(4)}" y="${vertices[i + 1].toFixed(4)}" z="${vertices[i + 2].toFixed(4)}"/>\n`
    )
  }

  parts.push(`        </vertices>\n        <triangles>\n`)

  for (let i = 0; i < faces.length; i += 3) {
    parts.push(`          <triangle v1="${faces[i]}" v2="${faces[i + 1]}" v3="${faces[i + 2]}"/>\n`)
  }

  parts.push(`        </triangles>\n      </mesh>\n    </object>\n`)
  return parts.join('')
}

function buildModelXml(baseMesh, reliefMesh) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>\n`,
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`,
    `  <resources>\n`,
    meshToObjectXml(baseMesh,   1, 'Base'),
    meshToObjectXml(reliefMesh, 2, 'Relief'),
    `  </resources>\n`,
    `  <build>\n`,
    `    <item objectid="1"/>\n`,
    `    <item objectid="2"/>\n`,
    `  </build>\n`,
    `</model>`,
  ].join('')
}

/**
 * Export two meshes as a single .3mf file.
 *
 * @param {{ baseMesh: MeshData, reliefMesh: MeshData }} param
 * @returns {Blob}
 */
export function exportThreeMF({ baseMesh, reliefMesh }) {
  const modelXml = buildModelXml(baseMesh, reliefMesh)

  const zipped = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels':         strToU8(RELS_XML),
    '3D/3dmodel.model':   strToU8(modelXml),
  }, { level: 6 })

  return new Blob([zipped], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' })
}
