// Block palette: [id, German name, top-down color, alpha]
const DYES = [
  ['white', 'Weiß'], ['light_gray', 'Hellgrau'], ['gray', 'Grau'], ['black', 'Schwarz'], ['brown', 'Braun'], ['red', 'Rot'],
  ['orange', 'Orange'], ['yellow', 'Gelb'], ['lime', 'Hellgrün'], ['green', 'Grün'], ['cyan', 'Türkis'], ['light_blue', 'Hellblau'],
  ['blue', 'Blau'], ['purple', 'Violett'], ['magenta', 'Magenta'], ['pink', 'Rosa'],
]
const CONCRETE = ['#cfd5d6', '#7d7d73', '#373a3e', '#080a0f', '#603c20', '#8e2121', '#e06101', '#f1af15', '#5ea918', '#495b24', '#157788', '#2489c7', '#2c2e8f', '#64209c', '#a9309f', '#d5658f']
const WOOL = ['#e9ecec', '#8e8e86', '#3e4447', '#141519', '#724728', '#a12722', '#f07613', '#f8c527', '#70b919', '#546d1b', '#158991', '#3aafd9', '#35399d', '#792aac', '#bd44b3', '#ed8dac']
const TERRACOTTA = ['#d1b2a1', '#876a61', '#392a23', '#251610', '#4d3323', '#8f3d2e', '#a15325', '#ba8523', '#677534', '#4c532a', '#565b5b', '#716c89', '#4a3b5b', '#764656', '#95586c', '#a14e4e']
const dyed = (suffix, label, colors, alpha = 1) => DYES.map(([d, n], i) => [`${d}_${suffix}`, `${label}: ${n}`, colors[i], alpha])

