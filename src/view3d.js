// 3D preview of the plan (three.js). Builds one face-culled mesh for opaque blocks and one for transparent ones.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { blockInfo, blockShape } from './blocks.js'

const MAX_VOLUME = 60_000_000
const MAX_FACES = 2_500_000

// Unit-cube faces; corner component 0 = box min, 1 = box max
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
]
// Make every face wind counter-clockwise when seen from outside
for (const f of FACES) {
  const [a, b, c] = f.c
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  if (cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] < 0) f.c.reverse()
}

// Growable typed arrays (about 96 bytes per face) so large bases stay within memory
class MeshBuilder {
  constructor() { this.faces = 0; this.alloc(4096) }
  alloc(n) {
    const grow = (Old, old, size) => { const a = new Old(size); if (old) a.set(old.subarray(0, a.length)); return a }
    this.cap = n
    this.pos = grow(Float32Array, this.pos, n * 12)
    this.nor = grow(Int8Array, this.nor, n * 12)
    this.col = grow(Uint8Array, this.col, n * 12)
    this.idx = grow(Uint32Array, this.idx, n * 6)
  }
  face(f, x, y, z, box, r, g, b) {
    if (this.faces === this.cap) this.alloc(this.cap * 2)
    const v0 = this.faces * 4
    let p = v0 * 3
    for (const [cx, cy, cz] of f.c) {
      this.pos[p] = x + (cx ? box[3] : box[0]); this.pos[p + 1] = y + (cy ? box[4] : box[1]); this.pos[p + 2] = z + (cz ? box[5] : box[2])
      this.nor[p] = f.n[0] * 127; this.nor[p + 1] = f.n[1] * 127; this.nor[p + 2] = f.n[2] * 127
      this.col[p] = r; this.col[p + 1] = g; this.col[p + 2] = b
      p += 3
    }
    const i = this.faces * 6
    this.idx.set([v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3], i)
    this.faces++
  }
  geometry() {
    const n = this.faces
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 12), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 12), 3, true))
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 12), 3, true))
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, n * 6), 1))
    return g
  }
}

export class View3D {
  constructor(app) {
    this.app = app
    this.el = null
  }

  get isOpen() { return !!this.el && !this.el.hidden }

  ui() {
    if (this.el) return
    const el = document.createElement('div')
    el.id = 'view3d'
    el.innerHTML = `
      <div class="bar">
        <b>3D-Ansicht</b>
        <label class="slice">Bis Ebene Y <input type="range" step="1"> <span></span></label>
        <label><input type="checkbox" class="ground" checked> Boden mit Biomkarte</label>
        <span class="info"></span>
        <span class="spacer"></span>
        <button class="shot">Bild speichern</button>
        <button class="close primary">Schließen (Esc)</button>
      </div>
      <div class="canvas"></div>
      <p class="help">Linke Maustaste: drehen · Rechte Maustaste: verschieben · Mausrad: zoomen</p>`
    document.querySelector('#stage').appendChild(el)
    this.el = el
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    el.querySelector('.canvas').appendChild(this.renderer.domElement)
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#a8c8ea')
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(0.6, 1, 0.35)
    this.scene.add(sun)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.addEventListener('change', () => this.render())
    this.group = new THREE.Group()
    this.scene.add(this.group)
    new ResizeObserver(() => this.resize()).observe(el.querySelector('.canvas'))
    const slider = el.querySelector('.slice input')
    slider.oninput = () => { el.querySelector('.slice span').textContent = slider.value; clearTimeout(this.t); this.t = setTimeout(() => this.build(+slider.value), 120) }
    el.querySelector('.ground').onchange = () => this.build(+slider.value)
    el.querySelector('.close').onclick = () => this.close()
    el.querySelector('.shot').onclick = () => {
      this.render()
      this.renderer.domElement.toBlob(b => this.app.downloadBlob(b, `${this.app.fileName()}_3d.png`))
    }
  }

  open() {
    this.app.dropFloating()
    const layers = [...this.app.project.layers.values()].filter(l => l.visible && l.count)
    if (!layers.length) return this.app.toast('Der Plan ist leer – setze erst ein paar Blöcke.')
    this.ui()
    this.el.hidden = false
    const ys = layers.map(l => l.y)
    const slider = this.el.querySelector('.slice input')
    slider.min = Math.min(...ys); slider.max = Math.max(...ys); slider.value = slider.max
    this.el.querySelector('.slice span').textContent = slider.value
    this.el.querySelector('.slice').style.display = slider.min === slider.max ? 'none' : ''
    this.resize()
    this.build(+slider.max, true)
  }

  close() {
    if (this.el) this.el.hidden = true
  }

  resize() {
    if (!this.el || this.el.hidden) return
    const box = this.el.querySelector('.canvas').getBoundingClientRect()
    if (!box.width) return
    this.renderer.setSize(box.width, box.height)
    this.camera.aspect = box.width / box.height
    this.camera.updateProjectionMatrix()
    this.render()
  }

  render() {
    if (this.el && !this.el.hidden) this.renderer.render(this.scene, this.camera)
  }

