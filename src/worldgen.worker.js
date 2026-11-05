// Web worker: computes biome map tiles for a seed
import data from '../data/worldgen-26.3.json'
import { BIOME_INDEX } from './biomes.js'
import { createSampler, loadWorldgenData, parseSeed } from './worldgen-core.js'

export const TILE_SAMPLES = 64
export const tileSize = lod => 256 * 4 ** lod

loadWorldgenData(data)
let sampler = null
let seedKey = null

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'seed') {
    seedKey = msg.seed
    sampler = createSampler(parseSeed(msg.seed))
    return
  }
  if (msg.type === 'tile' && sampler && msg.seed === seedKey) {
    const { lod, tx, tz } = msg
    const size = tileSize(lod), step = size / TILE_SAMPLES
    const x0 = tx * size, z0 = tz * size
    const biomes = new Uint8Array(TILE_SAMPLES * TILE_SAMPLES)
    for (let j = 0; j < TILE_SAMPLES; j++) {
      for (let i = 0; i < TILE_SAMPLES; i++) {
        const biome = sampler.sampleBiome(x0 + i * step + (step >> 1), z0 + j * step + (step >> 1))
        biomes[j * TILE_SAMPLES + i] = BIOME_INDEX.get(biome) ?? 0
      }
    }
    // Height on a coarser 17x17 grid, bilinearly upsampled (surface estimate is the slow part)
    const H = 17, hs = size / (H - 1), grid = new Float32Array(H * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < H; i++) grid[j * H + i] = sampler.sampleHeight(x0 + i * hs, z0 + j * hs)
    const heights = new Float32Array(TILE_SAMPLES * TILE_SAMPLES)
    for (let j = 0; j < TILE_SAMPLES; j++) {
      const fz = (j + 0.5) * step / hs, gz = Math.min(H - 2, fz | 0), tz2 = fz - gz
      for (let i = 0; i < TILE_SAMPLES; i++) {
        const fx = (i + 0.5) * step / hs, gx = Math.min(H - 2, fx | 0), tx2 = fx - gx
        const a = grid[gz * H + gx], b = grid[gz * H + gx + 1], c = grid[(gz + 1) * H + gx], d = grid[(gz + 1) * H + gx + 1]
        heights[j * TILE_SAMPLES + i] = (a * (1 - tx2) + b * tx2) * (1 - tz2) + (c * (1 - tx2) + d * tx2) * tz2
      }
    }
    self.postMessage({ type: 'tile', key: msg.key, seed: msg.seed, biomes, heights }, [biomes.buffer, heights.buffer])
  }
}
