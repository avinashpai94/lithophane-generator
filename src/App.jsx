import { useState, useRef, useEffect, useCallback } from 'react'
import { processImage, getGrayscalePreview } from './modules/imageProcessor.js'
import { generate }      from './modules/meshGenerator.js'
import { exportBinary }  from './modules/stlExporter.js'
import { PreviewRenderer } from './modules/previewRenderer.js'
import ImageUploader  from './components/ImageUploader.jsx'
import ParameterPanel from './components/ParameterPanel.jsx'
import PreviewPanel   from './components/PreviewPanel.jsx'
import Toolbar        from './components/Toolbar.jsx'

const DEFAULT_PARAMS = {
  widthMM:        150,
  heightMM:       100,
  lockAspectRatio: true,
  minThickness:   0.8,
  maxThickness:   3.0,
  borderWidthMM:  4.0,
  pixelPitchMM:   0.4,
  invertHeight:   false,
}

export default function App() {
  const [sourceImage,   setSourceImage]   = useState(null)
  const [grayscalePreview, setGrayscalePreview] = useState(null)
  const [params,        setParams]        = useState(DEFAULT_PARAMS)
  const [meshData,      setMeshData]      = useState(null)

  // Track what was last applied so we can skip pipeline stages that haven't changed
  const lastApplied = useRef(null)  // { params, heightmap }

  const previewContainerRef = useRef(null)
  const rendererRef         = useRef(null)

  // ── Init Three.js renderer once the container div mounts ────────────────
  useEffect(() => {
    const container = previewContainerRef.current
    if (!container) return
    const renderer = new PreviewRenderer()
    renderer.init(container)
    rendererRef.current = renderer

    const onResize = () => {
      renderer.resize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  // ── Image upload ─────────────────────────────────────────────────────────
  const handleImageLoad = useCallback((img) => {
    setSourceImage(img)
    setGrayscalePreview(getGrayscalePreview(img, 300))
    setMeshData(null)
    lastApplied.current = null
    rendererRef.current?.resetFit()

    // Sync heightMM to image aspect ratio (keep widthMM, update height)
    setParams((p) => ({
      ...p,
      heightMM: p.lockAspectRatio
        ? Math.round(p.widthMM * (img.naturalHeight / img.naturalWidth) * 10) / 10
        : p.heightMM,
    }))
  }, [])

  // ── Apply button ─────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!sourceImage) return

    const cols = Math.max(2, Math.round(params.widthMM  / params.pixelPitchMM))
    const rows = Math.max(2, Math.round(params.heightMM / params.pixelPitchMM))

    const prev = lastApplied.current

    // Decide whether ImageProcessor needs to re-run.
    // Skip it when only physical dimensions changed with aspect locked
    // (the heightmap content is the same; MeshGenerator uses widthMM/heightMM for physical scale).
    const needsImageProc = !prev ||
      prev.params.pixelPitchMM !== params.pixelPitchMM ||
      (!params.lockAspectRatio && (
        prev.params.widthMM  !== params.widthMM ||
        prev.params.heightMM !== params.heightMM
      ))

    const heightmap = needsImageProc
      ? processImage(sourceImage, cols, rows)
      : prev.heightmap

    const meshParams = {
      widthMM:      params.widthMM,
      heightMM:     params.heightMM,
      minThickness: params.minThickness,
      maxThickness: params.maxThickness,
      borderWidthMM: params.borderWidthMM,
      invertHeight:  params.invertHeight,
    }

    const mesh = generate(heightmap, meshParams)
    setMeshData(mesh)
    lastApplied.current = { params: { ...params }, heightmap }

    rendererRef.current?.updateMesh(mesh)
  }, [sourceImage, params])

  // ── STL download ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!meshData) return
    const blob = exportBinary(meshData)
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'lithophane.stl' })
    a.click()
    URL.revokeObjectURL(url)
  }, [meshData])

  const stats = meshData ? {
    triangles: meshData.faces.length / 3,
    stlSizeMB: ((84 + 50 * (meshData.faces.length / 3)) / 1e6).toFixed(2),
  } : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        canUndo={false} canRedo={false}   // Phase 7
        onDownload={handleDownload} canDownload={!!meshData}
        stats={stats}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{
          width: 290, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)', overflowY: 'auto',
          background: 'var(--surface)',
        }}>
          <ImageUploader onImageLoad={handleImageLoad} grayscalePreview={grayscalePreview} />
          <ParameterPanel
            params={params} setParams={setParams}
            sourceImage={sourceImage} onApply={handleApply}
          />
        </div>

        {/* Preview */}
        <PreviewPanel containerRef={previewContainerRef} hasMesh={!!meshData} />
      </div>
    </div>
  )
}