export const BLOCK_GROUPS = [
  ['Stein', [
    ['stone', 'Stein', '#7d7d7d'], ['cobblestone', 'Bruchstein', '#6a6a6a'], ['stone_bricks', 'Steinziegel', '#7a7a7a'],
    ['mossy_stone_bricks', 'Bemooste Steinziegel', '#6b7a5e'], ['cracked_stone_bricks', 'Rissige Steinziegel', '#767676'], ['chiseled_stone_bricks', 'Gemeißelte Steinziegel', '#787878'],
    ['smooth_stone', 'Glatter Stein', '#a0a0a0'], ['andesite', 'Andesit', '#888888'], ['polished_andesite', 'Polierter Andesit', '#848685'],
    ['diorite', 'Diorit', '#bcbcbc'], ['polished_diorite', 'Polierter Diorit', '#c6c6c8'], ['granite', 'Granit', '#956755'],
    ['polished_granite', 'Polierter Granit', '#9a6a59'], ['deepslate', 'Tiefenschiefer', '#505053'], ['cobbled_deepslate', 'Tiefenschiefer-Bruchstein', '#4a4a4f'],
    ['polished_deepslate', 'Polierter Tiefenschiefer', '#484849'], ['deepslate_bricks', 'Tiefenschieferziegel', '#464646'], ['deepslate_tiles', 'Tiefenschieferfliesen', '#363637'],
    ['tuff', 'Tuffstein', '#6c6d66'], ['polished_tuff', 'Polierter Tuffstein', '#626862'], ['tuff_bricks', 'Tuffsteinziegel', '#62675f'],
    ['calcite', 'Calcit', '#dfe0dc'], ['blackstone', 'Schwarzstein', '#2a2328'], ['polished_blackstone_bricks', 'Polierte Schwarzsteinziegel', '#302a30'],
    ['basalt', 'Basalt', '#505056'], ['sandstone', 'Sandstein', '#d8cb9b'], ['smooth_sandstone', 'Glatter Sandstein', '#e0d6aa'],
    ['cut_sandstone', 'Geschnittener Sandstein', '#d9cc9d'], ['red_sandstone', 'Roter Sandstein', '#ba6621'], ['bricks', 'Ziegelsteine', '#966153'],
    ['mud_bricks', 'Lehmziegel', '#89684f'], ['prismarine', 'Prismarin', '#63a297'], ['prismarine_bricks', 'Prismarinziegel', '#63ab9e'],
    ['dark_prismarine', 'Dunkler Prismarin', '#335b4b'], ['quartz_block', 'Quarzblock', '#ebe5de'], ['smooth_quartz', 'Glatter Quarz', '#ece6df'],
    ['quartz_bricks', 'Quarzziegel', '#e6e0d6'], ['quartz_pillar', 'Quarzsäule', '#ebe6e0'], ['nether_bricks', 'Netherziegel', '#2c161a'],
    ['red_nether_bricks', 'Rote Netherziegel', '#450709'], ['end_stone_bricks', 'Endsteinziegel', '#dae0a2'], ['purpur_block', 'Purpurblock', '#a97ea9'],
    ['obsidian', 'Obsidian', '#0f0a18'], ['crying_obsidian', 'Weinender Obsidian', '#200a3c'],
  ]],
  ['Holz', [
    ['oak_planks', 'Eichenbretter', '#a2834f'], ['spruce_planks', 'Fichtenbretter', '#735531'], ['birch_planks', 'Birkenbretter', '#c0af79'],
    ['jungle_planks', 'Tropenholzbretter', '#a07351'], ['acacia_planks', 'Akazienbretter', '#a85a32'], ['dark_oak_planks', 'Schwarzeichenbretter', '#422b14'],
    ['mangrove_planks', 'Mangrovenbretter', '#773632'], ['cherry_planks', 'Kirschholzbretter', '#e2b2a7'], ['pale_oak_planks', 'Blasseichenbretter', '#e3d9d6'],
    ['bamboo_planks', 'Bambusbretter', '#c4ad57'], ['crimson_planks', 'Karmesinbretter', '#653147'], ['warped_planks', 'Wirrbretter', '#2b6963'],
    ['oak_log', 'Eichenstamm', '#6d5533'], ['spruce_log', 'Fichtenstamm', '#3b2510'], ['birch_log', 'Birkenstamm', '#d8d7d2'],
    ['dark_oak_log', 'Schwarzeichenstamm', '#3c2e1a'], ['stripped_oak_log', 'Entrindeter Eichenstamm', '#b29157'], ['stripped_spruce_log', 'Entrindeter Fichtenstamm', '#745a34'],
    ['stripped_dark_oak_log', 'Entrindeter Schwarzeichenstamm', '#493924'], ['oak_stairs', 'Eichentreppe', '#a2834f'], ['spruce_stairs', 'Fichtentreppe', '#735531'],
    ['dark_oak_stairs', 'Schwarzeichentreppe', '#422b14'], ['oak_slab', 'Eichenstufe', '#b09062'], ['spruce_slab', 'Fichtenstufe', '#806040'],
    ['oak_fence', 'Eichenzaun', '#9a7b48'], ['spruce_fence', 'Fichtenzaun', '#6c4f2d'], ['dark_oak_fence', 'Schwarzeichenzaun', '#3e2812'],
    ['oak_trapdoor', 'Eichenfalltür', '#7c6239'], ['spruce_trapdoor', 'Fichtenfalltür', '#674e2f'], ['bookshelf', 'Bücherregal', '#75603a'],
  ]],
  ['Natur', [
    ['grass_block', 'Grasblock', '#5d9a3a'], ['dirt', 'Erde', '#86603f'], ['coarse_dirt', 'Grobe Erde', '#77553b'],
    ['podzol', 'Podsol', '#5c3f18'], ['rooted_dirt', 'Wurzelerde', '#90674c'], ['mud', 'Schlamm', '#3c393d'],
    ['dirt_path', 'Trampelpfad', '#94793f'], ['farmland', 'Ackerboden', '#56351a'], ['moss_block', 'Moosblock', '#596e2d'],
    ['sand', 'Sand', '#dbcfa3'], ['red_sand', 'Roter Sand', '#be6621'], ['gravel', 'Kies', '#83807e'],
    ['clay', 'Ton', '#a0a6b3'], ['snow_block', 'Schneeblock', '#f9fefe'], ['ice', 'Eis', '#91b7fd', 0.8],
    ['packed_ice', 'Packeis', '#8db4fa'], ['blue_ice', 'Blaueis', '#74a8fd'], ['water', 'Wasser', '#3f76e4', 0.75],
    ['lava', 'Lava', '#d4600e'], ['oak_leaves', 'Eichenlaub', '#4b7a2a'], ['spruce_leaves', 'Fichtennadeln', '#3d5e3d'],
    ['hay_block', 'Heuballen', '#a68b0c'], ['pumpkin', 'Kürbis', '#c6761e'], ['melon', 'Melone', '#6f9122'],
    ['cactus', 'Kaktus', '#4f7a25'], ['sugar_cane', 'Zuckerrohr', '#94c065'], ['wheat', 'Weizen', '#c5ae4e'],
    ['kelp', 'Seetang', '#57822e'], ['bamboo', 'Bambus', '#5d8f1f'], ['flowering_azalea', 'Blühende Azalee', '#6d7e3c'],
  ]],
  ['Glas', [
    ['glass', 'Glas', '#c2e1e6', 0.45], ['tinted_glass', 'Getöntes Glas', '#2c2730', 0.8], ['glass_pane', 'Glasscheibe', '#c2e1e6', 0.35],
    ...dyed('stained_glass', 'Glas', WOOL, 0.55),
  ]],
  ['Beton', dyed('concrete', 'Beton', CONCRETE)],
  ['Wolle', dyed('wool', 'Wolle', WOOL)],
  ['Terrakotta', [['terracotta', 'Terrakotta', '#985e43'], ...dyed('terracotta', 'Terrakotta', TERRACOTTA)]],
  ['Technik', [
    ['redstone_wire', 'Redstone', '#b01a0a'], ['redstone_block', 'Redstoneblock', '#af1905'], ['repeater', 'Verstärker', '#9f9792'],
    ['comparator', 'Komparator', '#a59f9b'], ['observer', 'Beobachter', '#636363'], ['piston', 'Kolben', '#9c8a65'],
    ['sticky_piston', 'Klebriger Kolben', '#7a9a5b'], ['hopper', 'Trichter', '#444444'], ['chest', 'Truhe', '#a26b23'],
    ['trapped_chest', 'Redstone-Truhe', '#a56226'], ['barrel', 'Fass', '#86643b'], ['dropper', 'Spender', '#6b6b6b'],
    ['dispenser', 'Werfer', '#6e6e6e'], ['crafter', 'Crafter', '#6e5c55'], ['rail', 'Schiene', '#7d6e55'],
    ['powered_rail', 'Antriebsschiene', '#9a7b3a'], ['detector_rail', 'Sensorschiene', '#7b6a5a'], ['crafting_table', 'Werkbank', '#7c5a35'],
    ['furnace', 'Ofen', '#6f6f6f'], ['blast_furnace', 'Schmelzofen', '#525152'], ['smoker', 'Räucherofen', '#57493a'],
    ['ender_chest', 'Endertruhe', '#1b2b2c'], ['shulker_box', 'Shulkerkiste', '#8a5f8a'], ['target', 'Zielscheibe', '#e2aa9e'],
    ['note_block', 'Notenblock', '#5a3c2a'], ['slime_block', 'Schleimblock', '#6fc05b', 0.85], ['honey_block', 'Honigblock', '#fbbc39', 0.85],
    ['tnt', 'TNT', '#db441a'], ['lever', 'Hebel', '#7d6c51'], ['stone_button', 'Steinknopf', '#8a8a8a'],
    ['iron_trapdoor', 'Eisenfalltür', '#c8c8c8'], ['ladder', 'Leiter', '#7f6439'], ['scaffolding', 'Gerüst', '#b8935a'],
    ['composter', 'Komposter', '#6f4b25'], ['brewing_stand', 'Braustand', '#77685a'], ['enchanting_table', 'Zaubertisch', '#3b1c2d'],
    ['anvil', 'Amboss', '#444444'], ['lectern', 'Lesepult', '#ac8853'], ['beacon', 'Leuchtfeuer', '#75e1d7'],
  ]],
  ['Licht', [
    ['torch', 'Fackel', '#ffd85b'], ['lantern', 'Laterne', '#d9a64a'], ['soul_lantern', 'Seelenlaterne', '#51c5c9'],
    ['glowstone', 'Leuchtstein', '#fbda74'], ['sea_lantern', 'Seelaterne', '#acc8be'], ['shroomlight', 'Pilzlicht', '#f19a52'],
    ['ochre_froglight', 'Ockerfroschlicht', '#f5e3a4'], ['pearlescent_froglight', 'Perlmutt-Froschlicht', '#ece0e8'], ['verdant_froglight', 'Grünes Froschlicht', '#e1efd9'],
    ['end_rod', 'Endstab', '#e8dfd6'], ['redstone_lamp', 'Redstone-Lampe', '#8d5a2f'], ['jack_o_lantern', 'Kürbislaterne', '#e19b2c'],
  ]],
  ['Metall & Erz', [
    ['iron_block', 'Eisenblock', '#dcdcdc'], ['gold_block', 'Goldblock', '#f6d03e'], ['diamond_block', 'Diamantblock', '#62ede4'],
    ['emerald_block', 'Smaragdblock', '#2ad057'], ['netherite_block', 'Netheritblock', '#433d40'], ['lapis_block', 'Lapisblock', '#1f43a4'],
    ['coal_block', 'Kohleblock', '#101010'], ['copper_block', 'Kupferblock', '#c06c50'], ['cut_copper', 'Geschnittenes Kupfer', '#bf6a50'],
    ['exposed_copper', 'Angelaufenes Kupfer', '#a17e68'], ['weathered_copper', 'Verwittertes Kupfer', '#6c9e6b'], ['oxidized_copper', 'Oxidiertes Kupfer', '#52a284'],
    ['amethyst_block', 'Amethystblock', '#8562bf'], ['raw_iron_block', 'Roheisenblock', '#a68769'], ['iron_bars', 'Eisengitter', '#8c8f8c'],
  ]],
]

