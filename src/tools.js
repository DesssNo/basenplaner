// Drawing tools (Photoshop-style). Each tool gets the app and cell coords {x, z}.

export function* line(x0, z0, x1, z1) {
  const dx = Math.abs(x1 - x0), dz = -Math.abs(z1 - z0)
  const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1
  let err = dx + dz
  for (;;) {
    yield [x0, z0]
    if (x0 === x1 && z0 === z1) return
    const e2 = 2 * err
    if (e2 >= dz) { err += dz; x0 += sx }
    if (e2 <= dx) { err += dx; z0 += sz }
  }
}

export function rectCells(a, b, filled) {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), z1 = Math.min(a.z, b.z), z2 = Math.max(a.z, b.z)
  const out = []
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      if (filled || x === x1 || x === x2 || z === z1 || z === z2) out.push([x, z])
    }
  }
  return out
}

export function ellipseCells(a, b, filled) {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), z1 = Math.min(a.z, b.z), z2 = Math.max(a.z, b.z)
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, rx = (x2 - x1 + 1) / 2, rz = (z2 - z1 + 1) / 2
  const inside = (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1.0
  const out = []
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      if (!inside(x, z)) continue
      if (filled || !inside(x + 1, z) || !inside(x - 1, z) || !inside(x, z + 1) || !inside(x, z - 1)) out.push([x, z])
    }
  }
  return out
}

// Constrain end point for Shift (square / circle / 45° line)
function constrain(a, b, e, mode) {
  if (!e.shiftKey) return b
  const dx = b.x - a.x, dz = b.z - a.z
  if (mode === 'line') {
    const adx = Math.abs(dx), adz = Math.abs(dz)
    if (adx > 2 * adz) return { x: b.x, z: a.z }
    if (adz > 2 * adx) return { x: a.x, z: b.z }
    const d = Math.max(adx, adz)
    return { x: a.x + Math.sign(dx) * d, z: a.z + Math.sign(dz) * d }
  }
  const d = Math.max(Math.abs(dx), Math.abs(dz))
  return { x: a.x + (dx < 0 ? -d : d), z: a.z + (dz < 0 ? -d : d) }
}

const brushTool = (id, name, key, erase) => ({
  id, name, key,
  down(app, c, e) {
    this.value = erase || e.button === 2 ? 0 : app.currentValue()
    this.last = c
    app.project.begin()
    app.paint([[c.x, c.z]], this.value)
  },
  move(app, c) {
    if (!this.last) return
    app.paint(line(this.last.x, this.last.z, c.x, c.z), this.value)
    this.last = c
  },
  up(app) {
    this.last = null
    app.project.commit(name)
  },
})

// Tools that preview a shape while dragging and commit on release
const shapeTool = (id, name, key, cells, mode) => ({
  id, name, key,
  down(app, c, e) { this.a = c; this.b = c; this.value = e.button === 2 ? 0 : app.currentValue() },
  move(app, c, e) { if (this.a) { this.b = constrain(this.a, c, e, mode); app.redraw() } },
  up(app) {
    if (!this.a) return
    app.project.begin()
    app.paint(cells(this.a, this.b, app.options.filled), this.value)
    app.project.commit(name)
    this.a = null
  },
  preview(app) { return this.a ? cells(this.a, this.b, app.options.filled) : null },
  info() {
    if (!this.a) return ''
    return `${Math.abs(this.b.x - this.a.x) + 1} × ${Math.abs(this.b.z - this.a.z) + 1}`
  },
})

export const TOOLS = [
  { id: 'hand', name: 'Verschieben der Ansicht', key: 'h', pan: true },
  brushTool('pencil', 'Stift', 'b', false),
  brushTool('eraser', 'Radierer', 'e', true),
  shapeTool('line', 'Linie', 'l', (a, b) => [...line(a.x, a.z, b.x, b.z)], 'line'),
  shapeTool('rect', 'Rechteck', 'r', rectCells, 'box'),
  shapeTool('ellipse', 'Kreis / Ellipse', 'o', ellipseCells, 'box'),
  {
    id: 'fill', name: 'Füllen', key: 'g',
    down(app, c, e) { app.floodFill(c, e.button === 2 ? 0 : app.currentValue()) },
  },
  {
    id: 'select', name: 'Auswahl', key: 'm',
    down(app, c) {
      const f = app.floating
      if (f && c.x >= f.x && c.x < f.x + f.w && c.z >= f.z && c.z < f.z + f.h) {
        this.drag = { x: c.x - f.x, z: c.z - f.z }
        return
      }
      const s = app.selection
      if (!f && s && c.x >= s.x1 && c.x <= s.x2 && c.z >= s.z1 && c.z <= s.z2) {
        app.liftSelection(true)
        this.drag = { x: c.x - app.floating.x, z: c.z - app.floating.z }
        return
      }
      app.dropFloating()
      this.a = c
      app.selection = { x1: c.x, z1: c.z, x2: c.x, z2: c.z }
      app.redraw()
    },
    move(app, c) {
      if (this.drag && app.floating) {
        app.floating.x = c.x - this.drag.x
        app.floating.z = c.z - this.drag.z
        app.redraw()
      } else if (this.a) {
        app.selection = { x1: Math.min(this.a.x, c.x), z1: Math.min(this.a.z, c.z), x2: Math.max(this.a.x, c.x), z2: Math.max(this.a.z, c.z) }
        app.redraw()
      }
    },
    up() { this.drag = null; this.a = null },
    info(app) {
      const s = app.floating ? { x1: app.floating.x, z1: app.floating.z, x2: app.floating.x + app.floating.w - 1, z2: app.floating.z + app.floating.h - 1 } : app.selection
      return s ? `${s.x2 - s.x1 + 1} × ${s.z2 - s.z1 + 1}` : ''
    },
  },
  {
    id: 'picker', name: 'Pipette', key: 'i',
    down(app, c) {
      const v = app.project.get(app.currentY, c.x, c.z)
      if (v) app.selectBlock(app.project.palette[v])
    },
  },
  {
    id: 'measure', name: 'Messen', key: 'u',
    down(app, c) { this.a = c; this.b = c; app.redraw() },
    move(app, c, e) { if (this.a && e.buttons) { this.b = constrain(this.a, c, e, 'line'); app.redraw() } },
    up() {},
    info() {
      if (!this.a) return ''
      const dx = this.b.x - this.a.x, dz = this.b.z - this.a.z
      return `Δx ${dx}, Δz ${dz} · ${Math.hypot(dx, dz).toFixed(1)} Blöcke Luftlinie · Fläche ${Math.abs(dx) + 1} × ${Math.abs(dz) + 1}`
    },
  },
  {
    id: 'zone', name: 'Zone markieren', key: 't',
    down(app, c) { this.a = c; this.b = c },
    move(app, c) { if (this.a) { this.b = c; app.redraw() } },
    up(app) {
      if (!this.a) return
      const a = this.a, b = this.b
      this.a = null
      app.addZone({ x1: Math.min(a.x, b.x), z1: Math.min(a.z, b.z), x2: Math.max(a.x, b.x), z2: Math.max(a.z, b.z) })
    },
    preview() { return null },
    rect() { return this.a ? { x1: Math.min(this.a.x, this.b.x), z1: Math.min(this.a.z, this.b.z), x2: Math.max(this.a.x, this.b.x), z2: Math.max(this.a.z, this.b.z) } : null },
  },
  {
    id: 'teleport', name: 'Teleport-Befehl', key: 'p',
    down(app, c, e) { app.showTpMenu(c, e) },
  },
]
