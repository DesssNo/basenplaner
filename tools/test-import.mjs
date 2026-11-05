import { Project } from '../src/model.js'
import { exportLitematic, exportSponge, nbt, writeNbt } from '../src/export.js'
import { readSchematic } from '../src/import.js'
import { blockInfo, blockShape } from '../src/blocks.js'

const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg); if (!ok) process.exitCode = 1 }
const at = (s, x, y, z) => s.palette[s.data[(y * s.L + z) * s.W + x]]

// 1) Round trip of our own exports (many palette entries -> multi-byte varints, bits > 8)
const p = new Project()
for (let i = 0; i < 300; i++) p.set(64 + (i % 3), 10 + (i % 50), -20 + Math.floor(i / 50), p.blockIndex(`minecraft:test_block_${i}`))
for (const [name, fn] of [['schem', exportSponge], ['litematic', exportLitematic]]) {
  const r = readSchematic(fn(p, { dataVersion: 5023, name: 't' }).bytes)
  let ok = r.count === 300
  for (let i = 0; i < 300 && ok; i++) ok = at(r, i % 50, i % 3, Math.floor(i / 50)) === `minecraft:test_block_${i}`
  check(ok, `${name} round trip: ${r.count} blocks, ${r.W}x${r.H}x${r.L}, origin ${r.origin}`)
}

// 2) Sponge v3 where palette index 0 is a real block (not air)
const v3 = writeNbt('', nbt.compound({ Schematic: nbt.compound({
  Version: nbt.int(3), DataVersion: nbt.int(3700), Width: nbt.short(2), Height: nbt.short(1), Length: nbt.short(1),
  Blocks: nbt.compound({ Palette: nbt.compound({ 'minecraft:stone': nbt.int(0), 'minecraft:air': nbt.int(1) }), Data: nbt.byteArray(Uint8Array.from([0, 1])), BlockEntities: nbt.list(10, []) }),
}) }))
const s3 = readSchematic(v3)
check(at(s3, 0, 0, 0) === 'minecraft:stone' && s3.count === 1, `sponge v3 index-0 block: ${at(s3, 0, 0, 0)}, count ${s3.count}`)

// 3) Vanilla structure .nbt
const pos = (x, y, z) => nbt.list(3, [nbt.int(x), nbt.int(y), nbt.int(z)])
const st = writeNbt('', nbt.compound({
  size: pos(3, 2, 2), DataVersion: nbt.int(3700),
  palette: nbt.list(10, [nbt.compound({ Name: nbt.string('minecraft:air') }), nbt.compound({ Name: nbt.string('minecraft:oak_stairs'), Properties: nbt.compound({ facing: nbt.string('north') }) })]),
  blocks: nbt.list(10, [nbt.compound({ pos: pos(2, 1, 1), state: nbt.int(1) }), nbt.compound({ pos: pos(0, 0, 0), state: nbt.int(0) })]),
  entities: nbt.list(10, []),
}))
const sn = readSchematic(st)
check(at(sn, 2, 1, 1) === 'minecraft:oak_stairs[facing=north]' && sn.count === 1, `structure nbt: ${at(sn, 2, 1, 1)}, count ${sn.count}`)

// 4) Litematic with two regions, one with negative size
const xyz = (x, y, z) => nbt.compound({ x: nbt.int(x), y: nbt.int(y), z: nbt.int(z) })
const region = (pos, size, palette, values) => {
  const bits = Math.max(2, 32 - Math.clz32(palette.length - 1))
  const longs = new BigUint64Array(Math.ceil(values.length * bits / 64))
  values.forEach((v, i) => { const b = i * bits, s0 = b >> 6, o = b & 63; longs[s0] |= BigInt(v) << BigInt(o); if (o + bits > 64) longs[s0 + 1] |= BigInt(v) >> BigInt(64 - o) })
  return nbt.compound({ Position: pos, Size: size, BlockStatePalette: nbt.list(10, palette.map(n => nbt.compound({ Name: nbt.string(n) }))), BlockStates: nbt.longArray([...longs].map(x => BigInt.asIntN(64, x))) })
}
const lit = writeNbt('', nbt.compound({ Version: nbt.int(6), Regions: nbt.compound({
  a: region(xyz(0, 0, 0), xyz(2, 1, 1), ['minecraft:air', 'minecraft:dirt'], [1, 0]),
  b: region(xyz(5, 0, 0), xyz(-2, 1, 1), ['minecraft:air', 'minecraft:glass'], [0, 1]), // covers x 4..5
}) }))
const sl = readSchematic(lit)
check(sl.W === 6 && at(sl, 0, 0, 0) === 'minecraft:dirt' && at(sl, 5, 0, 0) === 'minecraft:glass' && sl.count === 2, `litematic multi-region: ${sl.W}x${sl.H}x${sl.L}, ${at(sl, 0, 0, 0)}, ${at(sl, 5, 0, 0)}`)

// 5) Bad input
try { readSchematic(new Uint8Array([1, 2, 3])); check(false, 'garbage rejected') } catch (e) { check(true, 'garbage rejected: ' + e.message) }

// 6) Colors and shapes for imported variants
check(blockInfo('minecraft:spruce_stairs[facing=east]').color === blockInfo('minecraft:spruce_planks').color, 'spruce_stairs gets spruce color')
check(blockInfo('minecraft:white_carpet').color === blockInfo('minecraft:white_wool').color, 'white_carpet gets wool color')
check(blockShape('minecraft:stone_slab[type=bottom]').box[4] === 0.5 && !blockShape('minecraft:stone_slab[type=bottom]').full, 'bottom slab is half height')
check(blockShape('minecraft:stone_slab[type=double]').full, 'double slab is full')
check(blockShape('minecraft:torch').box[0] > 0, 'torch is small')
