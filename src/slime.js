// Java Edition slime chunk check (same as the game: java.util.Random seeded per chunk)
const MASK = (1n << 48n) - 1n
const MULT = 0x5DEECE66Dn

export function isSlimeChunk(seed, cx, cz) {
  const a = BigInt(Math.imul(Math.imul(cx, cx), 0x4c1906))
  const b = BigInt(Math.imul(cx, 0x5ac0db))
  const c = BigInt(Math.imul(cz, cz)) * 0x4307a7n
  const d = BigInt(Math.imul(cz, 0x5f24f))
  let s = (BigInt.asIntN(64, seed + a + b + c + d) ^ 0x3ad8025fn)
  s = (s ^ MULT) & MASK
  for (;;) {
    s = (s * MULT + 0xBn) & MASK
    const bits = Number(s >> 17n)
    const val = bits % 10
    if (bits - val + 9 < 2 ** 31) return val === 0
  }
}

// Cache per seed since BigInt math is slow-ish
export class SlimeCache {
  constructor() { this.seed = null; this.map = new Map() }
  get(seed, cx, cz) {
    if (seed !== this.seed) { this.seed = seed; this.map.clear() }
    const k = cx + ',' + cz
    let v = this.map.get(k)
    if (v === undefined) {
      v = isSlimeChunk(seed, cx, cz)
      if (this.map.size > 200000) this.map.clear()
      this.map.set(k, v)
    }
    return v
  }
}
