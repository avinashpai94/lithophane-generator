import { useState, useRef, useEffect, useCallback } from 'react'
import { processImage, getGrayscalePreview, applyContrastMode, analyzeHeightmap, verdictFromAnalysis } from './modules/imageProcessor.js'
import { generate, generateTwoColor, generatePlaque } from './modules/meshGenerator.js'
import { exportBinary }  from './modules/stlExporter.js'
import { PreviewRenderer } from './modules/previewRenderer.js'
import { useHistory }    from './hooks/useHistory.js'
import ImageUploader  from './components/ImageUploader.jsx'
import ParameterPanel from './components/ParameterPanel.jsx'
import PreviewPanel   from './components/PreviewPanel.jsx'
import Toolbar        from './components/Toolbar.jsx'
import GalleryModal   from './components/GalleryModal.jsx'
import { makeCacheKey, getScore, setScore } from './modules/scoreCache.js'

const DEFAULT_PLAQUE_PARAMS = {
  baseHeightMM:   1.2,
  columnHeightMM: 0.8,
  baseColor:      '#f0ead6',
  columnColor:    '#222222',
}

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
  contrastMode:   'linear',
  layerHeightMM:  0.2,
  ditherLevels:   2,
}

function computeNumLevels(params, exportMode, twoColorParams) {
  if (params.contrastMode === 'dithered') {
    return Math.max(2, params.ditherLevels)
  }
  const reliefMM = exportMode === 'twoColor'
    ? twoColorParams.reliefHeightMM
    : (params.maxThickness - params.minThickness)
  return Math.max(2, Math.floor(reliefMM / params.layerHeightMM))
}

