// Port of net.minecraft.world.level.biome.OverworldBiomeBuilder (surface + underground parameter list)
// Usage: node gen_params.js [26.3|1.19] [out.json]
const f = Math.fround;
const q = x => Math.trunc(f(f(x) * 10000));
const span = (a, b) => typeof a === 'object' ? { min: a.min, max: b.max } : { min: q(a), max: q(b) };
const point = a => span(a, a);

const T = (s) => s.split(' ').map(x => x === '-' ? null : x.toLowerCase());
const TABLES = {
  '26.3': {
    OCEANS: [T('DEEP_FROZEN_OCEAN DEEP_COLD_OCEAN DEEP_OCEAN DEEP_LUKEWARM_OCEAN WARM_OCEAN'), T('FROZEN_OCEAN COLD_OCEAN OCEAN LUKEWARM_OCEAN WARM_OCEAN')],
    MIDDLE: [T('SNOWY_PLAINS SNOWY_PLAINS SNOWY_PLAINS SNOWY_TAIGA TAIGA'), T('PLAINS PLAINS FOREST TAIGA OLD_GROWTH_SPRUCE_TAIGA'), T('FLOWER_FOREST PLAINS FOREST BIRCH_FOREST DARK_FOREST'), T('SAVANNA SAVANNA FOREST JUNGLE JUNGLE'), T('DESERT DESERT DESERT DESERT DESERT')],
    MIDDLE_VARIANT: [T('ICE_SPIKES - SNOWY_TAIGA - -'), T('DAPPLED_FOREST - - - OLD_GROWTH_PINE_TAIGA'), T('SUNFLOWER_PLAINS - - OLD_GROWTH_BIRCH_FOREST -'), T('- - PLAINS SPARSE_JUNGLE BAMBOO_JUNGLE'), T('- - - - -')],
    PLATEAU: [T('SNOWY_PLAINS SNOWY_PLAINS SNOWY_PLAINS SNOWY_TAIGA SNOWY_TAIGA'), T('MEADOW MEADOW FOREST TAIGA OLD_GROWTH_SPRUCE_TAIGA'), T('MEADOW MEADOW MEADOW MEADOW PALE_GARDEN'), T('SAVANNA_PLATEAU SAVANNA_PLATEAU FOREST FOREST JUNGLE'), T('BADLANDS BADLANDS BADLANDS WOODED_BADLANDS WOODED_BADLANDS')],
    PLATEAU_VARIANT: [T('ICE_SPIKES - - - -'), T('CHERRY_GROVE - MEADOW MEADOW OLD_GROWTH_PINE_TAIGA'), T('CHERRY_GROVE CHERRY_GROVE FOREST BIRCH_FOREST -'), T('- - - - -'), T('ERODED_BADLANDS ERODED_BADLANDS - - -')],
    SHATTERED: [T('WINDSWEPT_GRAVELLY_HILLS WINDSWEPT_GRAVELLY_HILLS WINDSWEPT_HILLS WINDSWEPT_FOREST WINDSWEPT_FOREST'), T('WINDSWEPT_GRAVELLY_HILLS WINDSWEPT_GRAVELLY_HILLS WINDSWEPT_HILLS WINDSWEPT_FOREST WINDSWEPT_FOREST'), T('WINDSWEPT_HILLS WINDSWEPT_HILLS WINDSWEPT_HILLS WINDSWEPT_FOREST WINDSWEPT_FOREST'), T('- - - - -'), T('- - - - -')],
    sulfur: true,
  },
};
// 1.19.2 tables, only used to validate this port against the official 1.19.2 report
TABLES['1.19'] = {
  ...TABLES['26.3'],
  MIDDLE_VARIANT: [T('ICE_SPIKES - SNOWY_TAIGA - -'), T('- - - - OLD_GROWTH_PINE_TAIGA'), T('SUNFLOWER_PLAINS - - OLD_GROWTH_BIRCH_FOREST -'), T('- - PLAINS SPARSE_JUNGLE BAMBOO_JUNGLE'), T('- - - - -')],
  PLATEAU: [T('SNOWY_PLAINS SNOWY_PLAINS SNOWY_PLAINS SNOWY_TAIGA SNOWY_TAIGA'), T('MEADOW MEADOW FOREST TAIGA OLD_GROWTH_SPRUCE_TAIGA'), T('MEADOW MEADOW MEADOW MEADOW DARK_FOREST'), T('SAVANNA_PLATEAU SAVANNA_PLATEAU FOREST FOREST JUNGLE'), T('BADLANDS BADLANDS BADLANDS WOODED_BADLANDS WOODED_BADLANDS')],
  PLATEAU_VARIANT: [T('ICE_SPIKES - - - -'), T('- - MEADOW MEADOW OLD_GROWTH_PINE_TAIGA'), T('- - FOREST BIRCH_FOREST -'), T('- - - - -'), T('ERODED_BADLANDS ERODED_BADLANDS - - -')],
  sulfur: false,
};