// Flat list of known blocks
export const BLOCKS = new Map()
for (const [group, list] of BLOCK_GROUPS) {
  for (const [id, name, color, alpha = 1] of list) BLOCKS.set('minecraft:' + id, { id: 'minecraft:' + id, name, color, alpha, group })
}

// Blöcke aus dem Spiel (MCPainter-Mod, /api/blocks): Modpack-Blöcke mit Namen, Kartenfarbe und Form.
// Die feste Liste oben bleibt für die Browser-Version und als sortierte Vanilla-Gruppen zuerst.
const GAME_SHAPES = new Map()
let gameGroups = []

export function registerGameBlocks(list) {
  const groups = new Map()
  for (const b of list) {
    if (b.box) GAME_SHAPES.set(b.id, { box: b.box, full: !!b.full })
    if (!b.item) continue // nur Blöcke, die man auch als Gegenstand hat
    let info = BLOCKS.get(b.id)
    if (!info) {
      const color = b.color ?? hashColor(b.id)
      info = { id: b.id, name: b.name, color, alpha: b.transparent && /glass|ice|pane|leaves/.test(b.id) ? 0.55 : 1, group: b.mod }
      BLOCKS.set(b.id, info)
      const g = b.mod === 'Minecraft' ? 'Minecraft (weitere)' : b.mod
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g).push([b.id, info.name, info.color, info.alpha])
    }
  }
  // Vanilla-Rest zuerst, dann Mods alphabetisch
  gameGroups = [...groups].sort(([a], [b]) => (a.startsWith('Minecraft') ? -1 : b.startsWith('Minecraft') ? 1 : a.localeCompare(b, 'de')))
  infoCache.clear()
}

