// Schematic export: Sponge .schem (v2, WorldEdit/FAWE/Litematica) and Litematica .litematic (v6)
import { gzip } from 'pako'

// --- Minimal NBT writer ---
const TAG = { byte: 1, short: 2, int: 3, long: 4, string: 8, list: 9, compound: 10, byteArray: 7, intArray: 11, longArray: 12 }
export const nbt = {
  byte: v => ({ t: TAG.byte, v }),
  short: v => ({ t: TAG.short, v }),
  int: v => ({ t: TAG.int, v }),
  long: v => ({ t: TAG.long, v: BigInt(v) }),
  string: v => ({ t: TAG.string, v }),
  byteArray: v => ({ t: TAG.byteArray, v }),
  intArray: v => ({ t: TAG.intArray, v }),
  longArray: v => ({ t: TAG.longArray, v }),
  list: (type, v) => ({ t: TAG.list, type, v }),
  compound: v => ({ t: TAG.compound, v }),
}

class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.view = new DataView(this.buf.buffer); this.p = 0 }
  ensure(n) {
    if (this.p + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.p + n) size *= 2
    const nb = new Uint8Array(size); nb.set(this.buf); this.buf = nb; this.view = new DataView(nb.buffer)
  }
  u8(v) { this.ensure(1); this.view.setInt8(this.p, v); this.p += 1 }
  i16(v) { this.ensure(2); this.view.setInt16(this.p, v); this.p += 2 }
  i32(v) { this.ensure(4); this.view.setInt32(this.p, v); this.p += 4 }
  i64(v) { this.ensure(8); this.view.setBigInt64(this.p, BigInt.asIntN(64, v)); this.p += 8 }
  str(s) { const b = new TextEncoder().encode(s); this.i16(b.length); this.ensure(b.length); this.buf.set(b, this.p); this.p += b.length }
  payload(tag) {
    switch (tag.t) {
      case TAG.byte: return this.u8(tag.v)
      case TAG.short: return this.i16(tag.v)
      case TAG.int: return this.i32(tag.v)
      case TAG.long: return this.i64(tag.v)
      case TAG.string: return this.str(tag.v)
      case TAG.byteArray: this.i32(tag.v.length); this.ensure(tag.v.length); this.buf.set(tag.v, this.p); this.p += tag.v.length; return
      case TAG.intArray: this.i32(tag.v.length); for (const x of tag.v) this.i32(x); return
      case TAG.longArray: this.i32(tag.v.length); for (const x of tag.v) this.i64(x); return
      case TAG.list: this.u8(tag.v.length ? tag.type : TAG.compound); this.i32(tag.v.length); for (const x of tag.v) this.payload(x); return
      case TAG.compound:
        for (const [k, x] of Object.entries(tag.v)) { this.u8(x.t); this.str(k); this.payload(x) }
        return this.u8(0)
    }
  }
}

export function writeNbt(rootName, root) {
  const w = new Writer()
  w.u8(TAG.compound); w.str(rootName); w.payload(root)
  return gzip(w.buf.subarray(0, w.p))
}

// Collect blocks of the whole project into a dense volume
function buildVolume(project) {
  const b = project.bounds()
  if (!b) throw new Error('Der Plan ist leer – setze erst ein paar Blöcke.')
  const W = b.x2 - b.x1 + 1, H = b.y2 - b.y1 + 1, L = b.z2 - b.z1 + 1
  const volume = W * H * L
  if (volume > 150_000_000) throw new Error(`Zu groß für eine Schematic (${W}×${H}×${L}). Exportiere lieber Teilbereiche.`)
  const palette = ['minecraft:air'], map = new Map([[0, 0]])
  const data = new Uint32Array(volume)
  let total = 0
  for (const layer of project.layers.values()) {
    if (!layer.visible) continue
    const y = layer.y - b.y1
    for (const [x, z, v] of layer.cells()) {
      let p = map.get(v)
      if (p === undefined) { p = palette.length; palette.push(project.palette[v]); map.set(v, p) }
      data[(y * L + (z - b.z1)) * W + (x - b.x1)] = p
      total++
    }
  }
  return { b, W, H, L, palette, data, total }
}

