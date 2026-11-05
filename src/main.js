import { BIOMES } from './biomes.js'
import { BLOCK_GROUPS, baseId, blockInfo, normalizeBlockId } from './blocks.js'
import { transformState } from './blockstate.js'
import { Bridge } from './bridge.js'
import { download, exportLitematic, exportSponge } from './export.js'
import { readSchematic } from './import.js'
import { ICONS } from './icons.js'
import { BiomeMap } from './map.js'
import { Project } from './model.js'
import { parseSeed } from './seed.js'
import { SlimeCache } from './slime.js'
import * as store from './store.js'
import { inSel, TOOLS } from './tools.js'
import { View3D } from './view3d.js'

/* global __WORKER_SOURCE__ */
const $ = s => document.querySelector(s)
const MIN_Y = -64, MAX_Y = 319
const ZONE_COLORS = ['#f2c14e', '#5bc0eb', '#e55934', '#9bc53d', '#c879ff', '#fa7921', '#4ecdc4', '#ff6b9a']
const DATA_VERSIONS = [
  ['26.3', 5023], ['1.21.5', 4325], ['1.21.4', 4189], ['1.21.1', 3955], ['1.20.4', 3700], ['1.20.1', 3465],
]
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

class App {
  constructor() {
    this.canvas = $('#canvas')
    this.ctx = this.canvas.getContext('2d')
    this.project = new Project()
    this.view = { cx: 0.5, cz: 0.5, scale: 8 }
    this.currentY = 64
    this.hotbar = ['stone_bricks', 'oak_planks', 'spruce_log', 'glass', 'smooth_stone', 'deepslate_tiles', 'lantern', 'chest', 'water'].map(id => 'minecraft:' + id)
    this.slot = 0
    this.tool = TOOLS.find(t => t.id === 'pencil')
    this.options = { brush: 1, round: false, filled: false, sides: 6, rotated: false, symX: false, symZ: false, sym: { x: 0, z: 0 }, allLayers: false, snap: true, wandSame: true, wandContiguous: true }
    this.settings = { grid: true, chunks: true, biomes: true, relief: true, alpha: 0.8, slime: false, ghost: true }
    this.selection = null
    this.floating = null
    this.clipboard = null
    this.hover = null
    this.slime = new SlimeCache()
    this.chunkCache = new Map()
    this.colors = new Map()
    this.map = new BiomeMap(__WORKER_SOURCE__, () => this.redraw())
    this.seedValue = null
    this.view3d = new View3D(this)
    this.bridge = new Bridge()
  }

  get block() { return this.hotbar[this.slot] }

  async init() {
    this.buildToolbar()
    this.buildPalette()
    this.bindUI()
    this.bindCanvas()
    this.bindKeys()
    new ResizeObserver(() => this.resize()).observe($('#stage'))
    const saved = await store.load('autosave')
    if (saved) {
      try {
        this.setProject(Project.fromJSON(saved.project))
        Object.assign(this.view, saved.view ?? {})
        Object.assign(this.settings, saved.settings ?? {})
        if (saved.hotbar?.length === 9) this.hotbar = saved.hotbar
        this.currentY = saved.currentY ?? 64
      } catch (e) { console.warn(e) }
    } else {
      this.setProject(this.project)
    }
    this.syncSettingsUI()
    this.refreshAll()
    if (!this.project.seed) this.toast('Tipp: Gib rechts deinen Seed ein, um die echte Weltkarte als Untergrund zu laden.', 6000)
    this.bridge.connect().then(h => this.onBridge(h))
  }

  // ---------- Minecraft (MCPainter-Mod) ----------
  onBridge(hello) {
    $('#mc-build').hidden = !hello
    if (hello && !this.bridge.inGame) this.toast(`Mit Minecraft verbunden${hello.world ? ` (Welt „${hello.world}“)` : ''}.`, 4000)
  }

  async pairMinecraft() {
    const code = await this.ask('Mit Minecraft koppeln', 'Im Spiel /mcpainter code eingeben und den Code hier einfügen')
    if (!code) return
    try {
      this.onBridge(await this.bridge.pair(code))
    } catch (e) {
      this.toast(e.message, 6000)
    }
  }

  async showBuild() {
    this.dropFloating()
    const b = this.project.bounds()
    if (!b) return this.toast('Der Plan ist leer – setze erst ein paar Blöcke.')
    let hello
    try {
      hello = await this.bridge.get('/api/hello')
    } catch (e) {
      this.onBridge(null)
      return this.toast(e.message, 6000)
    }
    if (!hello.inWorld) return this.toast('In Minecraft ist gerade keine Welt geöffnet.', 5000)
    if (!hello.canBuild) return this.toast('Bauen dürfen nur der Welt-Besitzer oder OPs.', 5000)
    const size = [b.x2 - b.x1 + 1, b.y2 - b.y1 + 1, b.z2 - b.z1 + 1]
    const count = this.project.materials().reduce((n, [, c]) => n + c, 0)
    const hidden = [...this.project.layers.values()].filter(l => !l.visible && l.count).length
    const r = await this.dialog('In Minecraft bauen', `
      <p class="hint">${count.toLocaleString('de-DE')} Blöcke · Größe ${size.join(' × ')} · Ecke bei X ${b.x1}, Y ${b.y1}, Z ${b.z1}<br>
      Welt „${esc(hello.world)}“, ${esc(hello.dimension ?? '')}${hidden ? ` · ${hidden} ausgeblendete Ebene(n) werden nicht gebaut` : ''}</p>
      <label class="field"><span>Bestehende Blöcke in der Welt</span><select name="overwrite">
        <option value="all">überschreiben</option>
        <option value="air_fluids">nur Luft und Wasser/Lava ersetzen</option>
        <option value="none">nicht anfassen (nur in Luft bauen)</option>
      </select></label>
      <label class="check"><input type="checkbox" name="clearAir"> Luft im Plan räumt frei (leere Stellen im Bauraum werden zu Luft)</label>
      <p class="hint">Rückgängig geht nach dem Bau hier im Dialog oder im Spiel mit <code>/mcpainter undo</code>.</p>`,
    [['cancel', 'Abbrechen'], ['ok', 'Bauen', true]])
    if (r !== 'ok') return
    const form = $('#dialog form')
    const query = `overwrite=${form.overwrite.value}&clearAir=${form.clearAir.checked}`
    try {
      // Der Schematic-Exporter dient als Transportformat; 1.21.1 = DataVersion 3955
      const { bytes } = exportSponge(this.project, { dataVersion: 3955, name: this.fileName() })
      this.showJob(await this.bridge.post('/api/build?' + query, bytes))
    } catch (e) {
      this.toast(e.message, 6000)
    }
  }

  // Fortschritt eines Bau- oder Rückgängig-Auftrags
  async showJob(job) {
    const dlg = $('#dialog')
    const undo = job.kind === 'undo'
    const finished = j => ['done', 'cancelled', 'failed'].includes(j.state)
    const label = { queued: 'Wartet', running: undo ? 'Wird zurückgesetzt' : 'Wird gebaut', shaping: 'Verbindet Zäune und Scheiben', done: 'Fertig', cancelled: 'Abgebrochen', failed: 'Fehler' }
    const render = j => {
      const pct = j.total ? Math.round(100 * j.done / j.total) : 100
      dlg.querySelector('.body').innerHTML = `
        <div class="progress"><div style="width:${pct}%"></div></div>
        <p>${label[j.state] ?? j.state}: ${j.done.toLocaleString('de-DE')} von ${j.total.toLocaleString('de-DE')} Blöcken (${pct} %)
        ${j.placed !== undefined ? `<br><span class="hint">gesetzt ${j.placed.toLocaleString('de-DE')}, übersprungen ${j.skipped.toLocaleString('de-DE')}</span>` : ''}</p>
        ${j.unknownBlocks?.length ? `<p class="hint">In dieser Minecraft-Version unbekannt, übersprungen: ${j.unknownBlocks.map(id => `<code>${esc(id)}</code>`).join(' ')}</p>` : ''}
        ${j.error ? `<p class="hint">${esc(j.error)}</p>` : ''}`
      if (finished(j)) {
        dlg.querySelector('.buttons').innerHTML = (!undo && j.state !== 'failed' ? '<button type="button" value="undo">Rückgängig</button>' : '') +
          '<button type="button" value="close" class="primary">Schließen</button>'
      }
    }
    const closed = this.dialog(undo ? 'Rückgängig' : 'Bau in Minecraft', '', [['stop', 'Abbrechen'], ['close', 'Im Hintergrund weiter', true]])
    let current = job
    render(current)
    const timer = setInterval(async () => {
      try {
        current = await this.bridge.get('/api/build/' + job.jobId)
        render(current)
        if (finished(current)) clearInterval(timer)
      } catch (e) {
        clearInterval(timer)
        dlg.querySelector('.body').insertAdjacentHTML('beforeend', `<p class="hint">${esc(e.message)}</p>`)
      }
    }, 400)
    const r = await closed
    clearInterval(timer)
    try {
      if (r === 'stop' && !finished(current)) await this.bridge.post(`/api/build/${job.jobId}/cancel`)
      if (r === 'undo') this.showJob(await this.bridge.post('/api/undo'))
    } catch (e) {
      this.toast(e.message, 6000)
    }
  }

  setProject(p) {
    this.project = p
    p.onChange = () => { this.redraw(); this.refreshLayers(); this.scheduleSave() }
    this.selection = this.floating = null
    this.chunkCache.clear()
    $('#project-name').value = p.name
    $('#seed').value = p.seed
    this.applySeed(p.seed, false)
  }

  // ---------- rendering ----------
  resize() {
    const r = $('#stage').getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.W = r.width; this.H = r.height
    this.canvas.width = Math.round(r.width * dpr)
    this.canvas.height = Math.round(r.height * dpr)
    this.dpr = dpr
    this.redraw()
  }

