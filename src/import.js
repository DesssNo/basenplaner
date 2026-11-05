// Schematic import: Sponge .schem (v1-v3), Litematica .litematic, vanilla structure .nbt
import { NbtFile } from 'deepslate/nbt'

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void'])
const MAX_VOLUME = 80_000_000

// Block state compound {Name, Properties} -> "minecraft:x[a=b,...]"
function stateId(c) {
  const name = c.getString('Name')
  if (!c.has('Properties')) return name
  const props = c.getCompound('Properties')
  const parts = [...props.keys()].map(k => `${k}=${props.getString(k)}`)
  return parts.length ? `${name}[${parts.join(',')}]` : name
}

function checkSize(W, H, L) {
  if (!(W > 0 && H > 0 && L > 0)) throw new Error('Die Datei enthält keine Blöcke.')
  if (W * H * L > MAX_VOLUME) throw new Error(`Zu groß zum Importieren (${W}×${H}×${L}).`)
}

function readSponge(root) {
  if (root.has('Schematic')) root = root.getCompound('Schematic')
  const version = root.getNumber('Version')
  const W = root.getNumber('Width') & 0xffff, H = root.getNumber('Height') & 0xffff, L = root.getNumber('Length') & 0xffff
  checkSize(W, H, L)
  const blocks = version >= 3 ? root.getCompound('Blocks') : root
  const palC = blocks.getCompound('Palette')
  if (!palC.size) throw new Error('Altes MCEdit-Format (.schematic mit Zahlen-IDs) wird nicht unterstützt. Speichere die Datei in WorldEdit neu als .schem.')
  // Sponge index 0 can be a real block, so shift by one and keep 0 for "empty"
  const palette = ['minecraft:air']
  palC.forEach((name, idx) => { palette[idx.getAsNumber() + 1] = name })
  const bytes = blocks.getByteArray(version >= 3 ? 'Data' : 'BlockData').getItems()
  const data = new Uint32Array(W * H * L)
  for (let i = 0, p = 0; i < data.length && p < bytes.length; i++) {
    let v = 0, shift = 0, b
    do { b = bytes[p++].getAsNumber() & 0xff; v |= (b & 0x7f) << shift; shift += 7 } while (b & 0x80)
    data[i] = v + 1
  }
  const off = root.has('Offset') ? root.getIntArray('Offset').getItems().map(n => n.getAsNumber()) : null
  return { W, H, L, palette, data, origin: off }
}

function readLitematic(root) {
  const regions = root.getCompound('Regions')
  const parts = []
  regions.forEach((name, reg) => {
    const pos = reg.getCompound('Position'), size = reg.getCompound('Size')
    const s = ['x', 'y', 'z'].map(k => size.getNumber(k)), p = ['x', 'y', 'z'].map(k => pos.getNumber(k))
    // Negative sizes mean the region extends towards negative coordinates
    const min = p.map((v, i) => (s[i] < 0 ? v + s[i] + 1 : v))
    parts.push({ reg, size: s.map(Math.abs), min })
  })
  if (!parts.length) throw new Error('Die Litematic enthält keine Regionen.')
  const lo = [0, 1, 2].map(i => Math.min(...parts.map(r => r.min[i])))
  const hi = [0, 1, 2].map(i => Math.max(...parts.map(r => r.min[i] + r.size[i] - 1)))
  const [W, H, L] = [0, 1, 2].map(i => hi[i] - lo[i] + 1)
  checkSize(W, H, L)
  const palette = ['minecraft:air'], index = new Map([['minecraft:air', 0]])
  const data = new Uint32Array(W * H * L)
  for (const { reg, size: [sx, sy, sz], min } of parts) {
    const local = reg.getList('BlockStatePalette').getItems().map(c => {
      const id = stateId(c)
      if (!index.has(id)) { index.set(id, palette.length); palette.push(id) }
      return index.get(id)
    })
    const bits = Math.max(2, 32 - Math.clz32(local.length - 1))
    // Longs as a little-endian stream of 32-bit words: [lo0, hi0, lo1, hi1, ...]
    const longs = reg.getLongArray('BlockStates').getItems()
    const words = new Uint32Array(longs.length * 2)
    longs.forEach((l, i) => { const [h, w] = l.getAsPair(); words[i * 2] = w; words[i * 2 + 1] = h })
    const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const i = (y * sz + z) * sx + x
          const bit = i * bits, w = bit >>> 5, off = bit & 31
          let v = words[w] >>> off
          if (off + bits > 32) v |= words[w + 1] << (32 - off)
          v &= mask
          data[((min[1] - lo[1] + y) * L + (min[2] - lo[2] + z)) * W + (min[0] - lo[0] + x)] = local[v] ?? 0
        }
      }
    }
  }
  return { W, H, L, palette, data, origin: null }
}

function readStructure(root) {
  const [W, H, L] = root.getList('size').getItems().map(n => n.getAsNumber())
  checkSize(W, H, L)
  const palList = root.has('palette') ? root.getList('palette') : root.getList('palettes').getItems()[0]
  const palette = palList.getItems().map(stateId)
  const data = new Uint32Array(W * H * L)
  // Index 0 must mean "empty", so shift the palette by one
  for (const b of root.getList('blocks').getItems()) {
    const [x, y, z] = b.getList('pos').getItems().map(n => n.getAsNumber())
    data[(y * L + z) * W + x] = b.getNumber('state') + 1
  }
  return { W, H, L, palette: ['minecraft:air', ...palette], data, origin: null }
}

// Returns { format, W, H, L, palette, data (Uint32Array palette indices, 0/air = empty), origin, count, kinds }
export function readSchematic(bytes) {
  let file
  try {
    file = NbtFile.read(bytes)
  } catch {
    throw new Error('Keine gültige NBT-Datei (erwartet .schem, .litematic oder .nbt).')
  }
  const root = file.root
  let result, format
  if (root.has('Regions')) { result = readLitematic(root); format = 'Litematica' }
  else if (root.has('Schematic') || root.has('Palette') || root.has('BlockData')) { result = readSponge(root); format = 'WorldEdit (.schem)' }
  else if (root.has('Blocks') && root.has('Materials')) throw new Error('Altes MCEdit-Format (.schematic) wird nicht unterstützt. Speichere die Datei in WorldEdit neu als .schem.')
  else if (root.has('blocks') && root.has('size')) { result = readStructure(root); format = 'Strukturdatei (.nbt)' }
  else throw new Error('Unbekanntes Schematic-Format.')
  const airIdx = new Set(result.palette.map((id, i) => (AIR.has(id.split('[')[0]) ? i : -1)))
  let count = 0
  const used = new Set()
  for (let i = 0; i < result.data.length; i++) {
    if (airIdx.has(result.data[i])) result.data[i] = 0
    else if (result.data[i]) { count++; used.add(result.data[i]) }
  }
  return { ...result, format, count, kinds: used.size }
}
