import { NbtFile } from 'deepslate'
import { Project } from '../src/model.js'
import { exportLitematic, exportSponge } from '../src/export.js'
import { isSlimeChunk } from '../src/slime.js'

const p = new Project()
const stone = p.blockIndex('minecraft:stone_bricks'), stairs = p.blockIndex('minecraft:oak_stairs[facing=east,half=bottom]')
p.set(64, 100, -50, stone); p.set(64, 102, -48, stairs); p.set(66, 101, -49, stone)
for (let i = 0; i < 40; i++) p.set(70, 100 + i, -50, p.blockIndex('minecraft:' + ['glass','stone','dirt','sand','oak_planks'][i % 5] + (i > 4 ? '' : '')))
const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg); if (!ok) process.exitCode = 1 }

// Sponge
const s = exportSponge(p, { dataVersion: 5023, name: 'test' })
const sf = NbtFile.read(s.bytes).root
const W = sf.getNumber('Width'), H = sf.getNumber('Height'), L = sf.getNumber('Length')
check(W === 40 && H === 7 && L === 3, `schem size ${W}x${H}x${L}`)
check(JSON.stringify(sf.getIntArray('Offset').toString()) !== '', 'schem offset ' + sf.getIntArray('Offset').toString())
const pal = {}; sf.getCompound('Palette').forEach((k, v) => { pal[v.getAsNumber()] = k })
const data = sf.getByteArray('BlockData').getItems().map(b => b.getAsNumber() & 0xff)
check(data.length === W * H * L, 'schem blockdata length (all palette ids < 128 so 1 byte each)')
const at = (x, y, z) => pal[data[(y * L + z) * W + x]]
check(at(0, 0, 0) === 'minecraft:stone_bricks', 'schem block at origin = ' + at(0, 0, 0))
check(at(2, 0, 2) === 'minecraft:oak_stairs[facing=east,half=bottom]', 'schem stairs = ' + at(2, 0, 2))
check(at(1, 2, 1) === 'minecraft:stone_bricks', 'schem upper block = ' + at(1, 2, 1))
check(at(1, 0, 1) === 'minecraft:air', 'schem air = ' + at(1, 0, 1))

// Litematic
const l = exportLitematic(p, { dataVersion: 5023, name: 'test' })
const lf = NbtFile.read(l.bytes).root
const reg = lf.getCompound('Regions').getCompound('test')
const size = reg.getCompound('Size'), sx = size.getNumber('x'), sy = size.getNumber('y'), sz = size.getNumber('z')
const lpal = reg.getList('BlockStatePalette').getItems().map(c => c.getString('Name') + (c.has('Properties') ? JSON.stringify(Object.fromEntries([...c.getCompound('Properties').keys()].map(k => [k, c.getCompound('Properties').getString(k)]))) : ''))
const longs = reg.getLongArray('BlockStates').getItems().map(x => BigInt.asUintN(64, BigInt(x.getAsPair ? (BigInt(x.getAsPair()[0]) << 32n) | BigInt.asUintN(32, BigInt(x.getAsPair()[1])) : x.getAsNumber())))
const bits = Math.max(2, 32 - Math.clz32(lpal.length - 1))
const get = i => { const b = i * bits, s0 = b >> 6, off = b & 63; let v = longs[s0] >> BigInt(off); if (off + bits > 64) v |= longs[s0 + 1] << BigInt(64 - off); return Number(v & ((1n << BigInt(bits)) - 1n)) }
const lat = (x, y, z) => lpal[get((y * sz + z) * sx + x)]
check(sx === 40 && sy === 7 && sz === 3, `litematic size ${sx}x${sy}x${sz}, palette ${lpal.length}, bits ${bits}`)
check(lat(0, 0, 0) === 'minecraft:stone_bricks', 'litematic origin = ' + lat(0, 0, 0))
check(lat(2, 0, 2) === 'minecraft:oak_stairs{"facing":"east","half":"bottom"}', 'litematic stairs = ' + lat(2, 0, 2))
check(lat(1, 2, 1) === 'minecraft:stone_bricks', 'litematic upper = ' + lat(1, 2, 1))
let row = ''; for (let x = 0; x < 40; x++) row += lat(x, 6, 0).replace('minecraft:', '')[0]
check(row === 'gsdsogsdsogsdsogsdsogsdsogsdsogsdsogsdso', 'litematic row across long boundaries: ' + row)
check(lf.getNumber('MinecraftDataVersion') === 5023 && lf.getNumber('Version') === 6, 'litematic header')

// Slime chunks: count ratio should be ~10%
let n = 0; for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) if (isSlimeChunk(12345n, x, z)) n++
check(n > 850 && n < 1150, `slime ratio ${n / 100}%`)
