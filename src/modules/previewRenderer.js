import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * PreviewRenderer — renders a lithophane mesh as an interactive 3D preview.
 *
 * Usage:
 *   const renderer = new PreviewRenderer()
 *   renderer.init(containerDiv)
 *   renderer.updateMesh({ vertices, faces, normals })
 *   renderer.resize(width, height)   // call on container resize
 *   renderer.dispose()               // call on teardown
 */
export class PreviewRenderer {
  constructor() {
    this._renderer       = null
    this._scene          = null
    this._camera         = null
    this._controls       = null
    this._mesh           = null
    this._twoColorMeshes = []   // [baseMesh, reliefMesh] when in 2-color mode
    this._animId         = null
    this._fitted         = false   // true after first auto-fit; skip on subsequent updates
  }

  /**
   * Initialize the Three.js scene and attach the canvas to the container.
   * @param {HTMLDivElement} container
   */
  init(container) {
    const w = container.clientWidth  || 800
    const h = container.clientHeight || 600

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true })
    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(w, h)
    this._renderer.setClearColor(0x1a1a2e)
    container.appendChild(this._renderer.domElement)

    // Scene
    this._scene = new THREE.Scene()

    // Camera
    this._camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000)
    this._camera.position.set(0, -200, 200)
    this._camera.up.set(0, 0, 1)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this._scene.add(ambient)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(1, -1, 2)
    this._scene.add(dirLight)

    // OrbitControls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement)
    this._controls.enableDamping = true
    this._controls.dampingFactor = 0.08

    // Render loop
    const animate = () => {
      this._animId = requestAnimationFrame(animate)
      this._controls.update()
      this._renderer.render(this._scene, this._camera)
    }
    animate()
  }

  /** Remove and dispose all two-color meshes from the scene. */
  _clearTwoColorMeshes() {
    for (const m of this._twoColorMeshes) {
      this._scene.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    this._twoColorMeshes = []
  }

  /**
   * Load or replace the mesh in the scene (standard single-color mode).
   * @param {{ vertices: Float32Array, faces: Uint32Array, normals: Float32Array }} meshData
   */
  updateMesh(meshData) {
    // Clear any two-color meshes from a previous mode
    this._clearTwoColorMeshes()

    // Remove and dispose previous single mesh
    if (this._mesh) {
      this._scene.remove(this._mesh)
      this._mesh.geometry.dispose()
      this._mesh.material.dispose()
      this._mesh = null
    }

    const { vertices, faces, normals } = meshData

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals,  3))
    geo.setIndex(new THREE.BufferAttribute(faces, 1))

    const mat = new THREE.MeshPhongMaterial({
      color:     0xe8d5b7,
      specular:  0x444444,
      shininess: 30,
      side:      THREE.DoubleSide,
    })

    this._mesh = new THREE.Mesh(geo, mat)
    this._scene.add(this._mesh)

    // Auto-fit camera only on the first mesh load
    if (!this._fitted) {
      this._fitted = true
      geo.computeBoundingBox()
      const box    = geo.boundingBox
      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)

      const maxDim = Math.max(size.x, size.y, size.z)
      const fov    = this._camera.fov * (Math.PI / 180)
      const dist   = (maxDim / 2) / Math.tan(fov / 2) * 1.8

      this._camera.position.copy(center)
      this._camera.position.z += dist
      this._camera.position.y -= dist * 0.4
      this._controls.target.copy(center)
      this._controls.update()
    }
  }

  /**
   * Load or replace two meshes in the scene for 2-color preview.
   * Each mesh is rendered with its own color.
   *
   * @param {{ vertices: Float32Array, faces: Uint32Array, normals: Float32Array }} baseMeshData
   * @param {{ vertices: Float32Array, faces: Uint32Array, normals: Float32Array }} reliefMeshData
   * @param {string} baseColor  - CSS hex string, e.g. '#222222'
   * @param {string} reliefColor - CSS hex string, e.g. '#f0ead6'
   */
  updateTwoColorMesh(baseMeshData, reliefMeshData, baseColor, reliefColor) {
    // Clear any existing single mesh or previous two-color meshes
    if (this._mesh) {
      this._scene.remove(this._mesh)
      this._mesh.geometry.dispose()
      this._mesh.material.dispose()
      this._mesh = null
    }
    this._clearTwoColorMeshes()

    const makeMesh = (meshData, color) => {
      const { vertices, faces, normals } = meshData
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
      geo.setAttribute('normal',   new THREE.BufferAttribute(normals,  3))
      geo.setIndex(new THREE.BufferAttribute(faces, 1))
      const mat = new THREE.MeshPhongMaterial({
        color,
        specular:  0x333333,
        shininess: 25,
        side:      THREE.DoubleSide,
      })
      return new THREE.Mesh(geo, mat)
    }

    const baseMesh   = makeMesh(baseMeshData,   baseColor)
    const reliefMesh = makeMesh(reliefMeshData, reliefColor)

    this._scene.add(baseMesh)
    this._scene.add(reliefMesh)
    this._twoColorMeshes = [baseMesh, reliefMesh]

    // Auto-fit camera to the combined bounding box on first load
    if (!this._fitted) {
      this._fitted = true
      const box = new THREE.Box3()
      box.expandByObject(baseMesh)
      box.expandByObject(reliefMesh)

      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)

      const maxDim = Math.max(size.x, size.y, size.z)
      const fov    = this._camera.fov * (Math.PI / 180)
      const dist   = (maxDim / 2) / Math.tan(fov / 2) * 1.8

      this._camera.position.copy(center)
      this._camera.position.z += dist
      this._camera.position.y -= dist * 0.4
      this._controls.target.copy(center)
      this._controls.update()
    }
  }

  /**
   * Reset camera fit so the next updateMesh() call re-fits the camera.
   * Call this when a new image is uploaded.
   */
  resetFit() {
    this._fitted = false
  }

  /**
   * Update renderer and camera aspect ratio on container resize.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (!this._renderer) return
    this._renderer.setSize(width, height)
    this._camera.aspect = width / height
    this._camera.updateProjectionMatrix()
  }

  /**
   * Tear down the renderer, cancel animation loop, and remove the canvas.
   */
  dispose() {
    if (this._animId !== null) cancelAnimationFrame(this._animId)
    if (this._mesh) {
      this._mesh.geometry.dispose()
      this._mesh.material.dispose()
    }
    this._clearTwoColorMeshes()
    if (this._controls) this._controls.dispose()
    if (this._renderer) {
      this._renderer.domElement.remove()
      this._renderer.dispose()
    }
    this._renderer = this._scene = this._camera = this._controls = this._mesh = null
    this._animId = null
  }
}
