// Blockzustände beim Drehen (Q) und Spiegeln einer Auswahl
import { transformState } from '../src/blockstate.js'

const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg); if (!ok) process.exitCode = 1 }
const eq = (id, kind, want) => {
  const got = transformState(id, kind)
  check(got === want, `${kind} ${id} → ${got}${got === want ? '' : ` (erwartet ${want})`}`)
}
const times = (id, kind, n) => { for (let i = 0; i < n; i++) id = transformState(id, kind); return id }

eq('minecraft:oak_stairs[facing=north,half=bottom,shape=straight]', 'rotate', 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]')
eq('minecraft:oak_stairs[facing=west,half=top,shape=inner_left]', 'rotate', 'minecraft:oak_stairs[facing=north,half=top,shape=inner_left]')
eq('minecraft:oak_stairs[facing=east,half=bottom,shape=outer_left]', 'flipX', 'minecraft:oak_stairs[facing=west,half=bottom,shape=outer_right]')
eq('minecraft:oak_stairs[facing=east,half=bottom,shape=inner_right]', 'flipZ', 'minecraft:oak_stairs[facing=east,half=bottom,shape=inner_left]')
eq('minecraft:oak_log[axis=x]', 'rotate', 'minecraft:oak_log[axis=z]')
eq('minecraft:oak_log[axis=y]', 'rotate', 'minecraft:oak_log[axis=y]')
eq('minecraft:oak_log[axis=x]', 'flipX', 'minecraft:oak_log[axis=x]')
eq('minecraft:oak_sign[rotation=0,waterlogged=false]', 'rotate', 'minecraft:oak_sign[rotation=4,waterlogged=false]')
eq('minecraft:oak_sign[rotation=4,waterlogged=false]', 'flipX', 'minecraft:oak_sign[rotation=12,waterlogged=false]')
eq('minecraft:oak_sign[rotation=0,waterlogged=false]', 'flipZ', 'minecraft:oak_sign[rotation=8,waterlogged=false]')
eq('minecraft:oak_fence[east=false,north=true,south=false,waterlogged=false,west=true]', 'rotate',
  'minecraft:oak_fence[east=true,north=true,south=false,waterlogged=false,west=false]')
eq('minecraft:cobblestone_wall[east=tall,north=none,south=low,up=true,waterlogged=false,west=none]', 'flipX',
  'minecraft:cobblestone_wall[east=none,north=none,south=low,up=true,waterlogged=false,west=tall]')
eq('minecraft:oak_door[facing=north,half=lower,hinge=left,open=false,powered=false]', 'flipX',
  'minecraft:oak_door[facing=north,half=lower,hinge=right,open=false,powered=false]')
eq('minecraft:chest[facing=south,type=left,waterlogged=false]', 'flipZ', 'minecraft:chest[facing=north,type=right,waterlogged=false]')
eq('minecraft:rail[shape=north_east,waterlogged=false]', 'rotate', 'minecraft:rail[shape=south_east,waterlogged=false]')
eq('minecraft:rail[shape=ascending_north,waterlogged=false]', 'flipZ', 'minecraft:rail[shape=ascending_south,waterlogged=false]')
eq('minecraft:rail[shape=north_south,waterlogged=false]', 'rotate', 'minecraft:rail[shape=east_west,waterlogged=false]')
eq('minecraft:hopper[enabled=true,facing=down]', 'rotate', 'minecraft:hopper[enabled=true,facing=down]')
eq('minecraft:stone', 'rotate', 'minecraft:stone')
eq('minecraft:oak_slab[type=bottom,waterlogged=false]', 'flipX', 'minecraft:oak_slab[type=bottom,waterlogged=false]')

// Palette-Blöcke ohne Zustand: Minecrafts Standardrichtung wird angenommen und mitgedreht
eq('minecraft:oak_stairs', 'rotate', 'minecraft:oak_stairs[facing=east]')
eq('minecraft:oak_stairs', 'flipZ', 'minecraft:oak_stairs[facing=south]')
eq('minecraft:oak_stairs[half=top]', 'rotate', 'minecraft:oak_stairs[facing=east,half=top]')
eq('minecraft:chest', 'rotate', 'minecraft:chest[facing=east]')
eq('minecraft:observer', 'rotate', 'minecraft:observer[facing=west]')
eq('minecraft:oak_sign', 'rotate', 'minecraft:oak_sign[rotation=4]')
eq('minecraft:oak_wall_sign', 'rotate', 'minecraft:oak_wall_sign[facing=east]')
eq('minecraft:oak_trapdoor', 'flipX', 'minecraft:oak_trapdoor[facing=north]')
eq('minecraft:pumpkin', 'rotate', 'minecraft:pumpkin')
eq('minecraft:stone_bricks', 'rotate', 'minecraft:stone_bricks')
eq('minecraft:oak_log', 'rotate', 'minecraft:oak_log')
check(times('minecraft:oak_stairs', 'rotate', 4) === 'minecraft:oak_stairs[facing=north]', '4× drehen ohne Zustand ergibt wieder Norden')

const s = 'minecraft:oak_stairs[facing=north,half=bottom,shape=outer_left]'
check(times(s, 'rotate', 4) === s, '4× drehen ergibt wieder den Ausgangszustand')
check(times(s, 'flipX', 2) === s && times(s, 'flipZ', 2) === s, '2× spiegeln ergibt wieder den Ausgangszustand')
const sign = 'minecraft:oak_sign[rotation=3,waterlogged=false]'
check(times(sign, 'rotate', 4) === sign && times(sign, 'flipX', 2) === sign, 'Schild: 4× drehen / 2× spiegeln ist neutral')