function build(tables) {
  const out = [];
  const FULL = span(-1, 1);
  const temperatures = [span(-1, -0.45), span(-0.45, -0.15), span(-0.15, 0.2), span(0.2, 0.55), span(0.55, 1)];
  const humidities = [span(-1, -0.35), span(-0.35, -0.1), span(-0.1, 0.1), span(0.1, 0.3), span(0.3, 1)];
  const erosions = [span(-1, -0.78), span(-0.78, -0.375), span(-0.375, -0.2225), span(-0.2225, 0.05), span(0.05, 0.45), span(0.45, 0.55), span(0.55, 1)];
  const FROZEN = temperatures[0], UNFROZEN = span(temperatures[1], temperatures[4]);
  const mushroomC = span(-1.2, -1.05), deepOceanC = span(-1.05, -0.455), oceanC = span(-0.455, -0.19);
  const coastC = span(-0.19, -0.11), inlandC = span(-0.11, 0.55), nearC = span(-0.11, 0.03), midC = span(0.03, 0.3), farC = span(0.3, 1);
  const { OCEANS, MIDDLE, MIDDLE_VARIANT, PLATEAU, PLATEAU_VARIANT, SHATTERED } = tables;

  const push = (t, h, c, e, d, w, o, biome) => out.push({ biome: 'minecraft:' + biome, t, h, c, e, d, w, o });
  const surface = (t, h, c, e, w, o, b) => { push(t, h, c, e, point(0), w, o, b); push(t, h, c, e, point(1), w, o, b); };
  const underground = (t, h, c, e, w, o, b) => push(t, h, c, e, span(0.2, 0.9), w, o, b);
  const bottom = (t, h, c, e, w, o, b) => push(t, h, c, e, point(1.1), w, o, b);

  const pickMiddle = (i, j, w) => w.max < 0 ? MIDDLE[i][j] : (MIDDLE_VARIANT[i][j] ?? MIDDLE[i][j]);
  const pickBadlands = (j, w) => j < 2 ? (w.max < 0 ? 'badlands' : 'eroded_badlands') : j < 3 ? 'badlands' : 'wooded_badlands';
  const pickMiddleOrBadlands = (i, j, w) => i === 4 ? pickBadlands(j, w) : pickMiddle(i, j, w);
  const pickPlateau = (i, j, w) => (w.max >= 0 && PLATEAU_VARIANT[i][j]) || PLATEAU[i][j];
  const pickSlope = (i, j, w) => i >= 3 ? pickPlateau(i, j, w) : j <= 1 ? 'snowy_slopes' : 'grove';
  const pickMiddleOrBadlandsOrSlope = (i, j, w) => i === 0 ? pickSlope(i, j, w) : pickMiddleOrBadlands(i, j, w);
  const maybeSavanna = (i, j, w, u) => i > 1 && j < 4 && w.max >= 0 ? 'windswept_savanna' : u;
  const pickBeach = (i) => i === 0 ? 'snowy_beach' : i === 4 ? 'desert' : 'beach';
  const pickShatteredCoast = (i, j, w) => maybeSavanna(i, j, w, w.max >= 0 ? pickMiddle(i, j, w) : pickBeach(i));
  const pickPeak = (i, j, w) => i <= 2 ? (w.max < 0 ? 'jagged_peaks' : 'frozen_peaks') : i === 3 ? 'stony_peaks' : pickBadlands(j, w);
  const pickShattered = (i, j, w) => SHATTERED[i][j] ?? pickMiddle(i, j, w);
  const each = fn => { for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) fn(i, j, temperatures[i], humidities[j]); };

  // addOffCoastBiomes
  surface(FULL, FULL, mushroomC, FULL, FULL, 0, 'mushroom_fields');
  for (let i = 0; i < 5; i++) {
    surface(temperatures[i], FULL, deepOceanC, FULL, FULL, 0, OCEANS[0][i]);
    surface(temperatures[i], FULL, oceanC, FULL, FULL, 0, OCEANS[1][i]);
  }

  const addPeaks = w => each((i, j, t, h) => {
    const middle = pickMiddle(i, j, w), mob = pickMiddleOrBadlands(i, j, w), mobs = pickMiddleOrBadlandsOrSlope(i, j, w);
    const plateau = pickPlateau(i, j, w), shattered = pickShattered(i, j, w), ws = maybeSavanna(i, j, w, shattered), peak = pickPeak(i, j, w);
    surface(t, h, span(coastC, farC), erosions[0], w, 0, peak);
    surface(t, h, span(coastC, nearC), erosions[1], w, 0, mobs);
    surface(t, h, span(midC, farC), erosions[1], w, 0, peak);
    surface(t, h, span(coastC, nearC), span(erosions[2], erosions[3]), w, 0, middle);
    surface(t, h, span(midC, farC), erosions[2], w, 0, plateau);
    surface(t, h, midC, erosions[3], w, 0, mob);
    surface(t, h, farC, erosions[3], w, 0, plateau);
    surface(t, h, span(coastC, farC), erosions[4], w, 0, middle);
    surface(t, h, span(coastC, nearC), erosions[5], w, 0, ws);
    surface(t, h, span(midC, farC), erosions[5], w, 0, shattered);
    surface(t, h, span(coastC, farC), erosions[6], w, 0, middle);
  });
  const addHigh = w => each((i, j, t, h) => {
    const middle = pickMiddle(i, j, w), mob = pickMiddleOrBadlands(i, j, w), mobs = pickMiddleOrBadlandsOrSlope(i, j, w);
    const plateau = pickPlateau(i, j, w), shattered = pickShattered(i, j, w), ws = maybeSavanna(i, j, w, middle);
    const slope = pickSlope(i, j, w), peak = pickPeak(i, j, w);
    surface(t, h, coastC, span(erosions[0], erosions[1]), w, 0, middle);
    surface(t, h, nearC, erosions[0], w, 0, slope);
    surface(t, h, span(midC, farC), erosions[0], w, 0, peak);
    surface(t, h, nearC, erosions[1], w, 0, mobs);
    surface(t, h, span(midC, farC), erosions[1], w, 0, slope);
    surface(t, h, span(coastC, nearC), span(erosions[2], erosions[3]), w, 0, middle);
    surface(t, h, span(midC, farC), erosions[2], w, 0, plateau);
    surface(t, h, midC, erosions[3], w, 0, mob);
    surface(t, h, farC, erosions[3], w, 0, plateau);
    surface(t, h, span(coastC, farC), erosions[4], w, 0, middle);
    surface(t, h, span(coastC, nearC), erosions[5], w, 0, ws);
    surface(t, h, span(midC, farC), erosions[5], w, 0, shattered);
    surface(t, h, span(coastC, farC), erosions[6], w, 0, middle);
  });
  const swamps = (c, w) => {
    surface(span(temperatures[1], temperatures[2]), FULL, c, erosions[6], w, 0, 'swamp');
    surface(span(temperatures[3], temperatures[4]), FULL, c, erosions[6], w, 0, 'mangrove_swamp');
  };
  const addMid = w => {
    surface(FULL, FULL, coastC, span(erosions[0], erosions[2]), w, 0, 'stony_shore');
    swamps(span(nearC, farC), w);
    each((i, j, t, h) => {
      const middle = pickMiddle(i, j, w), mob = pickMiddleOrBadlands(i, j, w), mobs = pickMiddleOrBadlandsOrSlope(i, j, w);
      const shattered = pickShattered(i, j, w), plateau = pickPlateau(i, j, w), beach = pickBeach(i);
      const ws = maybeSavanna(i, j, w, middle), sc = pickShatteredCoast(i, j, w), slope = pickSlope(i, j, w);
      surface(t, h, span(nearC, farC), erosions[0], w, 0, slope);
      surface(t, h, span(nearC, midC), erosions[1], w, 0, mobs);
      surface(t, h, farC, erosions[1], w, 0, i === 0 ? slope : plateau);
      surface(t, h, nearC, erosions[2], w, 0, middle);
      surface(t, h, midC, erosions[2], w, 0, mob);
      surface(t, h, farC, erosions[2], w, 0, plateau);
      surface(t, h, span(coastC, nearC), erosions[3], w, 0, middle);
      surface(t, h, span(midC, farC), erosions[3], w, 0, mob);
      if (w.max < 0) {
        surface(t, h, coastC, erosions[4], w, 0, beach);
        surface(t, h, span(nearC, farC), erosions[4], w, 0, middle);
      } else {
        surface(t, h, span(coastC, farC), erosions[4], w, 0, middle);
      }
      surface(t, h, coastC, erosions[5], w, 0, sc);
      surface(t, h, nearC, erosions[5], w, 0, ws);
      surface(t, h, span(midC, farC), erosions[5], w, 0, shattered);
      surface(t, h, coastC, erosions[6], w, 0, w.max < 0 ? beach : middle);
      if (i === 0) surface(t, h, span(nearC, farC), erosions[6], w, 0, middle);
    });
  };
  const addLow = w => {
    surface(FULL, FULL, coastC, span(erosions[0], erosions[2]), w, 0, 'stony_shore');
    swamps(span(nearC, farC), w);
    each((i, j, t, h) => {
      const middle = pickMiddle(i, j, w), mob = pickMiddleOrBadlands(i, j, w), mobs = pickMiddleOrBadlandsOrSlope(i, j, w);
      const beach = pickBeach(i), ws = maybeSavanna(i, j, w, middle), sc = pickShatteredCoast(i, j, w);
      surface(t, h, nearC, span(erosions[0], erosions[1]), w, 0, mob);
      surface(t, h, span(midC, farC), span(erosions[0], erosions[1]), w, 0, mobs);
      surface(t, h, nearC, span(erosions[2], erosions[3]), w, 0, middle);
      surface(t, h, span(midC, farC), span(erosions[2], erosions[3]), w, 0, mob);
      surface(t, h, coastC, span(erosions[3], erosions[4]), w, 0, beach);
      surface(t, h, span(nearC, farC), erosions[4], w, 0, middle);
      surface(t, h, coastC, erosions[5], w, 0, sc);
      surface(t, h, nearC, erosions[5], w, 0, ws);
      surface(t, h, span(midC, farC), erosions[5], w, 0, middle);
      surface(t, h, coastC, erosions[6], w, 0, beach);
      if (i === 0) surface(t, h, span(nearC, farC), erosions[6], w, 0, middle);
    });
  };
  const addValleys = w => {
    surface(FROZEN, FULL, coastC, span(erosions[0], erosions[1]), w, 0, w.max < 0 ? 'stony_shore' : 'frozen_river');
    surface(UNFROZEN, FULL, coastC, span(erosions[0], erosions[1]), w, 0, w.max < 0 ? 'stony_shore' : 'river');
    surface(FROZEN, FULL, nearC, span(erosions[0], erosions[1]), w, 0, 'frozen_river');
    surface(UNFROZEN, FULL, nearC, span(erosions[0], erosions[1]), w, 0, 'river');
    surface(FROZEN, FULL, span(coastC, farC), span(erosions[2], erosions[5]), w, 0, 'frozen_river');
    surface(UNFROZEN, FULL, span(coastC, farC), span(erosions[2], erosions[5]), w, 0, 'river');
    surface(FROZEN, FULL, coastC, erosions[6], w, 0, 'frozen_river');
    surface(UNFROZEN, FULL, coastC, erosions[6], w, 0, 'river');
    swamps(span(inlandC, farC), w);
    surface(FROZEN, FULL, span(inlandC, farC), erosions[6], w, 0, 'frozen_river');
    each((i, j, t, h) => surface(t, h, span(midC, farC), span(erosions[0], erosions[1]), w, 0, pickMiddleOrBadlands(i, j, w)));
  };

  // addInlandBiomes
  const s = [-1, -0.93333334, -0.7666667, -0.56666666, -0.4, -0.26666668, -0.05, 0.05, 0.26666668, 0.4, 0.56666666, 0.7666667, 0.93333334, 1];
  const fns = [addMid, addHigh, addPeaks, addHigh, addMid, addLow, addValleys, addLow, addMid, addHigh, addPeaks, addHigh, addMid];
  fns.forEach((fn, k) => fn(span(s[k], s[k + 1])));

  // addUndergroundBiomes
  underground(FULL, FULL, span(0.8, 1), FULL, FULL, 0, 'dripstone_caves');
  underground(FULL, span(0.7, 1), FULL, FULL, FULL, 0, 'lush_caves');
  if (tables.sulfur) underground(FULL, FULL, span(coastC, inlandC), span(erosions[5], erosions[6]), span(-1.1, -0.85), 0, 'sulfur_caves');
  bottom(FULL, FULL, FULL, span(erosions[0], erosions[1]), FULL, 0, 'deep_dark');
  return out;
}

const toJson = list => ({
  biomes: list.map(e => {
    const p = r => r.min === r.max ? r.min / 10000 : [r.min / 10000, r.max / 10000];
    return { biome: e.biome, parameters: { temperature: p(e.t), humidity: p(e.h), continentalness: p(e.c), erosion: p(e.e), depth: p(e.d), weirdness: p(e.w), offset: e.o } };
  }),
});

module.exports = { build, TABLES, toJson };
if (require.main === module) {
  const v = process.argv[2] || '26.3';
  const json = toJson(build(TABLES[v]));
  if (process.argv[3]) require('fs').writeFileSync(process.argv[3], JSON.stringify(json));
  else console.log(json.biomes.length + ' entries');
}
