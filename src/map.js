// Biome map: tiles drawn under the plan. Two sources:
// - seed: computed by a pool of web workers (vanilla generator via deepslate)
// - world: fetched from the MCPainter bridge in the game (real generator incl. mod biomes, optional real surface)
import { BIOMES } from './biomes.js'

const hexRgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const VANILLA = new Map(BIOMES.map(([id, name, color]) => ['minecraft:' + id, { name, rgb: hexRgb(color) }]))
const seedPalette = () => BIOMES.map(([id, name, color]) => ({ id: 'minecraft:' + id, name, rgb: hexRgb(color), css: color }))

const SAMPLES = 64
export const tileSize = lod => 256 * 4 ** lod

export function lodForScale(scale) {
  return scale >= 1 ? 0 : scale >= 0.25 ? 1 : 2
}

export class BiomeMap {
  constructor(workerSource, onUpdate) {
    this.onUpdate = onUpdate
    this.seed = null // cache key: the seed, or "@world:biomes" / "@world:surface"
    this.world = null // { fetch(x1, z1, x2, z2, step, mode) }
    this.palette = seedPalette()
    this.paletteIndex = new Map(this.palette.map((p, i) => [p.id, i]))
    this.inflight = 0
    this.relief = true
    this.tiles = new Map() // key -> tile
    this.pending = new Set()
    this.queue = []
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(url)
      w.busy = false
      w.onmessage = e => this.receive(w, e.data)
      w.onerror = e => { console.error('Worker-Fehler', e.message); w.busy = false }
      return w
    })
  }

  get loading() {
    return this.pending.size + this.queue.length
  }

  biomeName(i) { return this.palette[i]?.name ?? '?' }
  biomeRgb(i) { return this.palette[i]?.rgb ?? [80, 80, 80] }

  setSeed(seed) {
    this.world = null
    this.palette = seedPalette()
    this.paletteIndex = new Map(this.palette.map((p, i) => [p.id, i]))
    this.seed = seed
    this.tiles.clear()
    this.pending.clear()
    this.queue = []
    for (const w of this.workers) w.postMessage({ type: 'seed', seed })
    this.onUpdate()
  }

  // Karte aus der Spielwelt (Brücke): mode "biomes" oder "surface" (echte Oberfläche in geladenen Chunks)
  setWorld(world, mode) {
    this.world = world
    this.palette = []
    this.paletteIndex = new Map()
    this.seed = '@world:' + mode
    this.mode = mode
    this.tiles.clear()
    this.pending.clear()
    this.queue = []
    this.onUpdate()
  }

  // Biome eines Bridge-Tiles in die eigene Palette übernehmen (Vanilla-Biome behalten ihre bekannten Farben)
  mergePalette(list) {
    return list.map(p => {
      let i = this.paletteIndex.get(p.id)
      if (i === undefined) {
        const v = VANILLA.get(p.id)
        const rgb = v ? v.rgb : hexRgb(p.color)
        const name = p.mod && p.mod !== 'Minecraft' ? `${p.name} (${p.mod})` : (v?.name ?? p.name)
        i = this.palette.length
        this.palette.push({ id: p.id, name, rgb, css: `rgb(${rgb.join(',')})` })
        this.paletteIndex.set(p.id, i)
      }
      return i
    })
  }

  setRelief(on) {
    this.relief = on
    for (const t of this.tiles.values()) t.canvas = null
    this.onUpdate()
  }

  // Request the tiles covering the visible area (nearest to the center first)
  update(view, width, height) {
    if (this.seed === null) return
    const lod = lodForScale(view.scale)
    const wanted = []
    for (const l of new Set([Math.min(2, lod + 1), lod])) {
      const size = tileSize(l)
      const x1 = Math.floor((view.cx - width / 2 / view.scale) / size), x2 = Math.floor((view.cx + width / 2 / view.scale) / size)
      const z1 = Math.floor((view.cz - height / 2 / view.scale) / size), z2 = Math.floor((view.cz + height / 2 / view.scale) / size)
      for (let tz = z1; tz <= z2; tz++) {
        for (let tx = x1; tx <= x2; tx++) {
          const key = l + ':' + tx + ':' + tz
          if (this.tiles.has(key) || this.pending.has(key)) continue
          const dx = (tx + 0.5) * size - view.cx, dz = (tz + 0.5) * size - view.cz
          wanted.push({ key, lod: l, tx, tz, prio: (l === lod ? 1e12 : 0) - (dx * dx + dz * dz) })
        }
      }
    }
    this.queue = wanted.sort((a, b) => b.prio - a.prio)
    this.pump()
  }

  pump() {
    if (this.world) return this.pumpWorld()
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue
      const t = this.queue.shift()
      w.busy = true
      this.pending.add(t.key)
      w.postMessage({ type: 'tile', key: t.key, seed: this.seed, lod: t.lod, tx: t.tx, tz: t.tz })
    }
  }

  pumpWorld() {
    while (this.inflight < 3 && this.queue.length) {
      const t = this.queue.shift()
      const key = this.seed, size = tileSize(t.lod), x1 = t.tx * size, z1 = t.tz * size
      this.inflight++
      this.pending.add(t.key)
      this.world.fetch(x1, z1, x1 + size - 1, z1 + size - 1, size / SAMPLES, this.mode).then(r => {
        if (key !== this.seed) return
        const map = this.mergePalette(r.palette)
        const biomes = Uint16Array.from(r.biomes, b => map[b])
        this.tiles.set(t.key, { lod: t.lod, tx: t.tx, tz: t.tz, biomes, heights: Float32Array.from(r.heights), colors: r.colors ? Int32Array.from(r.colors) : null, canvas: null })
        if (this.tiles.size > 2500) this.tiles.delete(this.tiles.keys().next().value)
        this.onUpdate()
      }).catch(e => console.warn('Karte aus der Welt:', e.message)).finally(() => {
        this.inflight--
        this.pending.delete(t.key)
        if (key === this.seed) this.pump()
      })
    }
  }

  receive(w, msg) {
    w.busy = false
    this.pending.delete(msg.key)
    if (msg.type === 'tile' && msg.seed === this.seed) {
      const [lod, tx, tz] = msg.key.split(':').map(Number)
      this.tiles.set(msg.key, { lod, tx, tz, biomes: msg.biomes, heights: msg.heights, canvas: null })
      if (this.tiles.size > 2500) this.tiles.delete(this.tiles.keys().next().value)
      this.onUpdate()
    }
    this.pump()
  }

  tileCanvas(t) {
    if (t.canvas) return t.canvas
    const c = document.createElement('canvas')
    c.width = c.height = SAMPLES
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(SAMPLES, SAMPLES)
    const step = tileSize(t.lod) / SAMPLES
    const h = t.heights
    for (let j = 0; j < SAMPLES; j++) {
      for (let i = 0; i < SAMPLES; i++) {
        const k = j * SAMPLES + i
        const c = t.colors?.[k] ?? -1
        const [r, g, b] = c >= 0 ? [c >> 16 & 255, c >> 8 & 255, c & 255] : this.biomeRgb(t.biomes[k])
        let f = 1
        if (this.relief) {
          const gx = (h[j * SAMPLES + Math.min(SAMPLES - 1, i + 1)] - h[j * SAMPLES + Math.max(0, i - 1)]) / (2 * step)
          const gz = (h[Math.min(SAMPLES - 1, j + 1) * SAMPLES + i] - h[Math.max(0, j - 1) * SAMPLES + i]) / (2 * step)
          f = Math.min(1.45, Math.max(0.55, 1 - (gx + gz) * 1.6)) * (0.9 + 0.2 * Math.min(1, Math.max(0, (h[k] - 60) / 140)))
        }
        img.data[k * 4] = Math.min(255, r * f)
        img.data[k * 4 + 1] = Math.min(255, g * f)
        img.data[k * 4 + 2] = Math.min(255, b * f)
        img.data[k * 4 + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    t.canvas = c
    return c
  }

  draw(ctx, view, width, height, alpha) {
    if (this.seed === null) return
    const need = lodForScale(view.scale)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = view.scale < 0.5
    const x1 = view.cx - width / 2 / view.scale, x2 = view.cx + width / 2 / view.scale
    const z1 = view.cz - height / 2 / view.scale, z2 = view.cz + height / 2 / view.scale
    // Coarse tiles first as a fallback, finer ones on top
    for (let lod = 2; lod >= need; lod--) {
      const size = tileSize(lod)
      for (let tz = Math.floor(z1 / size); tz <= Math.floor(z2 / size); tz++) {
        for (let tx = Math.floor(x1 / size); tx <= Math.floor(x2 / size); tx++) {
          const t = this.tiles.get(lod + ':' + tx + ':' + tz)
          if (!t) continue
          const sx = (tx * size - view.cx) * view.scale + width / 2, sz = (tz * size - view.cz) * view.scale + height / 2
          const s = size * view.scale
          ctx.drawImage(this.tileCanvas(t), Math.floor(sx), Math.floor(sz), Math.ceil(s + 1), Math.ceil(s + 1))
        }
      }
    }
    ctx.restore()
  }

  // Biome index + approx height at a block position, from the finest loaded tile
  sample(x, z) {
    for (let lod = 0; lod <= 2; lod++) {
      const size = tileSize(lod)
      const tx = Math.floor(x / size), tz = Math.floor(z / size)
      const t = this.tiles.get(lod + ':' + tx + ':' + tz)
      if (!t) continue
      const step = size / SAMPLES
      const i = Math.floor((x - tx * size) / step), j = Math.floor((z - tz * size) / step)
      return { biome: t.biomes[j * SAMPLES + i], height: t.heights[j * SAMPLES + i], exact: lod === 0 }
    }
    return null
  }

  // Biome im sichtbaren Bereich, häufigste zuerst (für die Legende)
  legend(view, width, height, max = 14) {
    if (this.seed === null) return []
    const lod = lodForScale(view.scale), size = tileSize(lod)
    const x1 = view.cx - width / 2 / view.scale, x2 = view.cx + width / 2 / view.scale
    const z1 = view.cz - height / 2 / view.scale, z2 = view.cz + height / 2 / view.scale
    const counts = new Map()
    for (let tz = Math.floor(z1 / size); tz <= Math.floor(z2 / size); tz++) {
      for (let tx = Math.floor(x1 / size); tx <= Math.floor(x2 / size); tx++) {
        const t = this.tiles.get(lod + ':' + tx + ':' + tz)
        if (t) for (const b of t.biomes) counts.set(b, (counts.get(b) ?? 0) + 1)
      }
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, max).map(([i]) => this.palette[i]).filter(Boolean)
  }
}
