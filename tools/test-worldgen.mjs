import fs from 'fs'
import { loadWorldgenData, createSampler, parseSeed } from '../src/worldgen-core.js'
loadWorldgenData(JSON.parse(fs.readFileSync('data/worldgen-26.3.json', 'utf8')))
const seed = parseSeed(process.argv[2] ?? '12345')
const s = createSampler(seed)
console.log('seed', seed)
let t = performance.now(); const counts = {}
for (let x = -1024; x < 1024; x += 16) for (let z = -1024; z < 1024; z += 16) { const r = s.sample(x, z); counts[r.biome] = (counts[r.biome] || 0) + 1 }
console.log('16384 samples in', Math.round(performance.now() - t), 'ms')
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12))
for (const [x, z] of [[0, 0], [500, -300], [-800, 900]]) console.log(x, z, s.sample(x, z))