// Gruppen für die Palette: [Gruppe, [[volle ID, Name, Farbe, Deckkraft]], Mod-Gruppe?]
export function paletteGroups() {
  return [
    ...BLOCK_GROUPS.map(([g, list]) => [g, list.map(([id, name, color, alpha = 1]) => ['minecraft:' + id, name, color, alpha]), false]),
    ...gameGroups.map(([g, list]) => [g, list, true]),
  ]
}

function hashColor(id) {
  let h = 0
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return `hsl(${(h >>> 0) % 360} 45% 50%)`
}

// Normalise user input like "oak_stairs[facing=east]" -> "minecraft:oak_stairs[facing=east]"
export function normalizeBlockId(input) {
  const s = String(input).trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  if (!/^([a-z0-9_.-]+:)?[a-z0-9_./-]+(\[[a-z0-9_]+=[a-z0-9_]+(,[a-z0-9_]+=[a-z0-9_]+)*\])?$/.test(s)) return null
  return s.split('[')[0].includes(':') ? s : 'minecraft:' + s
}

export const baseId = id => id.split('[')[0]

// Variants like oak_stairs, white_carpet or stripped_spruce_wood take the color of their base material
const SHAPE_SUFFIXES = ['_stairs', '_slab', '_wall', '_fence_gate', '_fence', '_door', '_trapdoor', '_pressure_plate', '_button',
  '_wall_hanging_sign', '_hanging_sign', '_wall_sign', '_sign', '_pane', '_carpet', '_wood', '_hyphae', '_bed', '_wall_banner', '_banner', '_candle', '_shulker_box']
