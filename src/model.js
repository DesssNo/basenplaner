// Project data: sparse layers (one per Y level) stored as 16x16 chunks of palette indices
let version = 0 // global so a re-created chunk never reuses an old render cache entry
export class Layer {
  constructor(y) {
    this.y = y
    this.chunks = new Map() // "cx,cz" -> { data: Uint16Array(256), count, ver }
    this.visible = true
  }

  get(x, z) {
    const c = this.chunks.get(((x >> 4) + ',' + (z >> 4)))
    return c ? c.data[((z & 15) << 4) | (x & 15)] : 0
  }

  set(x, z, v) {
    const key = (x >> 4) + ',' + (z >> 4)
    let c = this.chunks.get(key)
    if (!c) {
      if (!v) return 0
      c = { data: new Uint16Array(256), count: 0, ver: 0, cx: x >> 4, cz: z >> 4 }
      this.chunks.set(key, c)
    }
    const i = ((z & 15) << 4) | (x & 15)
    const old = c.data[i]
    if (old === v) return old
    c.data[i] = v
    c.count += (v ? 1 : 0) - (old ? 1 : 0)
    c.ver = ++version
    if (c.count === 0) this.chunks.delete(key)
    return old
  }

  get count() {
    let n = 0
    for (const c of this.chunks.values()) n += c.count
    return n
  }

  // Bounding box of placed blocks, or null
  bounds() {
    let b = null
    for (const c of this.chunks.values()) {
      const { cx, cz } = c
      for (let i = 0; i < 256; i++) {
        if (!c.data[i]) continue
        const x = cx * 16 + (i & 15), z = cz * 16 + (i >> 4)
        if (!b) b = { x1: x, z1: z, x2: x, z2: z }
        else { if (x < b.x1) b.x1 = x; if (x > b.x2) b.x2 = x; if (z < b.z1) b.z1 = z; if (z > b.z2) b.z2 = z }
      }
    }
    return b
  }

  *cells() {
    for (const c of this.chunks.values()) {
      const { cx, cz } = c
      for (let i = 0; i < 256; i++) if (c.data[i]) yield [cx * 16 + (i & 15), cz * 16 + (i >> 4), c.data[i]]
    }
  }
}

export class Project {
  constructor() {
    this.name = 'Meine Mega-Base'
    this.seed = ''
    this.palette = [null] // index 0 = empty
    this.paletteIndex = new Map()
    this.layers = new Map() // y -> Layer
    this.zones = [] // { id, name, color, x1, z1, x2, z2 }
    // Bau-Stand pro Welt ("Weltname|Dimension" -> Project): was zuletzt mit dem MCPainter-Mod gebaut wurde,
    // damit beim nächsten Bau nur Änderungen geschickt werden
    this.built = {}
    this.undoStack = []
    this.redoStack = []
    this.tx = null
    this.onChange = () => {}
  }

  blockIndex(id) {
    let i = this.paletteIndex.get(id)
    if (i === undefined) {
      i = this.palette.length
      this.palette.push(id)
      this.paletteIndex.set(id, i)
    }
    return i
  }

  layer(y, create = false) {
    let l = this.layers.get(y)
    if (!l && create) { l = new Layer(y); this.layers.set(y, l) }
    return l
  }

  get(y, x, z) {
    return this.layers.get(y)?.get(x, z) ?? 0
  }

  // All edits go through here so they are recorded for undo
  set(y, x, z, v) {
    const layer = this.layer(y, !!v)
    if (!layer) return
    const old = layer.set(x, z, v)
    if (old === v) return
    if (this.tx) {
      const k = y + '|' + x + '|' + z
      const prev = this.tx.get(k)
      if (prev) prev[4] = v
      else this.tx.set(k, [y, x, z, old, v])
    }
  }

  begin() {
    this.tx = new Map()
  }

  commit(label = 'Bearbeitung') {
    const tx = this.tx
    this.tx = null
    if (!tx) return
    const changes = [...tx.values()].filter(c => c[3] !== c[4])
    if (!changes.length) return
    this.undoStack.push({ label, changes })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack.length = 0
    this.onChange()
  }

  undo() {
    const step = this.undoStack.pop()
    if (!step) return null
    for (let i = step.changes.length - 1; i >= 0; i--) {
      const [y, x, z, old] = step.changes[i]
      this.layer(y, true).set(x, z, old)
    }
    this.redoStack.push(step)
    this.onChange()
    return step.label
  }

  redo() {
    const step = this.redoStack.pop()
    if (!step) return null
    for (const [y, x, z, , v] of step.changes) this.layer(y, true).set(x, z, v)
    this.undoStack.push(step)
    this.onChange()
    return step.label
  }

  // Blocks per id across all layers
  materials() {
    const counts = new Map()
    for (const layer of this.layers.values()) {
      for (const c of layer.chunks.values()) {
        for (let i = 0; i < 256; i++) {
          const v = c.data[i]
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
        }
      }
    }
    return [...counts].map(([i, n]) => [this.palette[i], n]).sort((a, b) => b[1] - a[1])
  }

  bounds() {
    let b = null
    for (const layer of this.layers.values()) {
      const lb = layer.bounds()
      if (!lb) continue
      if (!b) b = { ...lb, y1: layer.y, y2: layer.y }
      else {
        b.x1 = Math.min(b.x1, lb.x1); b.z1 = Math.min(b.z1, lb.z1); b.x2 = Math.max(b.x2, lb.x2); b.z2 = Math.max(b.z2, lb.z2)
        b.y1 = Math.min(b.y1, layer.y); b.y2 = Math.max(b.y2, layer.y)
      }
    }
    return b
  }

  toJSON() {
    const layers = []
    for (const layer of this.layers.values()) {
      if (!layer.chunks.size) continue
      const chunks = {}
      for (const [key, c] of layer.chunks) chunks[key] = toBase64(new Uint8Array(c.data.buffer))
      layers.push({ y: layer.y, visible: layer.visible, chunks })
    }
    const built = Object.fromEntries(Object.entries(this.built).map(([k, p]) => [k, p.toJSON()]))
    return { format: 'basenplaner', version: 1, name: this.name, seed: this.seed, palette: this.palette.slice(1), layers, zones: this.zones, built }
  }

  static fromJSON(json) {
    if (json?.format !== 'basenplaner') throw new Error('Keine Basenplaner-Datei')
    const p = new Project()
    p.name = json.name ?? p.name
    p.seed = json.seed ?? ''
    for (const id of json.palette ?? []) p.blockIndex(id)
    for (const l of json.layers ?? []) {
      const layer = p.layer(l.y, true)
      layer.visible = l.visible !== false
      for (const [key, b64] of Object.entries(l.chunks)) {
        const data = new Uint16Array(fromBase64(b64).buffer)
        let count = 0
        for (let i = 0; i < 256; i++) if (data[i]) count++
        const [cx, cz] = key.split(',').map(Number)
        if (count) layer.chunks.set(key, { data, count, ver: ++version, cx, cz })
      }
    }
    p.zones = json.zones ?? []
    for (const [k, b] of Object.entries(json.built ?? {})) {
      try { p.built[k] = Project.fromJSON(b) } catch { /* kaputter Bau-Stand: dann eben alles neu bauen */ }
    }
    return p
  }
}

function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function fromBase64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