export default function App() {
  const [sourceImage,      setSourceImage]      = useState(null)
  const [grayscalePreview, setGrayscalePreview] = useState(null)
  const [params,           setParams]           = useState(DEFAULT_PARAMS)
  const [meshData,         setMeshData]         = useState(null)
  const [exportMode,       setExportMode]       = useState('standard') // 'standard' | 'twoColor' | 'plaque'
  const [twoColorParams,   setTwoColorParams]   = useState(DEFAULT_TWO_COLOR_PARAMS)
  const [twoColorData,     setTwoColorData]     = useState(null) // { baseMesh, reliefMesh }
  const [plaqueParams,     setPlaqueParams]     = useState(DEFAULT_PLAQUE_PARAMS)
  const [plaqueData,       setPlaqueData]       = useState(null) // { baseMesh, columnMesh }
  const [imageAnalysis,    setImageAnalysis]    = useState(null)
  const [galleryOpen,      setGalleryOpen]      = useState(false)
  const [galleryResults,   setGalleryResults]   = useState([])   // { file, score, thumbnail }[]
  const [galleryProgress,  setGalleryProgress]  = useState({ done: 0, total: 0, cached: 0 })

  const history = useHistory(20)

  const previewContainerRef = useRef(null)
  const rendererRef         = useRef(null)
  const scanInputRef        = useRef(null)

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
    setPlaqueData(null)
    setImageAnalysis(null)
    history.clear()
    rendererRef.current?.resetFit()

    // Analyse at a fixed small resolution — fast, independent of print params
    const analysisRows = Math.max(2, Math.round(150 * (img.naturalHeight / img.naturalWidth)))
    const analysisHeightmap = processImage(img, 150, analysisRows)
    setImageAnalysis(analyzeHeightmap(analysisHeightmap))

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

    const rawHeightmap = needsImageProc
      ? processImage(sourceImage, cols, rows)
      : prev.heightmap

    if (exportMode === 'plaque') {
      // Plaque always uses binary dithering — halftone looks best for reflected-light prints
      const heightmap = applyContrastMode(rawHeightmap, 'dithered', { numLevels: 2 })
      const { baseMesh, columnMesh } = generatePlaque(heightmap, {
        widthMM:        params.widthMM,
        heightMM:       params.heightMM,
        baseHeightMM:   plaqueParams.baseHeightMM,
        columnHeightMM: plaqueParams.columnHeightMM,
        borderWidthMM:  params.borderWidthMM,
      })
      setPlaqueData({ baseMesh, columnMesh })
      setMeshData(null)
      setTwoColorData(null)
      rendererRef.current?.updateTwoColorMesh(baseMesh, columnMesh, plaqueParams.baseColor, plaqueParams.columnColor)
      history.push({ params: { ...params }, heightmap: rawHeightmap, exportMode, twoColorParams: null, plaqueParams: { ...plaqueParams } })
      return
    }

    const numLevels = computeNumLevels(params, exportMode, twoColorParams)
    const heightmap = applyContrastMode(rawHeightmap, params.contrastMode, { numLevels })

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
      setPlaqueData(null)
      rendererRef.current?.updateTwoColorMesh(baseMesh, reliefMesh, twoColorParams.baseColor, twoColorParams.reliefColor)
      history.push({ params: { ...params }, heightmap: rawHeightmap, exportMode, twoColorParams: { ...twoColorParams }, plaqueParams: null })
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
      setPlaqueData(null)
      rendererRef.current?.updateMesh(mesh)
      history.push({ params: { ...params }, heightmap: rawHeightmap, exportMode, twoColorParams: null, plaqueParams: null })
    }
  }, [sourceImage, params, exportMode, twoColorParams, plaqueParams, history])

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const restoreSnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    setParams(snapshot.params)
    if (snapshot.exportMode === 'plaque' && snapshot.plaqueParams) {
      setExportMode('plaque')
      setPlaqueParams(snapshot.plaqueParams)
      const heightmap = applyContrastMode(snapshot.heightmap, 'dithered', { numLevels: 2 })
      const { baseMesh, columnMesh } = generatePlaque(heightmap, {
        widthMM:        snapshot.params.widthMM,
        heightMM:       snapshot.params.heightMM,
        baseHeightMM:   snapshot.plaqueParams.baseHeightMM,
        columnHeightMM: snapshot.plaqueParams.columnHeightMM,
        borderWidthMM:  snapshot.params.borderWidthMM,
      })
      setPlaqueData({ baseMesh, columnMesh })
      setMeshData(null)
      setTwoColorData(null)
      rendererRef.current?.updateTwoColorMesh(baseMesh, columnMesh, snapshot.plaqueParams.baseColor, snapshot.plaqueParams.columnColor)
    } else if (snapshot.exportMode === 'twoColor' && snapshot.twoColorParams) {
      setExportMode('twoColor')
      setTwoColorParams(snapshot.twoColorParams)
      const numLevels = computeNumLevels(snapshot.params, 'twoColor', snapshot.twoColorParams)
      const heightmap = applyContrastMode(snapshot.heightmap, snapshot.params.contrastMode, { numLevels })
      const { baseMesh, reliefMesh } = generateTwoColor(heightmap, {
        widthMM:         snapshot.params.widthMM,
        heightMM:        snapshot.params.heightMM,
        baseThicknessMM: snapshot.twoColorParams.baseThicknessMM,
        reliefHeightMM:  snapshot.twoColorParams.reliefHeightMM,
        borderWidthMM:   snapshot.params.borderWidthMM,
        invertHeight:    snapshot.params.invertHeight,
      })
      const singleExportMesh = generate(heightmap, {
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
      const numLevels = computeNumLevels(snapshot.params, 'standard', null)
      const heightmap = applyContrastMode(snapshot.heightmap, snapshot.params.contrastMode, { numLevels })
      const mesh = generate(heightmap, {
        widthMM:       snapshot.params.widthMM,
        heightMM:      snapshot.params.heightMM,
        minThickness:  snapshot.params.minThickness,
        maxThickness:  snapshot.params.maxThickness,
        borderWidthMM: snapshot.params.borderWidthMM,
        invertHeight:  snapshot.params.invertHeight,
      })
      setMeshData(mesh)
      setTwoColorData(null)
      setPlaqueData(null)
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

  useEffect(() => {
    if (exportMode === 'plaque' && plaqueData) {
      rendererRef.current?.updateTwoColorMesh(
        plaqueData.baseMesh, plaqueData.columnMesh,
        plaqueParams.baseColor, plaqueParams.columnColor,
      )
    }
  }, [plaqueParams.baseColor, plaqueParams.columnColor]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Folder scan + gallery ────────────────────────────────────────────────
  const handleScanFolder = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return

    setGalleryResults([])
    setGalleryProgress({ done: 0, total: files.length, cached: 0 })
    setGalleryOpen(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const key    = makeCacheKey(file)
      const cached = getScore(key)

      let score
      if (cached) {
        score = cached
      } else {
        score = await new Promise((resolve) => {
          const url = URL.createObjectURL(file)
          const img = new Image()
          img.onload = () => {
            try {
              const cols = 150
              const rows = Math.max(2, Math.round(cols * (img.naturalHeight / img.naturalWidth)))
              const heightmap = processImage(img, cols, rows)
              const analysis  = analyzeHeightmap(heightmap)
              const verdict   = verdictFromAnalysis(analysis)
              const result    = { ...analysis, verdict: verdict.label, color: verdict.color }
              setScore(key, result)
              resolve(result)
            } catch {
              resolve(null)
            } finally {
              URL.revokeObjectURL(url)
            }
          }
          img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
          img.src = url
        })
      }

      const thumbnail = URL.createObjectURL(file)
      const wasCached = !!cached
      setGalleryResults(prev => [...prev, { file, score, thumbnail }])
      setGalleryProgress(prev => ({
        ...prev,
        done:   i + 1,
        cached: prev.cached + (wasCached ? 1 : 0),
      }))
    }
  }, [])

  const handleCloseGallery = useCallback(() => {
    setGalleryResults(prev => { prev.forEach(r => URL.revokeObjectURL(r.thumbnail)); return [] })
    setGalleryOpen(false)
    // Reset the hidden input so the same folder can be re-scanned
    if (scanInputRef.current) scanInputRef.current.value = ''
  }, [])

  const handleSelectFromGallery = useCallback((file) => {
    setGalleryResults(prev => { prev.forEach(r => URL.revokeObjectURL(r.thumbnail)); return [] })
    setGalleryOpen(false)
    if (scanInputRef.current) scanInputRef.current.value = ''

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { handleImageLoad(img); URL.revokeObjectURL(url) }
    img.src = url
  }, [handleImageLoad])

  // ── STL download ─────────────────────────────────────────────────────────
  const handleDownloadPlaqueBase = useCallback(() => {
    if (!plaqueData) return
    const blob = exportBinary(plaqueData.baseMesh)
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'plaque_base.stl' })
    a.click()
    URL.revokeObjectURL(url)
  }, [plaqueData])

  const handleDownloadPlaqueColumns = useCallback(() => {
    if (!plaqueData) return
    const blob = exportBinary(plaqueData.columnMesh)
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'plaque_columns.stl' })
    a.click()
    URL.revokeObjectURL(url)
  }, [plaqueData])

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

  const stats = plaqueData
    ? (() => {
        const baseTri = plaqueData.baseMesh.faces.length / 3
        const colTri  = plaqueData.columnMesh.faces.length / 3
        return {
          triangles:   baseTri + colTri,
          stlBaseMB:  ((84 + 50 * baseTri)  / 1e6).toFixed(2),
          stlColsMB:  ((84 + 50 * colTri)   / 1e6).toFixed(2),
          plaque: true,
        }
      })()
    : twoColorData
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
      {/* Hidden folder picker input */}
      <input
        ref={scanInputRef}
        type="file"
        // @ts-ignore — webkitdirectory is non-standard but universally supported
        webkitdirectory="true"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleScanFolder(e.target.files)}
      />

      {galleryOpen && (
        <GalleryModal
          results={galleryResults}
          progress={galleryProgress}
          onClose={handleCloseGallery}
          onSelectImage={handleSelectFromGallery}
        />
      )}

      <Toolbar
        onUndo={handleUndo}   canUndo={history.canUndo}
        onRedo={handleRedo}   canRedo={history.canRedo}
        exportMode={exportMode}
        onDownload={handleDownload}                     canDownload={!!meshData}
        onDownload2Color={handleDownload2Color}         canDownloadTwo={!!twoColorData}
        onDownloadPlaqueBase={handleDownloadPlaqueBase} onDownloadPlaqueColumns={handleDownloadPlaqueColumns} canDownloadPlaque={!!plaqueData}
        onScanFolder={() => scanInputRef.current?.click()}
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
          <ImageUploader onImageLoad={handleImageLoad} grayscalePreview={grayscalePreview} imageAnalysis={imageAnalysis} />
          <ParameterPanel
            params={params} setParams={setParams}
            sourceImage={sourceImage} onApply={handleApply}
            exportMode={exportMode} onExportModeChange={setExportMode}
            twoColorParams={twoColorParams} setTwoColorParams={setTwoColorParams}
            plaqueParams={plaqueParams} setPlaqueParams={setPlaqueParams}
          />
        </div>

        {/* Preview */}
        <PreviewPanel containerRef={previewContainerRef} hasMesh={!!meshData || !!twoColorData || !!plaqueData} />
      </div>
    </div>
  )
}