const KEYWORDS = [
  ['glass', 'glass'], ['deepslate', 'deepslate'], ['blackstone', 'blackstone'], ['copper', 'copper_block'], ['quartz', 'quartz_block'],
  ['sandstone', 'sandstone'], ['prismarine', 'prismarine'], ['purpur', 'purpur_block'], ['nether_brick', 'nether_bricks'], ['mud_brick', 'mud_bricks'],
  ['end_stone', 'end_stone_bricks'], ['brick', 'bricks'], ['tuff', 'tuff'], ['cobblestone', 'cobblestone'], ['andesite', 'andesite'],
  ['diorite', 'diorite'], ['granite', 'granite'], ['stone', 'stone'], ['dark_oak', 'dark_oak_planks'], ['pale_oak', 'pale_oak_planks'],
  ['spruce', 'spruce_planks'], ['birch', 'birch_planks'], ['jungle', 'jungle_planks'], ['acacia', 'acacia_planks'], ['mangrove', 'mangrove_planks'],
  ['cherry', 'cherry_planks'], ['bamboo', 'bamboo_planks'], ['crimson', 'crimson_planks'], ['warped', 'warped_planks'], ['oak', 'oak_planks'],
  ['iron', 'iron_block'], ['gold', 'gold_block'], ['leaves', 'oak_leaves'], ['wool', 'white_wool'], ['concrete', 'gray_concrete'],
  ['terracotta', 'terracotta'], ['ice', 'ice'], ['snow', 'snow_block'], ['sand', 'sand'], ['dirt', 'dirt'], ['grass', 'grass_block'],
  ['moss', 'moss_block'], ['redstone', 'redstone_block'], ['rail', 'rail'], ['torch', 'torch'], ['lantern', 'lantern'], ['lamp', 'redstone_lamp'],
  ['water', 'water'], ['lava', 'lava'], ['amethyst', 'amethyst_block'], ['basalt', 'basalt'], ['obsidian', 'obsidian'],
]

function materialOf(base) {
  const name = base.replace(/^minecraft:/, '').replace(/^(waxed_|infested_)/, '')
  const tries = [name]
  for (const s of SHAPE_SUFFIXES) {
    if (!name.endsWith(s)) continue
    const m = name.slice(0, -s.length)
    tries.push(m, m + 's', m + '_planks', m + '_block', m + '_wool', m + '_log')
  }
  for (const t of tries) if (BLOCKS.has('minecraft:' + t)) return BLOCKS.get('minecraft:' + t)
  for (const [kw, id] of KEYWORDS) if (name.includes(kw)) return BLOCKS.get('minecraft:' + id)
  return null
}

const infoCache = new Map()

export function blockInfo(id) {
  let info = infoCache.get(id)
  if (info) return info
  const base = baseId(id)
  const known = BLOCKS.get(id) ?? BLOCKS.get(base)
  if (known) {
    info = known.id === id ? known : { ...known, id, name: known.name + ' ' + id.slice(id.indexOf('[')) }
  } else {
    const mat = materialOf(base)
    if (mat) {
      info = { id, name: id.replace('minecraft:', ''), color: mat.color, alpha: mat.alpha, group: 'Eigene' }
    } else {
      // Unknown block: stable color from its name
      info = { id, name: id.replace('minecraft:', ''), color: hashColor(base), alpha: 1, group: 'Eigene' }
    }
  }
  infoCache.set(id, info)
  return info
}

// 3D box of a block in unit coordinates [x0, y0, z0, x1, y1, z1]; full = hides neighbour faces
export function blockShape(id) {
  // Mod-Blöcke: Form aus dem Spiel (Kollisionsbox) statt Namensregeln
  const game = GAME_SHAPES.get(baseId(id))
  if (game && !baseId(id).startsWith('minecraft:')) return { box: game.box, full: game.full }
  const base = baseId(id).replace(/^minecraft:/, '')
  const props = id.includes('[') ? id.slice(id.indexOf('[') + 1, -1) : ''
  if (base.endsWith('_slab')) {
    if (props.includes('type=double')) return { box: [0, 0, 0, 1, 1, 1], full: true }
    return { box: props.includes('type=top') ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], full: false }
  }
  if (/(carpet|rail|redstone_wire|pressure_plate|moss_carpet|lily_pad)$/.test(base)) return { box: [0, 0, 0, 1, 1 / 16, 1], full: false }
  if (base === 'snow') return { box: [0, 0, 0, 1, 2 / 16, 1], full: false }
  if (base.endsWith('_trapdoor')) return { box: props.includes('half=top') ? [0, 13 / 16, 0, 1, 1, 1] : [0, 0, 0, 1, 3 / 16, 1], full: false }
  if (/(torch|lantern|lever|_button|end_rod|candle|flower_pot|repeater|comparator|sapling|_tulip|poppy|dandelion|_flower|fern|short_grass|bush)$/.test(base)) {
    if (base === 'repeater' || base === 'comparator') return { box: [0, 0, 0, 1, 2 / 16, 1], full: false }
    return { box: [0.35, 0, 0.35, 0.65, 0.6, 0.65], full: false }
  }
  if (/(_fence|_wall|_pane|iron_bars|chain|ladder)$/.test(base) || base === 'glass_pane') return { box: [0.375, 0, 0.375, 0.625, 1, 0.625], full: false }
  return { box: [0, 0, 0, 1, 1, 1], full: true }
}