export function exportSponge(project, { dataVersion, name }) {
  const { b, W, H, L, palette, data } = buildVolume(project)
  if (W > 65535 || H > 65535 || L > 65535) throw new Error('Eine Seite ist länger als 65535 Blöcke.')
  const bytes = []
  for (let i = 0; i < data.length; i++) {
    let v = data[i]
    while (v & ~0x7f) { bytes.push((v & 0x7f) | 0x80); v >>>= 7 }
    bytes.push(v)
  }
  const pal = {}
  palette.forEach((id, i) => { pal[id] = nbt.int(i) })
  const root = nbt.compound({
    Version: nbt.int(2),
    DataVersion: nbt.int(dataVersion),
    Width: nbt.short(W << 16 >> 16), Height: nbt.short(H << 16 >> 16), Length: nbt.short(L << 16 >> 16),
    Offset: nbt.intArray([b.x1, b.y1, b.z1]),
    PaletteMax: nbt.int(palette.length),
    Palette: nbt.compound(pal),
    BlockData: nbt.byteArray(Uint8Array.from(bytes)),
    BlockEntities: nbt.list(TAG.compound, []),
    Metadata: nbt.compound({
      Name: nbt.string(name), Author: nbt.string('Basenplaner'), Date: nbt.long(Date.now()),
      WEOffsetX: nbt.int(0), WEOffsetY: nbt.int(0), WEOffsetZ: nbt.int(0),
    }),
  })
  return { bytes: writeNbt('Schematic', root), size: [W, H, L], origin: [b.x1, b.y1, b.z1] }
}

export function exportLitematic(project, { dataVersion, name }) {
  const { b, W, H, L, palette, data, total } = buildVolume(project)
  const bits = Math.max(2, 32 - Math.clz32(palette.length - 1))
  const longs = new BigUint64Array(Math.ceil(data.length * bits / 64))
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (!v) continue
    const bit = i * bits, start = bit >>> 6, off = bit & 63
    longs[start] |= BigInt(v) << BigInt(off)
    if (off + bits > 64) longs[start + 1] |= BigInt(v) >> BigInt(64 - off)
  }
  const pal = palette.map(id => {
    const [, base, props] = id.match(/^([^[]+)(?:\[(.*)\])?$/)
    const c = { Name: nbt.string(base) }
    if (props) c.Properties = nbt.compound(Object.fromEntries(props.split(',').map(kv => { const [k, v] = kv.split('='); return [k, nbt.string(v)] })))
    return nbt.compound(c)
  })
  const xyz = (x, y, z) => nbt.compound({ x: nbt.int(x), y: nbt.int(y), z: nbt.int(z) })
  const now = Date.now()
  const root = nbt.compound({
    MinecraftDataVersion: nbt.int(dataVersion),
    Version: nbt.int(6),
    SubVersion: nbt.int(1),
    Metadata: nbt.compound({
      Name: nbt.string(name), Author: nbt.string('Basenplaner'), Description: nbt.string(`Origin ${b.x1} ${b.y1} ${b.z1}`),
      RegionCount: nbt.int(1), TotalBlocks: nbt.int(total), TotalVolume: nbt.int(W * H * L),
      EnclosingSize: xyz(W, H, L), TimeCreated: nbt.long(now), TimeModified: nbt.long(now),
    }),
    Regions: nbt.compound({
      [name]: nbt.compound({
        Position: xyz(0, 0, 0), Size: xyz(W, H, L),
        BlockStatePalette: nbt.list(TAG.compound, pal),
        BlockStates: nbt.longArray(Array.from(longs, x => BigInt.asIntN(64, x))),
        TileEntities: nbt.list(TAG.compound, []), Entities: nbt.list(TAG.compound, []),
        PendingBlockTicks: nbt.list(TAG.compound, []), PendingFluidTicks: nbt.list(TAG.compound, []),
      }),
    }),
  })
  return { bytes: writeNbt('', root), size: [W, H, L], origin: [b.x1, b.y1, b.z1] }
}

export function download(bytes, filename, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
