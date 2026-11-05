// Seed -> biome + approximate surface height, using deepslate (Minecraft worldgen port)
import { Climate, DensityFunction, Identifier, NoiseGeneratorSettings, RandomState, WorldgenRegistries } from 'deepslate'

export { parseSeed } from './seed.js'

let loaded = null

export function loadWorldgenData(data) {
  if (loaded) return
  for (const [key, value] of Object.entries(data.noise)) {
    WorldgenRegistries.NOISE.register(Identifier.parse(key), WorldgenRegistries.NOISE.parse(value), true)
  }
  for (const [key, value] of Object.entries(data.density_function)) {
    WorldgenRegistries.DENSITY_FUNCTION.register(Identifier.parse(key), WorldgenRegistries.DENSITY_FUNCTION.parse(value), true)
  }
  const overworld = data.noise_settings['minecraft:overworld']
  const biomes = data.biome_parameters.biomes.map(b => [Climate.ParamPoint.fromJson(b.parameters), b.biome])
  loaded = {
    // deepslate reads the pre-26.x key; point it at the real (non-interpolated) surface estimate
    settings: NoiseGeneratorSettings.fromJson({ ...overworld, noise_router: { ...overworld.noise_router, preliminary_surface_level: 'minecraft:overworld/preliminary_surface_level' } }),
    // Surface biomes only (depth 0); underground entries would win under mountains at a fixed Y
    surfaceParams: new Climate.Parameters(biomes.filter(([p]) => p.depth.min === 0 && p.depth.max === 0).map(([p, id]) => [p, () => id])),
  }
}

export function createSampler(seed) {
  const { settings, surfaceParams } = loaded
  const randomState = new RandomState(settings, seed)
  const r = randomState.router
  const surface = r.chunkSurfaceLevel
  return {
    // Block coords. Climate noises ignore Y except depth, which is fixed to the surface (0).
    sampleBiome(x, z) {
      const ctx = DensityFunction.context(x, 64, z)
      const target = Climate.target(r.temperature.compute(ctx), r.vegetation.compute(ctx), r.continents.compute(ctx), r.erosion.compute(ctx), 0, r.ridges.compute(ctx))
      return surfaceParams.find(target).replace('minecraft:', '')
    },
    // Approximate terrain height (Minecraft's own preliminary surface estimate, 8-block steps)
    sampleHeight(x, z) {
      return surface.compute(DensityFunction.context(x, 0, z))
    },
  }
}