  build(maxY, resetCamera = false) {
    const { app } = this
    const project = app.project
    const layers = [...project.layers.values()].filter(l => l.visible && l.count && l.y <= maxY)
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.geometry?.dispose()
      child.material?.map?.dispose()
      child.material?.dispose()
    }
    if (!layers.length) return this.render()
    // Bounds of what is shown
    const b = { x1: Infinity, z1: Infinity, x2: -Infinity, z2: -Infinity, y1: Infinity, y2: -Infinity }
    for (const l of layers) {
      const lb = l.bounds()
      b.x1 = Math.min(b.x1, lb.x1); b.z1 = Math.min(b.z1, lb.z1); b.x2 = Math.max(b.x2, lb.x2); b.z2 = Math.max(b.z2, lb.z2)
      b.y1 = Math.min(b.y1, l.y); b.y2 = Math.max(b.y2, l.y)
    }
    const W = b.x2 - b.x1 + 1, H = b.y2 - b.y1 + 1, L = b.z2 - b.z1 + 1
    if (W * H * L > MAX_VOLUME) {
      this.el.querySelector('.info').textContent = `Zu groß für die 3D-Ansicht (${W}×${H}×${L}). Blende Ebenen aus oder nutze „Bis Ebene“.`
      return this.render()
    }
    const vol = new Uint16Array(W * H * L)
    for (const l of layers) for (const [x, z, v] of l.cells()) vol[((l.y - b.y1) * L + (z - b.z1)) * W + (x - b.x1)] = v

    // Per palette entry: color, shape, transparency
    const info = project.palette.map(id => {
      if (!id) return null
      const c = app.color(id), inf = blockInfo(id), shape = blockShape(id)
      const lin = new THREE.Color(`rgb(${c.r},${c.g},${c.b})`)
      // Vertex colors are linear; store them as bytes
      return { r: Math.round(lin.r * 255), g: Math.round(lin.g * 255), b: Math.round(lin.b * 255), transparent: (inf.alpha ?? 1) < 1, ...shape }
    })
    const opaque = new MeshBuilder(), clear = new MeshBuilder()
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L ? 0 : vol[(y * L + z) * W + x])
    let blocks = 0
    outer: for (let y = 0; y < H; y++) {
      for (let z = 0; z < L; z++) {
        for (let x = 0; x < W; x++) {
          const v = vol[(y * L + z) * W + x]
          if (!v) continue
          blocks++
          const me = info[v], out = me.transparent ? clear : opaque
          for (const f of FACES) {
            if (me.full) {
              const n = at(x + f.n[0], y + f.n[1], z + f.n[2])
              const o = n && info[n]
              // A full opaque neighbour hides the face; transparent blocks of the same kind merge
              if (o && o.full && (!o.transparent || (me.transparent && n === v))) continue
            }
            out.face(f, x, y, z, me.box, me.r, me.g, me.b)
          }
          if (opaque.faces + clear.faces > MAX_FACES) break outer
        }
      }
    }
    const tooMany = opaque.faces + clear.faces > MAX_FACES
    this.group.add(new THREE.Mesh(opaque.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })))
    if (clear.faces) {
      this.group.add(new THREE.Mesh(clear.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })))
    }
    if (this.el.querySelector('.ground').checked) this.group.add(this.ground(b, W, L))
    this.el.querySelector('.info').textContent = `${blocks.toLocaleString('de-DE')} Blöcke · ${W}×${H}×${L}${tooMany ? ' · zu viele Flächen, Ansicht unvollständig' : ''}`

    if (resetCamera || !this.framed) {
      const d = Math.max(W, L, H * 2, 12)
      this.controls.target.set(W / 2, H / 3, L / 2)
      this.camera.position.set(W / 2 + d * 0.75, H + d * 0.65, L / 2 + d * 0.95)
      this.camera.far = d * 20
      this.camera.updateProjectionMatrix()
      this.controls.update()
      this.framed = true
    }
    this.render()
  }

  // Ground plane under the build, coloured from the seed's biome map where it is loaded
  ground(b, W, L) {
    const pad = Math.ceil(Math.max(W, L) * 0.25) + 8
    const gw = W + pad * 2, gl = L + pad * 2
    const step = Math.max(1, Math.ceil(Math.max(gw, gl) / 1024))
    const cw = Math.ceil(gw / step), cl = Math.ceil(gl / step)
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = cl
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(cw, cl)
    const map = this.app.map
    for (let j = 0; j < cl; j++) {
      for (let i = 0; i < cw; i++) {
        const x = b.x1 - pad + i * step, z = b.z1 - pad + j * step
        const s = map.seed !== null ? map.sample(x, z) : null
        const [r, g, bl] = s ? map.biomeRgb(s.biome) : ((Math.floor(x / 16) + Math.floor(z / 16)) & 1 ? [88, 120, 70] : [80, 112, 64])
        const k = (j * cw + i) * 4
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gw, gl), new THREE.MeshLambertMaterial({ map: tex }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(W / 2, -0.01, L / 2)
    return mesh
  }
}