  redraw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw() })
  }

  toScreen(x, z) {
    return [(x - this.view.cx) * this.view.scale + this.W / 2, (z - this.view.cz) * this.view.scale + this.H / 2]
  }

  cellAt(e) {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: Math.floor((e.clientX - r.left - this.W / 2) / this.view.scale + this.view.cx),
      z: Math.floor((e.clientY - r.top - this.H / 2) / this.view.scale + this.view.cz),
    }
  }

  visibleBounds() {
    const s = this.view.scale
    return { x1: this.view.cx - this.W / 2 / s, x2: this.view.cx + this.W / 2 / s, z1: this.view.cz - this.H / 2 / s, z2: this.view.cz + this.H / 2 / s }
  }

  color(id) {
    let c = this.colors.get(id)
    if (!c) {
      const info = blockInfo(id)
      const cv = this.colorCanvas ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
      const cx = cv.getContext('2d', { willReadFrequently: true })
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = info.color; cx.fillRect(0, 0, 1, 1)
      const [r, g, b] = cx.getImageData(0, 0, 1, 1).data
      c = { r, g, b, a: info.alpha ?? 1, css: `rgb(${r},${g},${b})` }
      this.colors.set(id, c)
    }
    return c
  }

  chunkCanvas(y, key, chunk) {
    const ck = y + '|' + key
    let e = this.chunkCache.get(ck)
    if (e && e.ver === chunk.ver) return e.canvas
    if (!e) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 16
      e = { canvas, ctx: canvas.getContext('2d'), img: null }
      e.img = e.ctx.createImageData(16, 16)
      this.chunkCache.set(ck, e)
    }
    const d = e.img.data, pal = this.project.palette
    for (let i = 0; i < 256; i++) {
      const v = chunk.data[i]
      if (!v) { d[i * 4 + 3] = 0; continue }
      const c = this.color(pal[v])
      d[i * 4] = c.r; d[i * 4 + 1] = c.g; d[i * 4 + 2] = c.b; d[i * 4 + 3] = c.a * 255
    }
    e.ctx.putImageData(e.img, 0, 0)
    e.ver = chunk.ver
    return e.canvas
  }

  drawLayer(ctx, layer, alpha) {
    const b = this.visibleBounds(), s = this.view.scale
    ctx.globalAlpha = alpha
    for (const [key, c] of layer.chunks) {
      const x = c.cx * 16, z = c.cz * 16
      if (x + 16 < b.x1 || x > b.x2 || z + 16 < b.z1 || z > b.z2) continue
      const [sx, sz] = this.toScreen(x, z)
      const x0 = Math.floor(sx), z0 = Math.floor(sz)
      ctx.drawImage(this.chunkCanvas(layer.y, key, c), x0, z0, Math.floor(sx + 16 * s) - x0, Math.floor(sz + 16 * s) - z0)
    }
    ctx.globalAlpha = 1
  }

  drawLines(ctx, step, style, b) {
    ctx.beginPath()
    for (let x = Math.ceil(b.x1 / step) * step; x <= b.x2; x += step) { const px = Math.round(this.toScreen(x, 0)[0]) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, this.H) }
    for (let z = Math.ceil(b.z1 / step) * step; z <= b.z2; z += step) { const pz = Math.round(this.toScreen(0, z)[1]) + 0.5; ctx.moveTo(0, pz); ctx.lineTo(this.W, pz) }
    ctx.strokeStyle = style
    ctx.lineWidth = 1
    ctx.stroke()
  }

  draw() {
    const { ctx, W, H } = this
    if (!W) return
    const s = this.view.scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#121418'
    ctx.fillRect(0, 0, W, H)
    const b = this.visibleBounds()

    if (this.settings.biomes && this.map.seed !== null) {
      this.map.update(this.view, W, H)
      this.map.draw(ctx, this.view, W, H, this.settings.alpha)
      ctx.imageSmoothingEnabled = false
    }
    const loading = this.map.seed !== null && this.settings.biomes ? this.map.loading : 0
    const ms = $('#map-status')
    ms.style.display = loading ? 'block' : 'none'
    if (loading) ms.textContent = `Karte wird berechnet … (${loading})`

    // Slime chunks
    if (this.settings.slime && this.seedValue !== null && s >= 0.25) {
      ctx.fillStyle = 'rgba(120,255,90,0.30)'
      for (let cz = Math.floor(b.z1 / 16); cz <= Math.floor(b.z2 / 16); cz++) {
        for (let cx = Math.floor(b.x1 / 16); cx <= Math.floor(b.x2 / 16); cx++) {
          if (!this.slime.get(this.seedValue, cx, cz)) continue
          const [sx, sz] = this.toScreen(cx * 16, cz * 16)
          ctx.fillRect(sx, sz, 16 * s, 16 * s)
        }
      }
    }

    // Grid
    if (this.settings.grid && s >= 6) this.drawLines(ctx, 1, 'rgba(255,255,255,0.07)', b)
    if (this.settings.chunks && s >= 0.35) this.drawLines(ctx, 16, 'rgba(255,255,255,0.20)', b)
    if (this.settings.chunks && s < 2 && s >= 0.01) this.drawLines(ctx, 512, 'rgba(255,220,120,0.35)', b)
    // World axes
    const [ox, oz] = this.toScreen(0, 0)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath(); ctx.moveTo(Math.round(ox) + 0.5, 0); ctx.lineTo(Math.round(ox) + 0.5, H); ctx.moveTo(0, Math.round(oz) + 0.5); ctx.lineTo(W, Math.round(oz) + 0.5); ctx.stroke()

    // Layers: everything below shines through faintly, current layer on top
    if (this.settings.ghost) {
      const below = [...this.project.layers.values()].filter(l => l.y < this.currentY && l.visible).sort((a, c) => a.y - c.y).slice(-6)
      below.forEach((l, i) => this.drawLayer(ctx, l, 0.12 + 0.18 * (i + 1) / below.length))
    }
    const cur = this.project.layer(this.currentY)
    if (cur && cur.visible) this.drawLayer(ctx, cur, 1)
    if (s >= 10 && cur) this.drawBlockEdges(ctx, cur, b)

    this.drawZones(ctx)
    this.drawFloating(ctx)
    this.drawSelection(ctx)
    this.drawGuides(ctx)
    this.drawPreview(ctx)
    this.drawSymmetry(ctx)
    this.drawHover(ctx)
    this.drawMeasure(ctx)
    this.drawTpTarget(ctx)
    const info = $('#optionsbar .info')
    if (info) info.textContent = this.tool.info?.(this) ?? ''
  }

  // Thin darker outline where neighbouring blocks differ, so builds read better when zoomed in
  drawBlockEdges(ctx, layer, b) {
    const s = this.view.scale
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let z = Math.floor(b.z1); z <= b.z2; z++) {
      for (let x = Math.floor(b.x1); x <= b.x2; x++) {
        const v = layer.get(x, z)
        if (!v) continue
        const [sx, sz] = this.toScreen(x, z)
        if (layer.get(x + 1, z) !== v) { ctx.moveTo(Math.round(sx + s) - 0.5, sz); ctx.lineTo(Math.round(sx + s) - 0.5, sz + s) }
        if (layer.get(x - 1, z) !== v) { ctx.moveTo(Math.round(sx) + 0.5, sz); ctx.lineTo(Math.round(sx) + 0.5, sz + s) }
        if (layer.get(x, z + 1) !== v) { ctx.moveTo(sx, Math.round(sz + s) - 0.5); ctx.lineTo(sx + s, Math.round(sz + s) - 0.5) }
        if (layer.get(x, z - 1) !== v) { ctx.moveTo(sx, Math.round(sz) + 0.5); ctx.lineTo(sx + s, Math.round(sz) + 0.5) }
      }
    }
    ctx.stroke()
  }

  rectScreen(r) {
    const [x1, z1] = this.toScreen(r.x1, r.z1)
    const [x2, z2] = this.toScreen(r.x2 + 1, r.z2 + 1)
    return [Math.round(x1) + 0.5, Math.round(z1) + 0.5, Math.round(x2 - x1), Math.round(z2 - z1)]
  }

  drawZones(ctx) {
    const zones = [...this.project.zones]
    const pending = this.tool.id === 'zone' && this.tool.rect?.()
    if (pending) zones.push({ ...pending, name: '', color: '#ffffff' })
    ctx.font = '600 12px system-ui, sans-serif'
    for (const z of zones) {
      const [x, y, w, h] = this.rectScreen(z)
      ctx.fillStyle = z.color + '22'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = z.color
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
      if (z.name && w > 30) {
        const tw = ctx.measureText(z.name).width
        ctx.fillStyle = z.color
        ctx.fillRect(x, y - 18, tw + 10, 18)
        ctx.fillStyle = '#111'
        ctx.fillText(z.name, x + 5, y - 5)
      }
    }
  }

  fillCells(ctx, cells, colorOf) {
    const s = this.view.scale, b = this.visibleBounds()
    for (const [x, z, v] of cells) {
      if (x + 1 < b.x1 || x > b.x2 || z + 1 < b.z1 || z > b.z2) continue
      const [sx, sz] = this.toScreen(x, z)
      ctx.fillStyle = colorOf(v)
      ctx.fillRect(sx, sz, Math.max(1, s), Math.max(1, s))
    }
  }

  drawFloating(ctx) {
    const f = this.floating
    if (!f) return
    const pal = this.project.palette
    ctx.globalAlpha = 0.85
    const cells = f.cells.map(([dx, dz, , v]) => [f.x + dx, f.z + dz, v])
    this.fillCells(ctx, cells, v => this.color(pal[v]).css)
    ctx.globalAlpha = 1
    const [x, y, w, h] = this.rectScreen({ x1: f.x, z1: f.z, x2: f.x + f.w - 1, z2: f.z + f.h - 1 })
    ctx.strokeStyle = '#7fd17a'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([])
  }

  drawSelection(ctx) {
    if (!this.selection || this.floating) return
    if (this.selection.mask && this.drawMaskOutline(ctx, this.selection)) return
    const [x, y, w, h] = this.rectScreen(this.selection)
    ctx.lineWidth = 1
    ctx.strokeStyle = '#000'; ctx.strokeRect(x, y, w, h)
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4])
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([])
  }

  // Outline of a shaped selection: every cell edge that borders an unselected cell
  drawMaskOutline(ctx, s) {
    if (!s.edges) {
      s.edges = []
      for (const key of s.mask) {
        const [x, z] = key.split(',').map(Number)
        if (!s.mask.has((x - 1) + ',' + z)) s.edges.push(x, z, x, z + 1)
        if (!s.mask.has((x + 1) + ',' + z)) s.edges.push(x + 1, z, x + 1, z + 1)
        if (!s.mask.has(x + ',' + (z - 1))) s.edges.push(x, z, x + 1, z)
        if (!s.mask.has(x + ',' + (z + 1))) s.edges.push(x, z + 1, x + 1, z + 1)
      }
    }
    if (s.edges.length > 4 * 300_000) return false // too detailed, fall back to the bounding box
    const b = this.visibleBounds()
    const path = new Path2D()
    for (let i = 0; i < s.edges.length; i += 4) {
      const x1 = s.edges[i], z1 = s.edges[i + 1], x2 = s.edges[i + 2], z2 = s.edges[i + 3]
      if (x2 < b.x1 || x1 > b.x2 || z2 < b.z1 || z1 > b.z2) continue
      const [sx1, sz1] = this.toScreen(x1, z1), [sx2, sz2] = this.toScreen(x2, z2)
      path.moveTo(Math.round(sx1) + 0.5, Math.round(sz1) + 0.5)
      path.lineTo(Math.round(sx2) + 0.5, Math.round(sz2) + 0.5)
    }
    ctx.lineWidth = 1
    ctx.strokeStyle = '#000'; ctx.stroke(path)
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.stroke(path); ctx.setLineDash([])
    return true
  }

  // Magic wand: same block (or any block) connected to the clicked one, or everywhere on the layer
  wandSelect(c, mode) {
    const layer = this.project.layer(this.currentY)
    const v = layer?.get(c.x, c.z) ?? 0
    if (!v) {
      if (mode === 'new') { this.selection = null; this.toast('Klicke auf einen Block, um ihn auszuwählen.', 2000) }
      return this.redraw()
    }
    const { wandSame, wandContiguous } = this.options
    const match = val => (wandSame ? val === v : val !== 0)
    const picked = new Set()
    if (wandContiguous) {
      const stack = [[c.x, c.z]]
      picked.add(c.x + ',' + c.z)
      while (stack.length && picked.size < 2_000_000) {
        const [x, z] = stack.pop()
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const k = (x + dx) + ',' + (z + dz)
            if (!picked.has(k) && match(layer.get(x + dx, z + dz))) { picked.add(k); stack.push([x + dx, z + dz]) }
          }
        }
      }
    } else {
      for (const [x, z, val] of layer.cells()) if (match(val)) picked.add(x + ',' + z)
    }
    // Combine with the existing selection
    const s = this.selection
    if (mode === 'new' || !s) {
      if (mode === 'sub') return this.redraw()
      return this.setMaskSelection(picked)
    }
    const mask = s.mask ? new Set(s.mask) : new Set()
    if (!s.mask) for (let z = s.z1; z <= s.z2; z++) for (let x = s.x1; x <= s.x2; x++) mask.add(x + ',' + z)
    for (const k of picked) { if (mode === 'add') mask.add(k); else mask.delete(k) }
    this.setMaskSelection(mask)
  }

  setMaskSelection(mask) {
    if (!mask.size) { this.selection = null; return this.redraw() }
    let x1 = Infinity, z1 = Infinity, x2 = -Infinity, z2 = -Infinity
    for (const k of mask) {
      const i = k.indexOf(','), x = +k.slice(0, i), z = +k.slice(i + 1)
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (z < z1) z1 = z
      if (z > z2) z2 = z
    }
    this.selection = { x1, z1, x2, z2, mask }
    this.redraw()
  }

  drawPreview(ctx) {
    const cells = this.tool.preview?.(this)
    if (!cells) return
    const all = this.expand(cells)
    const value = this.tool.value
    ctx.globalAlpha = 0.65
    if (all.length > 60000) {
      const xs = all.map(c => c[0]), zs = all.map(c => c[1])
      const [x, y, w, h] = this.rectScreen({ x1: Math.min(...xs), z1: Math.min(...zs), x2: Math.max(...xs), z2: Math.max(...zs) })
      ctx.fillStyle = value ? this.color(this.block).css : '#e26a5a'
      ctx.fillRect(x, y, w, h)
    } else {
      const css = value ? this.color(this.block).css : 'rgba(226,106,90,0.8)'
      this.fillCells(ctx, all.map(([x, z]) => [x, z, 0]), () => css)
    }
    ctx.globalAlpha = 1
  }

  drawSymmetry(ctx) {
    const { symX, symZ, sym } = this.options
    if (!symX && !symZ) return
    const [sx, sz] = this.toScreen(sym.x + 0.5, sym.z + 0.5)
    ctx.strokeStyle = '#c879ff'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6])
    ctx.beginPath()
    if (symX) { ctx.moveTo(sx, 0); ctx.lineTo(sx, this.H) }
    if (symZ) { ctx.moveTo(0, sz); ctx.lineTo(this.W, sz) }
    ctx.stroke(); ctx.setLineDash([])
  }

  drawHover(ctx) {
    if (!this.hover || this.panning) return
    const brush = ['pencil', 'eraser'].includes(this.tool.id)
    const cells = brush ? this.expand([[this.hover.x, this.hover.z]], false) : [[this.hover.x, this.hover.z]]
    const s = this.view.scale
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1
    for (const [x, z] of cells) {
      const [sx, sz] = this.toScreen(x, z)
      if (s >= 4) ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sz) + 0.5, Math.round(s) - 1, Math.round(s) - 1)
      else { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(sx - 1, sz - 1, 3, 3) }
    }
  }

  drawMeasure(ctx) {
    const t = this.tool
    if (t.id !== 'measure' || !t.a) return
    const [x1, z1] = this.toScreen(t.a.x + 0.5, t.a.z + 0.5)
    const [x2, z2] = this.toScreen(t.b.x + 0.5, t.b.z + 0.5)
    ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x1, z1); ctx.lineTo(x2, z2); ctx.stroke()
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1
    ctx.strokeRect(Math.min(x1, x2), Math.min(z1, z2), Math.abs(x2 - x1), Math.abs(z2 - z1))
    ctx.setLineDash([])
    const d = Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z)
    ctx.font = '600 13px system-ui'; ctx.fillStyle = '#ffd34e'
    ctx.fillText(`${d.toFixed(1)} Blöcke`, (x1 + x2) / 2 + 8, (z1 + z2) / 2 - 8)
  }

  // ---------- editing ----------
  currentValue() { return this.project.blockIndex(this.block) }

  // Brush footprint + symmetry mirrors
  expand(cells, withSym = true) {
    const n = ['pencil', 'eraser', 'line', 'rect', 'ellipse', 'polygon'].includes(this.tool.id) ? this.options.brush : 1
    const lo = -Math.floor((n - 1) / 2), hi = Math.ceil((n - 1) / 2)
    const offs = []
    for (let dz = lo; dz <= hi; dz++) {
      for (let dx = lo; dx <= hi; dx++) {
        if (this.options.round && n > 2 && (dx - (lo + hi) / 2) ** 2 + (dz - (lo + hi) / 2) ** 2 > (n / 2) ** 2) continue
        offs.push([dx, dz])
      }
    }
    const out = []
    const { symX, symZ, sym } = this.options
    for (const [x, z] of cells) {
      for (const [dx, dz] of offs) {
        const px = x + dx, pz = z + dz
        out.push([px, pz])
        if (!withSym) continue
        if (symX) out.push([2 * sym.x - px, pz])
        if (symZ) out.push([px, 2 * sym.z - pz])
        if (symX && symZ) out.push([2 * sym.x - px, 2 * sym.z - pz])
      }
    }
    return out
  }

  paint(cells, v) {
    for (const [x, z] of this.expand(cells)) this.project.set(this.currentY, x, z, v)
    this.redraw()
  }

  floodFill(c, v) {
    const layer = this.project.layer(this.currentY)
    const b = layer?.bounds()
    if (!b) return this.toast('Diese Ebene ist noch leer. Zeichne erst eine Umrandung, dann fülle sie.')
    if (c.x < b.x1 || c.x > b.x2 || c.z < b.z1 || c.z > b.z2) return this.toast('Klicke innerhalb deiner Zeichnung, um zu füllen.')
    const target = layer.get(c.x, c.z)
    if (target === v) return
    const w = b.x2 - b.x1 + 1, h = b.z2 - b.z1 + 1
    if (w * h > 16_000_000) return this.toast('Bereich ist zu groß zum Füllen.')
    const seen = new Uint8Array(w * h)
    const stack = [(c.z - b.z1) * w + (c.x - b.x1)]
    seen[stack[0]] = 1
    let edge = false
    this.project.begin()
    while (stack.length) {
      const i = stack.pop()
      const x = i % w, z = (i / w) | 0
      this.project.set(this.currentY, x + b.x1, z + b.z1, v)
      if (x === 0 || z === 0 || x === w - 1 || z === h - 1) edge = true
      const n = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, z > 0 ? i - w : -1, z < h - 1 ? i + w : -1]
      for (const j of n) {
        if (j < 0 || seen[j]) continue
        seen[j] = 1
        if (layer.get((j % w) + b.x1, ((j / w) | 0) + b.z1) === target) stack.push(j)
      }
    }
    this.project.commit('Füllen')
    if (edge && !target) this.toast('Die Fläche war nicht geschlossen – es wurde bis zum Rand der Zeichnung gefüllt. (Strg+Z macht es rückgängig)')
  }

  liftSelection(cut) {
    const s = this.selection
    if (!s) return
    const ys = this.options.allLayers ? [...this.project.layers.keys()] : [this.currentY]
    const cells = []
    if (cut) this.project.begin()
    for (const y of ys) {
      const layer = this.project.layer(y)
      if (!layer) continue
      for (let z = s.z1; z <= s.z2; z++) {
        for (let x = s.x1; x <= s.x2; x++) {
          const v = layer.get(x, z)
          if (!v || (s.mask && !s.mask.has(x + ',' + z))) continue
          cells.push([x - s.x1, z - s.z1, y, v])
          if (cut) this.project.set(y, x, z, 0)
        }
      }
    }
    const f = { x: s.x1, z: s.z1, w: s.x2 - s.x1 + 1, h: s.z2 - s.z1 + 1, cells, baseY: this.currentY, allLayers: this.options.allLayers, shaped: !!s.mask }
    if (cut) { this.floating = f; this.selection = null }
    this.redraw()
    return f
  }

  // Things a moved selection can line up with: each separate build (connected blocks) and each zone
  snapTargets(f) {
    const rects = this.project.zones.map(z => ({ x1: z.x1, z1: z.z1, x2: z.x2, z2: z.z2 }))
    const layers = f.allLayers ? [...this.project.layers.values()] : [this.project.layer(this.currentY)].filter(Boolean)
    const cells = layers.reduce((n, l) => n + l.count, 0)
    if (cells > 300_000) {
      // Too big to split into builds; use the overall outline only
      for (const l of layers) { const b = l.bounds(); if (b) rects.push(b) }
      return rects
    }
    const filled = new Set()
    for (const l of layers) for (const [x, z] of l.cells()) filled.add(x + ',' + z)
    const seen = new Set()
    for (const key of filled) {
      if (seen.has(key)) continue
      seen.add(key)
      const [sx, sz] = key.split(',').map(Number)
      const r = { x1: sx, z1: sz, x2: sx, z2: sz }
      const stack = [[sx, sz]]
      while (stack.length) {
        const [x, z] = stack.pop()
        if (x < r.x1) r.x1 = x; if (x > r.x2) r.x2 = x; if (z < r.z1) r.z1 = z; if (z > r.z2) r.z2 = z
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const k = (x + dx) + ',' + (z + dz)
            if (filled.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, z + dz]) }
          }
        }
      }
      rects.push(r)
    }
    return rects
  }

  // Photoshop-style smart guides: snap edges/centers of the floating selection to other builds and draw pink lines
  snapFloating(free) {
    this.guides = []
    const f = this.floating
    if (!f || !this.options.snap || free) return
    f.targets ??= this.snapTargets(f)
    const tol = Math.max(1, Math.round(8 / this.view.scale))
    // Lines as [position, kind] in block-edge units: start edge, center, end edge
    const lines = (a1, a2) => [[a1, 'start'], [(a1 + a2 + 1) / 2, 'center'], [a2 + 1, 'end']]
    for (const axis of ['x', 'z']) {
      const [p, size] = axis === 'x' ? [f.x, f.w] : [f.z, f.h]
      let best = null
      for (const t of f.targets) {
        for (const [tp] of lines(t[axis + '1'], t[axis + '2'])) {
          for (const [fp] of lines(p, p + size - 1)) {
            const d = tp - fp
            if (Number.isInteger(d) && Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d
          }
        }
      }
      if (best === null) continue
      if (axis === 'x') f.x += best; else f.z += best
    }
    // Draw a guide for every line that now matches exactly
    const fr = { x1: f.x, z1: f.z, x2: f.x + f.w - 1, z2: f.z + f.h - 1 }
    for (const axis of ['x', 'z']) {
      const other = axis === 'x' ? 'z' : 'x'
      for (const t of f.targets) {
        for (const [tp] of lines(t[axis + '1'], t[axis + '2'])) {
          if (!lines(fr[axis + '1'], fr[axis + '2']).some(([fp]) => fp === tp)) continue
          this.guides.push({ axis, at: tp, from: Math.min(t[other + '1'], fr[other + '1']), to: Math.max(t[other + '2'], fr[other + '2']) + 1 })
        }
      }
    }
  }

  drawGuides(ctx) {
    if (!this.guides?.length || !this.floating) return
    ctx.strokeStyle = '#ff2bd6'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const g of this.guides) {
      if (g.axis === 'x') {
        const [x, z1] = this.toScreen(g.at, g.from), [, z2] = this.toScreen(g.at, g.to)
        ctx.moveTo(Math.round(x) + 0.5, z1 - 8); ctx.lineTo(Math.round(x) + 0.5, z2 + 8)
      } else {
        const [x1, z] = this.toScreen(g.from, g.at), [x2] = this.toScreen(g.to, g.at)
        ctx.moveTo(x1 - 8, Math.round(z) + 0.5); ctx.lineTo(x2 + 8, Math.round(z) + 0.5)
      }
    }
    ctx.stroke()
  }

  dropFloating() {
    const f = this.floating
    if (!f) return
    if (!this.project.tx) this.project.begin()
    const dy = this.currentY - f.baseY
    for (const [dx, dz, y, v] of f.cells) {
      const ty = y + dy
      if (ty >= MIN_Y && ty <= MAX_Y) this.project.set(ty, f.x + dx, f.z + dz, v)
    }
    // A shaped selection stays shaped where it was dropped
    if (f.shaped) this.setMaskSelection(new Set(f.cells.map(([dx, dz]) => (f.x + dx) + ',' + (f.z + dz))))
    else this.selection = { x1: f.x, z1: f.z, x2: f.x + f.w - 1, z2: f.z + f.h - 1 }
    this.floating = null
    this.project.commit('Verschieben')
    this.redraw()
  }

  copy(cut) {
    if (this.floating) {
      this.clipboard = structuredClone(this.floating)
      if (cut) { this.floating = null; this.project.commit('Ausschneiden') }
    } else if (this.selection) {
      if (cut) {
        this.clipboard = structuredClone(this.liftSelection(true))
        this.floating = null
        this.project.commit('Ausschneiden')
      } else {
        this.clipboard = this.liftSelection(false)
      }
    } else return this.toast('Erst mit dem Auswahl-Werkzeug (M) einen Bereich markieren.')
    this.toast(`${this.clipboard.cells.length} Blöcke ${cut ? 'ausgeschnitten' : 'kopiert'}${this.clipboard.allLayers ? ' (alle Ebenen)' : ''}.`)
    this.redraw()
  }

  paste() {
    if (!this.clipboard) return this.toast('Die Zwischenablage ist leer.')
    this.dropFloating()
    const at = this.hover ?? { x: Math.floor(this.view.cx), z: Math.floor(this.view.cz) }
    const clip = structuredClone(this.clipboard)
    // keep vertical offsets relative to the layer you paste on
    const cells = clip.cells.map(([dx, dz, y, v]) => [dx, dz, y - clip.baseY + this.currentY, v])
    this.setTool('select')
    this.floating = { ...clip, x: at.x, z: at.z, baseY: this.currentY, cells, targets: undefined }
    this.toast('Eingefügt – ziehen zum Platzieren, Enter oder Klick daneben zum Absetzen.')
  }

  deleteSelection() {
    if (this.floating) {
      this.floating = null
      this.project.commit('Löschen')
    } else if (this.selection) {
      this.liftSelection(true)
      this.floating = null
      this.project.commit('Löschen')
    }
    this.redraw()
  }

  transformFloating(kind) {
    if (!this.floating) {
      if (!this.selection) return this.toast('Erst einen Bereich auswählen.')
      this.liftSelection(true)
    }
    const f = this.floating
    // Treppen, Stämme, Schilder usw. drehen bzw. spiegeln sich mit
    const states = new Map()
    const st = v => {
      if (!states.has(v)) states.set(v, this.project.blockIndex(transformState(this.project.palette[v], kind)))
      return states.get(v)
    }
    if (kind === 'rotate') {
      f.cells = f.cells.map(([dx, dz, y, v]) => [f.h - 1 - dz, dx, y, st(v)]);
      [f.w, f.h] = [f.h, f.w]
    } else if (kind === 'flipX') f.cells = f.cells.map(([dx, dz, y, v]) => [f.w - 1 - dx, dz, y, st(v)])
    else f.cells = f.cells.map(([dx, dz, y, v]) => [dx, f.h - 1 - dz, y, st(v)])
    this.redraw()
  }

  async addZone(rect) {
    const name = await this.ask('Neue Zone', 'Name der Zone', 'Lager')
    if (!name) return this.redraw()
    const color = ZONE_COLORS[this.project.zones.length % ZONE_COLORS.length]
    this.project.zones.push({ id: Date.now(), name, color, ...rect })
    this.refreshZones()
    this.scheduleSave()
    this.redraw()
  }

  setY(y) {
    y = Math.max(MIN_Y, Math.min(MAX_Y, Math.round(y)))
    if (Number.isNaN(y)) return
    this.currentY = y
    $('#layer-y').value = y
    this.refreshLayers()
    this.redraw()
    this.scheduleSave()
  }

  copyLayerTo(fromY, toY) {
    const src = this.project.layer(fromY)
    if (!src || !src.count) return false
    for (const [x, z, v] of src.cells()) this.project.set(toY, x, z, v)
    return true
  }

  // ---------- UI ----------
  setTool(id) {
    const t = TOOLS.find(t => t.id === id)
    if (!t) return
    if (t.id !== 'select' && t.id !== 'wand') this.dropFloating()
    this.tool = t
    for (const b of document.querySelectorAll('#toolbar button')) b.classList.toggle('on', b.dataset.tool === id)
    this.canvas.style.cursor = t.pan ? 'grab' : t.id === 'picker' ? 'copy' : 'crosshair'
    this.buildOptions()
    this.redraw()
  }

  buildToolbar() {
    const bar = $('#toolbar')
    bar.innerHTML = TOOLS.map(t => `${['pencil', 'fill', 'picker'].includes(t.id) ? '<hr>' : ''}<button data-tool="${t.id}" title="${t.name} (${t.key.toUpperCase()})" aria-label="${t.name}">${ICONS[t.id]}</button>`).join('')
    bar.onclick = e => { const b = e.target.closest('button'); if (b) this.setTool(b.dataset.tool) }
    $('[data-action=undo]').innerHTML = ICONS.undo
    $('[data-action=redo]').innerHTML = ICONS.redo
    this.setTool('pencil')
  }

  buildOptions() {
    const o = this.options, t = this.tool.id
    const parts = [`<span class="label">${this.tool.name}</span><span class="sep"></span>`]
    if (['pencil', 'eraser', 'line', 'rect', 'ellipse', 'polygon'].includes(t)) {
      parts.push(`<label>Größe <input type="range" min="1" max="15" value="${o.brush}" data-opt="brush"> <b>${o.brush}</b></label>`)
      if (t === 'pencil' || t === 'eraser') parts.push(`<label><input type="checkbox" data-opt="round" ${o.round ? 'checked' : ''}> Rund</label>`)
    }
    if (t === 'polygon') {
      parts.push(`<span class="label">Ecken</span>${[5, 6, 7, 8].map(n => `<button data-sides="${n}" class="${o.sides === n ? 'on' : ''}" title="${['Fünfeck', 'Sechseck', 'Siebeneck', 'Achteck'][n - 5]}">${n}</button>`).join('')}
        <label><input type="checkbox" data-opt="filled" ${o.filled ? 'checked' : ''}> Gefüllt</label>
        <label title="Spitze statt flache Seite oben (bzw. umgekehrt)"><input type="checkbox" data-opt="rotated" ${o.rotated ? 'checked' : ''}> Gedreht</label>
        <span class="label">Shift = gleich breit wie hoch</span>`)
    }
    if (t === 'rect' || t === 'ellipse') parts.push(`<label><input type="checkbox" data-opt="filled" ${o.filled ? 'checked' : ''}> Gefüllt</label><span class="label">Shift = ${t === 'rect' ? 'Quadrat' : 'Kreis'}</span>`)
    if (t === 'line') parts.push('<span class="label">Shift = gerade / 45°</span>')
    if (t === 'fill') parts.push('<span class="label">Füllt die zusammenhängende Fläche gleicher Blöcke auf dieser Ebene</span>')
    if (t === 'wand') {
      parts.push(`<label title="Nur Blöcke derselben Sorte wählen; aus = ganzer zusammenhängender Bau"><input type="checkbox" data-opt="wandSame" ${o.wandSame ? 'checked' : ''}> Gleicher Block</label>
        <label title="Nur zusammenhängende Blöcke; aus = alle passenden auf der Ebene"><input type="checkbox" data-opt="wandContiguous" ${o.wandContiguous ? 'checked' : ''}> Zusammenhängend</label>
        <span class="label">Shift = hinzufügen, Alt = abziehen</span><span class="sep"></span>`)
    }
    if (t === 'select' || t === 'wand') {
      parts.push(`<label><input type="checkbox" data-opt="allLayers" ${o.allLayers ? 'checked' : ''}> Alle Ebenen</label>
        <label title="Beim Verschieben an Kanten und Mitten anderer Bauten einrasten (Alt halten = frei)"><input type="checkbox" data-opt="snap" ${o.snap ? 'checked' : ''}> Hilfslinien</label>
        <button data-cmd="copy" title="Strg+C">Kopieren</button><button data-cmd="cut" title="Strg+X">Ausschneiden</button>
        <button data-cmd="paste" title="Strg+V">Einfügen</button><button data-cmd="delete" title="Entf">Löschen</button>
        <button data-cmd="rotate" title="Drehen (Q)">⟳ 90°</button><button data-cmd="flipX" title="Spiegeln links/rechts">⇆</button>
        <button data-cmd="flipZ" title="Spiegeln oben/unten">⇅</button><button data-cmd="deselect" title="Esc">Fertig</button>`)
    }
    if (t === 'picker') parts.push('<span class="label">Klick auf einen Block übernimmt ihn in die Hotbar</span>')
    if (t === 'zone') parts.push('<span class="label">Rechteck aufziehen und benennen</span>')
    if (t === 'teleport') parts.push('<span class="label">Klick auf einen Block → Teleport-Befehl für Minecraft kopieren</span>')
    if (t === 'hand') parts.push('<span class="label">Tipp: Leertaste oder mittlere Maustaste verschiebt immer, Mausrad zoomt</span>')
    if (!['hand', 'picker', 'measure', 'zone', 'teleport'].includes(t)) {
      parts.push(`<span class="sep"></span><span class="label">Symmetrie</span>
        <button data-opt-toggle="symX" class="${o.symX ? 'on' : ''}" title="Links/rechts spiegeln (X)">⇆ X</button>
        <button data-opt-toggle="symZ" class="${o.symZ ? 'on' : ''}" title="Oben/unten spiegeln (Z)">⇅ Z</button>
        <span class="label" title="Mit S die Mitte auf den Mauszeiger setzen">Mitte ${o.sym.x}, ${o.sym.z} (S)</span>`)
    }
    parts.push('<span class="info"></span>')
    const bar = $('#optionsbar')
    bar.innerHTML = parts.join('')
    bar.oninput = e => {
      const k = e.target.dataset.opt
      if (!k) return
      o[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value
      if (k === 'brush') e.target.nextElementSibling.textContent = o.brush
      this.redraw()
    }
    bar.onclick = e => {
      const b = e.target.closest('button')
      if (!b) return
      if (b.dataset.sides) { o.sides = +b.dataset.sides; this.buildOptions(); this.redraw() }
      if (b.dataset.optToggle) { o[b.dataset.optToggle] = !o[b.dataset.optToggle]; this.buildOptions(); this.redraw() }
      const cmd = b.dataset.cmd
      if (cmd === 'copy') this.copy(false)
      if (cmd === 'cut') this.copy(true)
      if (cmd === 'paste') this.paste()
      if (cmd === 'delete') this.deleteSelection()
      if (cmd === 'rotate' || cmd === 'flipX' || cmd === 'flipZ') this.transformFloating(cmd)
      if (cmd === 'deselect') { this.dropFloating(); this.selection = null; this.redraw() }
    }
  }

  buildPalette(filter = '') {
    const f = filter.trim().toLowerCase()
    const html = []
    for (const [group, list] of BLOCK_GROUPS) {
      const items = list.filter(([id, name]) => !f || id.includes(f) || name.toLowerCase().includes(f))
      if (!items.length) continue
      html.push(`<h4>${group}</h4><div class="grid">`)
      for (const [id, name, color, alpha = 1] of items) {
        const full = 'minecraft:' + id
        html.push(`<button data-block="${full}" title="${esc(name)}\n${full}" class="${alpha < 1 ? 'checker' : ''} ${full === this.block ? 'on' : ''}" style="${alpha < 1 ? `box-shadow: inset 0 0 0 40px ${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : `background:${color}`}"></button>`)
      }
      html.push('</div>')
    }
    $('#palette').innerHTML = html.join('') || '<p class="hint">Nichts gefunden. Du kannst die ID unten auch direkt eingeben.</p>'
  }

  selectBlock(id) {
    this.hotbar[this.slot] = id
    this.refreshBlock()
    this.scheduleSave()
  }

  refreshBlock() {
    const info = blockInfo(this.block)
    const c = this.color(this.block)
    $('#current-block').innerHTML = `<div class="sw ${info.alpha < 1 ? 'checker' : ''}" style="box-shadow: inset 0 0 0 40px rgba(${c.r},${c.g},${c.b},${info.alpha})"></div><div><div>${esc(info.name)}</div><small>${esc(this.block)}</small></div>`
    for (const b of document.querySelectorAll('#palette button')) b.classList.toggle('on', b.dataset.block === this.block)
    $('#hotbar').innerHTML = this.hotbar.map((id, i) => {
      const k = this.color(id), a = blockInfo(id).alpha
      return `<button data-slot="${i}" class="${i === this.slot ? 'on' : ''}" title="${esc(blockInfo(id).name)} (${i + 1})" style="background: rgba(${k.r},${k.g},${k.b},${a})"><span>${i + 1}</span></button>`
    }).join('')
    this.redraw()
  }

  refreshLayers() {
    $('#layer-y').value = this.currentY
    const ys = new Set([...this.project.layers.values()].filter(l => l.count).map(l => l.y))
    ys.add(this.currentY)
    $('#layer-list').innerHTML = [...ys].sort((a, b) => b - a).map(y => {
      const l = this.project.layer(y)
      const vis = l ? l.visible : true
      return `<li data-y="${y}" class="${y === this.currentY ? 'on' : ''}"><button data-eye="${y}" title="Ein-/ausblenden">${vis ? ICONS.eye : ICONS.eyeOff}</button>Y ${y}<span class="n">${l ? l.count.toLocaleString('de-DE') : 0} Blöcke</span></li>`
    }).join('')
  }

  refreshZones() {
    $('#zone-list').innerHTML = this.project.zones.map((z, i) => `<li data-zone="${i}"><span class="zone-dot" style="background:${z.color}"></span>${esc(z.name)}<span class="n">${z.x2 - z.x1 + 1}×${z.z2 - z.z1 + 1}</span><button data-zone-del="${i}" title="Zone löschen">✕</button></li>`).join('') || '<li class="hint">Noch keine Zonen.</li>'
  }

  refreshAll() {
    this.refreshBlock()
    this.refreshLayers()
    this.refreshZones()
    this.redraw()
  }

  syncSettingsUI() {
    const s = this.settings
    $('#opt-biomes').checked = s.biomes
    $('#opt-relief').checked = s.relief
    $('#opt-alpha').value = s.alpha
    $('#opt-slime').checked = s.slime
    $('#opt-chunks').checked = s.chunks
    $('#opt-grid').checked = s.grid
    $('#opt-ghost').checked = s.ghost
    this.map.setRelief(s.relief)
  }

  applySeed(seed, announce = true) {
    seed = String(seed ?? '').trim()
    this.project.seed = seed
    this.seedValue = seed ? parseSeed(seed) : null
    if (seed && this.map.seed !== seed) this.map.setSeed(seed)
    if (!seed) this.map.setSeed(null)
    if (announce && seed) this.toast(`Seed ${this.seedValue} geladen. Die Karte wird berechnet …`)
    this.redraw()
  }

  bindUI() {
    $('#topbar').onclick = e => {
      const a = e.target.closest('[data-action]')?.dataset.action
      if (a) this.action(a)
    }
    $('#sidebar').addEventListener('click', e => {
      const a = e.target.closest('[data-action]')?.dataset.action
      if (a) return this.action(a)
      const eye = e.target.closest('[data-eye]')
      if (eye) {
        const l = this.project.layer(+eye.dataset.eye, true)
        l.visible = !l.visible
        this.refreshLayers(); this.redraw(); return
      }
      const li = e.target.closest('[data-y]')
      if (li) return this.setY(+li.dataset.y)
      const blk = e.target.closest('[data-block]')
      if (blk) return this.selectBlock(blk.dataset.block)
      const zd = e.target.closest('[data-zone-del]')
      if (zd) { this.project.zones.splice(+zd.dataset.zoneDel, 1); this.refreshZones(); this.redraw(); this.scheduleSave(); return }
      const zone = e.target.closest('[data-zone]')
      if (zone) {
        const z = this.project.zones[+zone.dataset.zone]
        this.view.cx = (z.x1 + z.x2 + 1) / 2; this.view.cz = (z.z1 + z.z2 + 1) / 2
        this.redraw()
      }
    })
    $('#hotbar').onclick = e => {
      const b = e.target.closest('[data-slot]')
      if (b) { this.slot = +b.dataset.slot; this.refreshBlock() }
    }
    $('#layer-y').onchange = e => this.setY(+e.target.value)
    $('#block-search').oninput = e => this.buildPalette(e.target.value)
    $('#custom-block').onkeydown = e => { if (e.key === 'Enter') this.action('custom-block') }
    $('#seed').onkeydown = e => { if (e.key === 'Enter') this.action('seed') }
    $('#project-name').onchange = e => { this.project.name = e.target.value.trim() || 'Basenplan'; this.scheduleSave() }
    const bindSetting = (id, key, fn) => {
      $(id).oninput = e => {
        this.settings[key] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value
        fn?.()
        this.redraw(); this.scheduleSave()
      }
    }
    bindSetting('#opt-biomes', 'biomes')
    bindSetting('#opt-relief', 'relief', () => this.map.setRelief(this.settings.relief))
    bindSetting('#opt-alpha', 'alpha')
    bindSetting('#opt-slime', 'slime', () => { if (this.settings.slime && this.seedValue === null) this.toast('Für Slime-Chunks braucht es einen Seed.') })
    bindSetting('#opt-chunks', 'chunks')
    bindSetting('#opt-grid', 'grid')
    bindSetting('#opt-ghost', 'ghost')
    for (const id of ['#file-input', '#import-input']) {
      $(id).onchange = e => {
        const file = e.target.files[0]
        e.target.value = ''
        if (file) this.openFile(file)
      }
    }
    // Drag & drop of plans and schematics onto the map
    const stage = $('#stage')
    stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop') })
    stage.addEventListener('dragleave', () => stage.classList.remove('drop'))
    stage.addEventListener('drop', e => {
      e.preventDefault()
      stage.classList.remove('drop')
      const file = e.dataTransfer.files[0]
      if (file) {
        const r = this.canvas.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientY >= r.top) this.hover = this.cellAt(e)
        this.openFile(file)
      }
    })
  }

  // Plans (.basenplan.json) replace the project; schematics are placed as a movable selection
  async openFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const isJson = bytes[0] === 0x7b // "{"
    try {
      if (isJson) {
        this.setProject(Project.fromJSON(JSON.parse(new TextDecoder().decode(bytes))))
        const b = this.project.bounds()
        if (b) { this.view.cx = (b.x1 + b.x2 + 1) / 2; this.view.cz = (b.z1 + b.z2 + 1) / 2; this.currentY = b.y1 }
        this.refreshAll()
        this.scheduleSave()
        this.toast(`„${this.project.name}“ geladen.`)
      } else {
        await this.importSchematic(readSchematic(bytes), file.name)
      }
    } catch (err) {
      this.toast('Datei konnte nicht geladen werden: ' + err.message, 6000)
    }
  }

  async importSchematic(s, filename) {
    if (!s.count) return this.toast('Die Schematic enthält nur Luft.')
    this.dropFloating()
    const at = this.hover ?? { x: Math.floor(this.view.cx), z: Math.floor(this.view.cz) }
    const r = await this.dialog('Schematic importieren', `
      <p><b>${esc(filename)}</b> · ${esc(s.format)}</p>
      <p class="hint">${s.W} × ${s.H} × ${s.L} Blöcke (B × H × L) · ${s.count.toLocaleString('de-DE')} Blöcke · ${s.kinds} Blocksorten</p>
      <label class="field"><span>Position</span><select name="where">
        <option value="here">Bei der Maus / Bildmitte (X ${at.x}, Z ${at.z})</option>
        ${s.origin ? `<option value="origin">An den Originalkoordinaten (X ${s.origin[0]}, Y ${s.origin[1]}, Z ${s.origin[2]})</option>` : ''}
      </select></label>
      <label class="field"><span>Unterste Ebene auf Y</span><input name="y" type="number" min="${MIN_Y}" max="${MAX_Y}" value="${this.currentY}"></label>
      <p class="hint">Danach kannst du die Schematic verschieben, mit Q drehen und mit Enter absetzen.</p>`,
    [['cancel', 'Abbrechen'], ['ok', 'Importieren', true]])
    if (r !== 'ok') return
    const form = $('#dialog form')
    const origin = form.where.value === 'origin'
    const baseY = origin ? s.origin[1] : Math.max(MIN_Y, Math.min(MAX_Y, Math.round(+form.y.value)))
    const ids = s.palette.map((id, i) => (i ? this.project.blockIndex(id) : 0))
    const cells = []
    for (let y = 0; y < s.H; y++) {
      for (let z = 0; z < s.L; z++) {
        for (let x = 0; x < s.W; x++) {
          const v = s.data[(y * s.L + z) * s.W + x]
          if (v && ids[v]) cells.push([x, z, baseY + y, ids[v]])
        }
      }
    }
    const x = origin ? s.origin[0] : at.x - (s.W >> 1), z = origin ? s.origin[2] : at.z - (s.L >> 1)
    this.setY(baseY)
    this.setTool('select')
    this.floating = { x, z, w: s.W, h: s.L, cells, baseY, allLayers: true }
    this.view.cx = x + s.W / 2; this.view.cz = z + s.L / 2
    this.refreshBlock()
    this.redraw()
    this.toast('Schematic platziert – ziehen zum Verschieben, Q dreht, Enter setzt sie ab.', 5000)
  }

  downloadBlob(blob, name) {
    download(blob, name, blob.type)
  }

  async action(a) {
    if (a !== 'undo' && a !== 'redo') this.dropFloating()
    switch (a) {
      case 'new':
        if (await this.confirm('Neuer Plan', 'Den aktuellen Plan verwerfen? Speichere ihn vorher, wenn du ihn behalten willst. Der Seed bleibt erhalten.')) {
          const seed = this.project.seed
          const p = new Project()
          p.seed = seed
          this.setProject(p)
          this.refreshAll()
          this.scheduleSave()
        }
        break
      case 'open': $('#file-input').click(); break
      case 'import': $('#import-input').click(); break
      case '3d': this.view3d.open(); break
      case 'save': {
        const json = JSON.stringify(this.project.toJSON())
        download(new TextEncoder().encode(json), `${this.fileName()}.basenplan.json`, 'application/json')
        break
      }
      case 'undo': this.undo(); break
      case 'redo': this.redoAction(); break
      case 'materials': this.showMaterials(); break
      case 'replace': this.showReplace(); break
      case 'png': this.canvas.toBlob(b => download(b, `${this.fileName()}.png`, 'image/png')); break
      case 'export': this.showExport(); break
      case 'mc-build': this.showBuild(); break
      case 'layer-up': this.setY(this.currentY + 1); break
      case 'layer-down': this.setY(this.currentY - 1); break
      case 'layer-copy-up':
        this.project.begin()
        if (this.copyLayerTo(this.currentY, this.currentY + 1)) { this.project.commit('Ebene kopieren'); this.setY(this.currentY + 1) } else { this.project.commit(); this.toast('Diese Ebene ist leer.') }
        break
      case 'layer-extrude': {
        if (!this.project.layer(this.currentY)?.count) return this.toast('Diese Ebene ist leer.')
        const n = parseInt(await this.ask('Hochziehen', 'Wie viele Ebenen darüber sollen eine Kopie bekommen? (z. B. 4 für eine 5 Blöcke hohe Wand)', '4'), 10)
        if (!(n > 0)) return
        this.project.begin()
        for (let i = 1; i <= Math.min(n, MAX_Y - this.currentY); i++) this.copyLayerTo(this.currentY, this.currentY + i)
        this.project.commit('Hochziehen')
        this.toast(`Ebene Y ${this.currentY} wurde ${n}× nach oben kopiert.`)
        break
      }
      case 'layer-clear': {
        const l = this.project.layer(this.currentY)
        if (!l?.count) return
        this.project.begin()
        for (const [x, z] of [...l.cells()]) this.project.set(this.currentY, x, z, 0)
        this.project.commit('Ebene leeren')
        break
      }
      case 'custom-block': {
        const id = normalizeBlockId($('#custom-block').value)
        if (!id) return this.toast('Ungültige Block-ID. Beispiel: minecraft:oak_stairs[facing=east]')
        this.selectBlock(id)
        $('#custom-block').value = ''
        break
      }
      case 'seed': this.applySeed($('#seed').value); this.scheduleSave(); break
      case 'goto': {
        const x = +$('#goto-x').value, z = +$('#goto-z').value
        if (Number.isFinite(x) && Number.isFinite(z)) { this.view.cx = x + 0.5; this.view.cz = z + 0.5; this.redraw(); this.scheduleSave() }
        break
      }
    }
  }

  undo() {
    if (this.floating) this.dropFloating()
    const label = this.project.undo()
    this.toast(label ? `Rückgängig: ${label}` : 'Nichts mehr rückgängig zu machen.', 1200)
  }

  redoAction() {
    const label = this.project.redo()
    this.toast(label ? `Wiederholt: ${label}` : 'Nichts zum Wiederholen.', 1200)
  }

  fileName() {
    return (this.project.name || 'basenplan').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_') || 'basenplan'
  }

  async showReplace() {
    const used = this.project.materials()
    if (!used.length) return this.toast('Noch keine Blöcke gesetzt.')
    // Preselect the block under the mouse, otherwise the most common one
    const under = this.hover && this.project.get(this.currentY, this.hover.x, this.hover.z)
    const from = under ? this.project.palette[under] : used[0][0]
    const opt = (id, sel, extra = '') => `<option value="${esc(id)}" ${sel ? 'selected' : ''}>${esc(blockInfo(id).name)}${extra}</option>`
    const groups = BLOCK_GROUPS.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(([id]) => opt('minecraft:' + id, false)).join('')}</optgroup>`).join('')
    const sel = this.selection
    const r = await this.dialog('Blöcke ersetzen', `
      <label class="field"><span>Ersetze</span><select name="from">${used.map(([id, n]) => opt(id, id === from, ` (${n.toLocaleString('de-DE')})`)).join('')}</select></label>
      <label class="field"><span>durch</span><select name="to">
        <optgroup label="Hotbar">${[...new Set(this.hotbar)].map(id => opt(id, id === this.block)).join('')}</optgroup>
        <optgroup label="Entfernen"><option value="">Luft (Blöcke löschen)</option></optgroup>
        ${groups}
      </select></label>
      <label class="field"><span>… oder eigene Block-ID</span><input name="custom" placeholder="z. B. spruce_stairs" spellcheck="false"></label>
      <label class="field"><span>Bereich</span><select name="scope">
        <option value="all">Ganzer Plan (alle Ebenen)</option>
        <option value="layer">Nur aktuelle Ebene (Y ${this.currentY})</option>
        ${sel ? `<option value="sel" selected>Nur Auswahl ${sel.x2 - sel.x1 + 1}×${sel.z2 - sel.z1 + 1} (${this.options.allLayers ? 'alle Ebenen' : `Ebene Y ${this.currentY}`})</option>` : ''}
      </select></label>
      <label class="check"><input type="checkbox" name="variants"> Alle Varianten ersetzen (z. B. Treppen in jede Richtung) – Ausrichtung bleibt erhalten</label>`,
    [['cancel', 'Abbrechen'], ['ok', 'Ersetzen', true]])
    if (r !== 'ok') return
    const f = $('#dialog form').elements
    let to = f.to.value
    if (f.custom.value.trim()) {
      to = normalizeBlockId(f.custom.value)
      if (!to) return this.toast('Ungültige Block-ID. Beispiel: minecraft:spruce_stairs')
    }
    const n = this.replaceBlocks({ from: f.from.value, to, scope: f.scope.value, variants: f.variants.checked })
    this.toast(n ? `${n.toLocaleString('de-DE')} Blöcke ersetzt. (Strg+Z macht es rückgängig)` : 'Keine passenden Blöcke im gewählten Bereich gefunden.', 4000)
  }

  // Replace blocks; with variants, "oak_stairs[facing=east]" -> "spruce_stairs[facing=east]"
  replaceBlocks({ from, to, scope, variants }) {
    const p = this.project
    const map = new Map()
    p.palette.forEach((id, i) => {
      if (!id || !(variants ? baseId(id) === baseId(from) : id === from)) return
      if (!to) return map.set(i, 0)
      // Keep block states only between the same kind of block (stairs -> stairs, log -> log)
      const kind = x => baseId(x).split('_').pop()
      const target = variants && !to.includes('[') && id.includes('[') && kind(id) === kind(to) ? to + id.slice(id.indexOf('[')) : to
      if (target !== id) map.set(i, p.blockIndex(target))
    })
    if (!map.size) return 0
    const s = this.selection
    const ys = scope === 'layer' || (scope === 'sel' && !this.options.allLayers) ? [this.currentY] : [...p.layers.keys()]
    let n = 0
    p.begin()
    for (const y of ys) {
      const layer = p.layer(y)
      if (!layer) continue
      for (const [x, z, v] of [...layer.cells()]) {
        if (!map.has(v) || (scope === 'sel' && !inSel(s, x, z))) continue
        p.set(y, x, z, map.get(v))
        n++
      }
    }
    p.commit('Ersetzen')
    return n
  }

  showMaterials() {
    const list = this.project.materials()
    if (!list.length) return this.toast('Noch keine Blöcke gesetzt.')
    const total = list.reduce((s, [, n]) => s + n, 0)
    const fmt = n => n.toLocaleString('de-DE')
    const stacks = n => `${Math.floor(n / 64)} × 64${n % 64 ? ` + ${n % 64}` : ''}`
    const rows = list.map(([id, n]) => {
      const c = this.color(id)
      return `<tr><td><span class="sw-inline" style="background:${c.css}"></span>${esc(blockInfo(id).name)}</td><td>${fmt(n)}</td><td>${stacks(n)}</td><td>${(n / 1728).toFixed(n >= 1728 ? 1 : 2)}</td></tr>`
    }).join('')
    const text = list.map(([id, n]) => `${blockInfo(id).name}\t${n}\t${stacks(n)}`).join('\n')
    this.dialog('Materialliste', `<p class="hint">${fmt(total)} Blöcke auf ${this.project.layers.size} Ebenen. 1 Shulkerkiste = 27 Stacks = 1728 Blöcke.</p>
      <div class="scroll"><table><tr><th>Block</th><th>Anzahl</th><th>Stacks</th><th>Shulker</th></tr>${rows}</table></div>`,
    [['copy', 'Als Text kopieren'], ['ok', 'Schließen', true]]).then(r => {
      if (r === 'copy') navigator.clipboard.writeText(text).then(() => this.toast('Materialliste kopiert.'), () => this.toast('Kopieren nicht möglich.'))
    })
  }

  async showExport() {
    this.dropFloating()
    const b = this.project.bounds()
    if (!b) return this.toast('Der Plan ist leer – setze erst ein paar Blöcke.')
    const size = [b.x2 - b.x1 + 1, b.y2 - b.y1 + 1, b.z2 - b.z1 + 1]
    const hidden = [...this.project.layers.values()].filter(l => !l.visible && l.count).length
    const r = await this.dialog('Als Schematic exportieren', `
      <p class="hint">Größe ${size.join(' × ')} Blöcke · Ecke bei X ${b.x1}, Y ${b.y1}, Z ${b.z1}${hidden ? ` · ${hidden} ausgeblendete Ebene(n) werden nicht exportiert` : ''}</p>
      <label class="field"><span>Format</span><select name="format">
        <option value="litematic">Litematica (.litematic)</option>
        <option value="schem">WorldEdit / FAWE / Sponge (.schem)</option>
      </select></label>
      <label class="field"><span>Minecraft-Version (DataVersion)</span><select name="dv">
        ${DATA_VERSIONS.map(([v, d]) => `<option value="${d}">Java ${v} (${d})</option>`).join('')}
      </select></label>
      <label class="field"><span>Name</span><input name="name" value="${esc(this.fileName())}"></label>
      <p class="hint"><b>Litematica:</b> Datei in <code>.minecraft/schematics</code> legen, im Spiel laden und an X ${b.x1} Y ${b.y1} Z ${b.z1} platzieren.<br>
      <b>WorldEdit:</b> nach <code>plugins/WorldEdit/schematics</code> (oder <code>config/worldedit/schematics</code>), dann <code>//schem load NAME</code> und <code>//paste -o</code> setzt sie an die Originalkoordinaten.</p>
      <p class="hint"><b>MCPainter-Mod:</b> Mit „Mit Minecraft koppeln“ baust du den Plan direkt in deiner Welt, ganz ohne Datei.</p>`,
    [['pair', 'Mit Minecraft koppeln…'], ['cancel', 'Abbrechen'], ['ok', 'Exportieren', true]])
    if (r === 'pair') return this.pairMinecraft()
    if (r !== 'ok') return
    const form = $('#dialog form')
    const name = (form.elements.name.value || 'basenplan').replace(/[^\w\-]+/g, '_')
    const opts = { dataVersion: +form.dv.value, name }
    try {
      const res = form.format.value === 'schem' ? exportSponge(this.project, opts) : exportLitematic(this.project, opts)
      download(res.bytes, `${name}.${form.format.value}`)
      this.toast(`Exportiert: ${name}.${form.format.value} (${res.size.join('×')})`)
    } catch (e) {
      this.toast(e.message, 5000)
    }
  }

  // ---------- teleport ----------
  // Commands for a clicked block; you land in the middle of the block, standing on it if one is planned there
  tpCommands(c) {
    const y = this.currentY + (this.project.get(this.currentY, c.x, c.z) ? 1 : 0)
    const x = c.x + 0.5, z = c.z + 0.5
    const nx = Math.floor(c.x / 8) + 0.5, nz = Math.floor(c.z / 8) + 0.5
    return [
      ['TP-Befehl kopieren', `/tp @s ${x} ${y} ${z}`, `auf Ebene Y ${y}`],
      ['TP, Höhe beibehalten', `/tp @s ${x} ~ ${z}`, 'gut beim Fliegen'],
      ['TP in den Nether (gleiche Stelle)', `/execute in minecraft:the_nether run tp @s ${nx} ~ ${nz}`, `Nether X ${nx - 0.5}, Z ${nz - 0.5}`],
      ['Nur Koordinaten kopieren', `${c.x} ${y} ${c.z}`, ''],
    ]
  }

  showTpMenu(c, e) {
    this.closeTpMenu()
    this.tpCell = c
    const menu = document.createElement('div')
    menu.id = 'tp-menu'
    menu.innerHTML = `<div class="head">X ${c.x} · Y ${this.currentY} · Z ${c.z}</div>` + this.tpCommands(c).map(([label, cmd, hint], i) =>
      `<button data-i="${i}" class="${i ? '' : 'primary'}"><span>${esc(label)}</span><code>${esc(cmd)}</code>${hint ? `<small>${esc(hint)}</small>` : ''}</button>`).join('')
    $('#stage').appendChild(menu)
    const r = $('#stage').getBoundingClientRect(), m = menu.getBoundingClientRect()
    menu.style.left = Math.max(8, Math.min(e.clientX - r.left + 12, r.width - m.width - 8)) + 'px'
    menu.style.top = Math.max(8, Math.min(e.clientY - r.top + 12, r.height - m.height - 8)) + 'px'
    menu.onpointerdown = ev => ev.stopPropagation()
    menu.onclick = ev => {
      const b = ev.target.closest('button')
      if (!b) return
      const cmd = this.tpCommands(c)[+b.dataset.i][1]
      this.copyText(cmd).then(ok => this.toast(ok ? `Kopiert: ${cmd} – im Spiel mit T den Chat öffnen und einfügen (Strg+V).` : 'Kopieren nicht möglich – bitte manuell abschreiben: ' + cmd, 5000))
      this.closeTpMenu()
    }
    this.redraw()
  }

  closeTpMenu() {
    if (!this.tpCell) return
    this.tpCell = null
    $('#tp-menu')?.remove()
    this.redraw()
  }

  drawTpTarget(ctx) {
    if (!this.tpCell) return
    const [x, y, w, h] = this.rectScreen({ x1: this.tpCell.x, z1: this.tpCell.z, x2: this.tpCell.x, z2: this.tpCell.z })
    ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2
    ctx.strokeRect(x - 1, y - 1, Math.max(w, 4) + 2, Math.max(h, 4) + 2)
  }

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback for file:// pages where the async clipboard API may be unavailable
      const ta = Object.assign(document.createElement('textarea'), { value: text })
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    }
  }

  // ---------- dialogs ----------
  dialog(title, body, buttons) {
    const dlg = $('#dialog')
    dlg.querySelector('h2').textContent = title
    dlg.querySelector('.body').innerHTML = body
    dlg.querySelector('.buttons').innerHTML = buttons.map(([v, label, primary]) => `<button type="button" value="${v}" class="${primary ? 'primary' : ''}">${label}</button>`).join('')
    dlg.showModal()
    dlg.querySelector('input, select, .buttons .primary')?.focus()
    const primary = buttons.find(b => b[2])?.[0] ?? 'ok'
    return new Promise(res => {
      const finish = v => { dlg.close(); res(v) }
      dlg.querySelector('.buttons').onclick = e => { const b = e.target.closest('button'); if (b) finish(b.value) }
      dlg.querySelector('form').onsubmit = e => { e.preventDefault(); finish(primary) } // Enter in a field
      dlg.oncancel = e => { e.preventDefault(); finish('cancel') } // Esc
    })
  }

  async ask(title, label, value = '') {
    const r = await this.dialog(title, `<label class="field"><span>${esc(label)}</span><input name="answer" value="${esc(value)}"></label>`, [['cancel', 'Abbrechen'], ['ok', 'OK', true]])
    return r === 'ok' ? $('#dialog form').answer.value.trim() : null
  }

  async confirm(title, text) {
    return (await this.dialog(title, `<p>${esc(text)}</p>`, [['cancel', 'Abbrechen'], ['ok', 'OK', true]])) === 'ok'
  }

  toast(msg, ms = 3000) {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms)
  }

  scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      store.save('autosave', { project: this.project.toJSON(), view: this.view, settings: this.settings, hotbar: this.hotbar, currentY: this.currentY })
    }, 1500)
  }

  // ---------- input ----------
  updateStatus() {
    const h = this.hover
    if (!h) return
    const parts = [
      `X <b>${h.x}</b> Z <b>${h.z}</b> Y <b>${this.currentY}</b>`,
      `Chunk <b>${h.x >> 4}, ${h.z >> 4}</b>`,
      `Region <b>r.${h.x >> 9}.${h.z >> 9}</b>`,
      `Nether <b>${Math.floor(h.x / 8)}, ${Math.floor(h.z / 8)}</b>`,
    ]
    const m = this.map.seed !== null ? this.map.sample(h.x, h.z) : null
    if (m) parts.push(`Biom <b>${BIOMES[m.biome][1]}</b>`, `Gelände <b>~Y ${Math.round(m.height)}</b>`)
    if (this.seedValue !== null && this.settings.slime) parts.push(this.slime.get(this.seedValue, h.x >> 4, h.z >> 4) ? '<b style="color:#8f8">Slime-Chunk</b>' : 'kein Slime-Chunk')
    const v = this.project.get(this.currentY, h.x, h.z)
    if (v) parts.push(`Block <b>${esc(blockInfo(this.project.palette[v]).name)}</b>`)
    parts.push(`Zoom <b>${this.view.scale >= 1 ? this.view.scale.toFixed(1) + ' px/Block' : '1:' + Math.round(1 / this.view.scale)}</b>`)
    $('#status').innerHTML = parts.join('<span>·</span>')
  }

  bindCanvas() {
    const c = this.canvas
    c.addEventListener('contextmenu', e => e.preventDefault())
    c.addEventListener('pointerdown', e => {
      this.closeTpMenu()
      c.setPointerCapture(e.pointerId)
      const cell = this.cellAt(e)
      if (e.button === 1 || this.spaceDown || this.tool.pan) {
        this.panning = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz }
        c.style.cursor = 'grabbing'
        return
      }
      if (e.button !== 0 && e.button !== 2) return
      this.hover = cell // so the first move away from here counts
      if (this.tool.id !== 'select' && this.tool.id !== 'wand') this.dropFloating()
      this.active = this.tool
      this.lastCell = cell
      this.tool.down?.(this, cell, e)
      this.redraw()
    })
    c.addEventListener('pointermove', e => {
      const cell = this.cellAt(e)
      if (this.panning) {
        this.view.cx = this.panning.cx - (e.clientX - this.panning.x) / this.view.scale
        this.view.cz = this.panning.cz - (e.clientY - this.panning.y) / this.view.scale
        this.redraw()
        return
      }
      const moved = !this.hover || this.hover.x !== cell.x || this.hover.z !== cell.z
      this.hover = cell
      if (moved) {
        if (this.active) this.active.move?.(this, cell, e)
        this.updateStatus()
        this.redraw()
      }
    })
    const end = e => {
      if (this.panning) {
        this.panning = null
        c.style.cursor = this.tool.pan ? 'grab' : 'crosshair'
        this.scheduleSave()
        return
      }
      if (this.active) {
        this.active.up?.(this, this.cellAt(e), e)
        this.active = null
        this.redraw()
      }
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    c.addEventListener('pointerleave', () => { if (!this.active) { this.hover = null; this.redraw() } })
    c.addEventListener('wheel', e => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      const mx = e.clientX - r.left - this.W / 2, mz = e.clientY - r.top - this.H / 2
      const wx = mx / this.view.scale + this.view.cx, wz = mz / this.view.scale + this.view.cz
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
      const factor = Math.exp(-Math.sign(delta) * Math.min(Math.abs(delta), 120) * 0.0022)
      this.view.scale = Math.min(64, Math.max(0.02, this.view.scale * factor))
      this.view.cx = wx - mx / this.view.scale
      this.view.cz = wz - mz / this.view.scale
      this.updateStatus()
      this.redraw()
      this.scheduleSave()
    }, { passive: false })
  }

  bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.target.closest?.('input, select, textarea, dialog')) return
      if (this.view3d.isOpen) { if (e.key === 'Escape') this.view3d.close(); return }
      const k = e.key.toLowerCase()
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo() }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redoAction() }
        else if (k === 'c') { e.preventDefault(); this.copy(false) }
        else if (k === 'x') { e.preventDefault(); this.copy(true) }
        else if (k === 'v') { e.preventDefault(); this.paste() }
        else if (k === 's') { e.preventDefault(); this.action('save') }
        else if (k === 'a') { e.preventDefault(); const b = this.project.layer(this.currentY)?.bounds(); if (b) { this.setTool('select'); this.selection = b; this.redraw() } }
        return
      }
      if (e.key === ' ') { this.spaceDown = true; this.canvas.style.cursor = 'grab'; e.preventDefault(); return }
      if (e.key === 'PageUp') { e.preventDefault(); return this.setY(this.currentY + 1) }
      if (e.key === 'PageDown') { e.preventDefault(); return this.setY(this.currentY - 1) }
      if (e.key === 'Escape' && this.tpCell) { this.closeTpMenu(); return }
      if (e.key === 'Escape') { this.dropFloating(); this.selection = null; this.tool.a = null; this.active = null; this.redraw(); return }
      if (e.key === 'Enter') { this.dropFloating(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelection(); return }
      if (/^[1-9]$/.test(e.key)) { this.slot = +e.key - 1; this.refreshBlock(); return }
      if (k === '[') { this.options.brush = Math.max(1, this.options.brush - 1); this.buildOptions(); this.redraw(); return }
      if (k === ']') { this.options.brush = Math.min(15, this.options.brush + 1); this.buildOptions(); this.redraw(); return }
      if (k === 'x') { this.options.symX = !this.options.symX; this.buildOptions(); this.redraw(); return }
      if (k === 'z') { this.options.symZ = !this.options.symZ; this.buildOptions(); this.redraw(); return }
      if (k === 's' && this.hover) { this.options.sym = { ...this.hover }; this.buildOptions(); this.redraw(); return }
      if (k === 'q') { this.transformFloating('rotate'); return }
      // Shift+R: Ctrl+H would open the browser history
      if (k === 'r' && e.shiftKey) { this.action('replace'); return }
      const tool = TOOLS.find(t => t.key === k)
      if (tool) this.setTool(tool.id)
    })
    window.addEventListener('keyup', e => {
      if (e.key === ' ') { this.spaceDown = false; this.canvas.style.cursor = this.tool.pan ? 'grab' : 'crosshair' }
    })
  }
}

window.app = new App()
window.app.init()
