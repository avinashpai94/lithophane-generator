import { useState, useRef, useEffect, useCallback } from 'react'
import { processImage, getGrayscalePreview } from './modules/imageProcessor.js'
import { generate, generateTwoColor } from './modules/meshGenerator.js'
import { exportBinary }  from './modules/stlExporter.js'
import { PreviewRenderer } from './modules/previewRenderer.js'
import { useHistory }    from './hooks/useHistory.js'
import ImageUploader  from './components/ImageUploader.jsx'
import ParameterPanel from './components/ParameterPanel.jsx'
import PreviewPanel   from './components/PreviewPanel.jsx'
import Toolbar        from './components/Toolbar.jsx'

const DEFAULT_TWO_COLOR_PARAMS = {
  baseThicknessMM: 0.6,
  reliefHeightMM:  1.2,
  baseColor:       '#222222',
  reliefColor:     '#f0ead6',
}

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
  const [sourceImage,      setSourceImage]      = useState(null)
  const [grayscalePreview, setGrayscalePreview] = useState(null)
  const [params,           setParams]           = useState(DEFAULT_PARAMS)
  const [meshData,         setMeshData]         = useState(null)
  const [exportMode,       setExportMode]       = useState('standard') // 'standard' | 'twoColor'
  const [twoColorParams,   setTwoColorParams]   = useState(DEFAULT_TWO_COLOR_PARAMS)
  const [twoColorData,     setTwoColorData]     = useState(null) // { baseMesh, reliefMesh }

  const history = useHistory(20)

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
    setTwoColorData(null)
    history.clear()
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

    const prev = history.current

    // Skip ImageProcessor when only physical dimensions changed with aspect locked
    const needsImageProc = !prev ||
      prev.params.pixelPitchMM !== params.pixelPitchMM ||
      (!params.lockAspectRatio && (
        prev.params.widthMM  !== params.widthMM ||
        prev.params.heightMM !== params.heightMM
      ))

    const heightmap = needsImageProc
      ? processImage(sourceImage, cols, rows)
      : prev.heightmap

    if (exportMode === 'twoColor') {
      const { baseMesh, reliefMesh } = generateTwoColor(heightmap, {
        widthMM:         params.widthMM,
        heightMM:        params.heightMM,
        baseThicknessMM: twoColorParams.baseThicknessMM,
        reliefHeightMM:  twoColorParams.reliefHeightMM,
        borderWidthMM:   params.borderWidthMM,
        invertHeight:    params.invertHeight,
      })
      // Single combined mesh for STL export — floor at Z=0, no interface gap
      const singleExportMesh = generate(heightmap, {
        widthMM:       params.widthMM,
        heightMM:      params.heightMM,
        minThickness:  twoColorParams.baseThicknessMM,
        maxThickness:  twoColorParams.baseThicknessMM + twoColorParams.reliefHeightMM,
        borderWidthMM: params.borderWidthMM,
        invertHeight:  params.invertHeight,
      })
      setTwoColorData({ baseMesh, reliefMesh, singleExportMesh })
      setMeshData(null)
      rendererRef.current?.updateTwoColorMesh(baseMesh, reliefMesh, twoColorParams.baseColor, twoColorParams.reliefColor)
      history.push({ params: { ...params }, heightmap, exportMode, twoColorParams: { ...twoColorParams } })
    } else {
      const mesh = generate(heightmap, {
        widthMM:       params.widthMM,
        heightMM:      params.heightMM,
        minThickness:  params.minThickness,
        maxThickness:  params.maxThickness,
        borderWidthMM: params.borderWidthMM,
        invertHeight:  params.invertHeight,
      })
      setMeshData(mesh)
      setTwoColorData(null)
      rendererRef.current?.updateMesh(mesh)
      history.push({ params: { ...params }, heightmap, exportMode, twoColorParams: null })
    }
  }, [sourceImage, params, exportMode, twoColorParams, history])

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const restoreSnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    setParams(snapshot.params)
    if (snapshot.exportMode === 'twoColor' && snapshot.twoColorParams) {
      setExportMode('twoColor')
      setTwoColorParams(snapshot.twoColorParams)
      const { baseMesh, reliefMesh } = generateTwoColor(snapshot.heightmap, {
        widthMM:         snapshot.params.widthMM,
        heightMM:        snapshot.params.heightMM,
        baseThicknessMM: snapshot.twoColorParams.baseThicknessMM,
        reliefHeightMM:  snapshot.twoColorParams.reliefHeightMM,
        borderWidthMM:   snapshot.params.borderWidthMM,
        invertHeight:    snapshot.params.invertHeight,
      })
      const singleExportMesh = generate(snapshot.heightmap, {
        widthMM:       snapshot.params.widthMM,
        heightMM:      snapshot.params.heightMM,
        minThickness:  snapshot.twoColorParams.baseThicknessMM,
        maxThickness:  snapshot.twoColorParams.baseThicknessMM + snapshot.twoColorParams.reliefHeightMM,
        borderWidthMM: snapshot.params.borderWidthMM,
        invertHeight:  snapshot.params.invertHeight,
      })
      setTwoColorData({ baseMesh, reliefMesh, singleExportMesh })
      setMeshData(null)
      rendererRef.current?.updateTwoColorMesh(baseMesh, reliefMesh, snapshot.twoColorParams.baseColor, snapshot.twoColorParams.reliefColor)
    } else {
      setExportMode('standard')
      const mesh = generate(snapshot.heightmap, {
        widthMM:       snapshot.params.widthMM,
        heightMM:      snapshot.params.heightMM,
        minThickness:  snapshot.params.minThickness,
        maxThickness:  snapshot.params.maxThickness,
        borderWidthMM: snapshot.params.borderWidthMM,
        invertHeight:  snapshot.params.invertHeight,
      })
      setMeshData(mesh)
      setTwoColorData(null)
      rendererRef.current?.updateMesh(mesh)
    }
  }, [])

  const handleUndo = useCallback(() => {
    const snap = history.prevSnapshot
    history.undo()
    restoreSnapshot(snap)
  }, [history, restoreSnapshot])

  const handleRedo = useCallback(() => {
    const snap = history.nextSnapshot
    history.redo()
    restoreSnapshot(snap)
  }, [history, restoreSnapshot])

  // Keyboard shortcuts — don't fire when typing in an input
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key === 'z') { e.preventDefault(); handleRedo() }
      else if (mod && e.key === 'z')           { e.preventDefault(); handleUndo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // ── Live color preview update (no Apply needed for color-only changes) ───
  useEffect(() => {
    if (exportMode === 'twoColor' && twoColorData) {
      rendererRef.current?.updateTwoColorMesh(
        twoColorData.baseMesh, twoColorData.reliefMesh,
        twoColorParams.baseColor, twoColorParams.reliefColor,
      )
    }
  }, [twoColorParams.baseColor, twoColorParams.reliefColor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── STL download ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!meshData) return
    const blob = exportBinary(meshData)
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'lithophane.stl' })
    a.click()
    URL.revokeObjectURL(url)
  }, [meshData])

  const handleDownload2Color = useCallback(() => {
    if (!twoColorData) return
    const blob = exportBinary(twoColorData.singleExportMesh)
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'lithophane_2color.stl' })
    a.click()
    URL.revokeObjectURL(url)
  }, [twoColorData])

  const stats = twoColorData
    ? {
        triangles:    twoColorData.singleExportMesh.faces.length / 3,
        stlSizeMB:   ((84 + 50 * (twoColorData.singleExportMesh.faces.length / 3)) / 1e6).toFixed(2),
        twoColor:     true,
        transitionMM: twoColorParams.baseThicknessMM.toFixed(1),
      }
    : meshData
    ? {
        triangles:  meshData.faces.length / 3,
        stlSizeMB: ((84 + 50 * (meshData.faces.length / 3)) / 1e6).toFixed(2),
      }
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        onUndo={handleUndo}   canUndo={history.canUndo}
        onRedo={handleRedo}   canRedo={history.canRedo}
        exportMode={exportMode}
        onDownload={handleDownload}         canDownload={!!meshData}
        onDownload2Color={handleDownload2Color} canDownloadTwo={!!twoColorData}
        stats={stats}
        historyPos={history.position.total > 0
          ? `${history.position.current + 1}/${history.position.total}`
          : null}
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
            exportMode={exportMode} onExportModeChange={setExportMode}
            twoColorParams={twoColorParams} setTwoColorParams={setTwoColorParams}
          />
        </div>

        {/* Preview */}
        <PreviewPanel containerRef={previewContainerRef} hasMesh={!!meshData || !!twoColorData} />
      </div>
    </div>
  )
}
