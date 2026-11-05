// Java Long parsing / String.hashCode, like the "Seed for the world generator" field
export function parseSeed(input) {
  const s = String(input ?? '').trim()
  if (s === '') return 0n
  if (/^[+-]?\d+$/.test(s)) {
    const v = BigInt(s)
    if (v >= -(2n ** 63n) && v < 2n ** 63n && v !== 0n) return v
  }
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return BigInt(h)
}
