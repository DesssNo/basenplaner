// Block states mitdrehen/-spiegeln, wenn eine Auswahl gedreht (Q) oder gespiegelt wird.
// kind: 'rotate' = 90° im Uhrzeigersinn (Norden → Osten), 'flipX' = Osten ↔ Westen, 'flipZ' = Norden ↔ Süden
const CW = { north: 'east', east: 'south', south: 'west', west: 'north' }
const FLIP = {
  flipX: { east: 'west', west: 'east' },
  flipZ: { north: 'south', south: 'north' },
}

function dir(d, kind) {
  if (kind === 'rotate') return CW[d] ?? d
  return FLIP[kind][d] ?? d
}

// Schienen: "north_south", "ascending_east", "south_east" …
function railShape(s, kind) {
  if (s.startsWith('ascending_')) return 'ascending_' + dir(s.slice(10), kind)
  const parts = s.split('_')
  if (parts.length !== 2 || !parts.every(p => p in CW)) return s
  const [a, b] = parts.map(p => dir(p, kind))
  // Minecraft schreibt north/south vor east/west: "north_east", "south_west", "north_south", "east_west"
  const order = ['north', 'south', 'east', 'west']
  if (a === b) return s
  return order.indexOf(a) < order.indexOf(b) ? `${a}_${b}` : `${b}_${a}`
}

// Schilder, Banner, Köpfe: rotation 0–15, 0 = Süden, 4 = Westen, 8 = Norden, 12 = Osten
function rotation16(r, kind) {
  if (kind === 'rotate') return (r + 4) % 16
  if (kind === 'flipX') return (16 - r) % 16
  return (24 - r) % 16
}

export function transformState(id, kind) {
  const m = /^([^[]+)\[(.*)\]$/.exec(id)
  if (!m) return id
  const props = m[2].split(',').map(kv => kv.split('='))
  const mirror = kind !== 'rotate'
  const out = props.map(([k, v]) => {
    // Verbindungen (Zäune, Mauern, Scheiben, Ranken, Redstone, Pilzblöcke): Schlüssel tauschen
    if (k in CW) return [dir(k, kind), v]
    if (k === 'facing' || k === 'horizontal_facing') return [k, dir(v, kind)]
    if (k === 'axis' && kind === 'rotate') return [k, v === 'x' ? 'z' : v === 'z' ? 'x' : v]
    if (k === 'rotation' && /^\d+$/.test(v)) return [k, String(rotation16(+v, kind))]
    if (k === 'shape' && /^(ascending_|north_|south_|east_|west_)/.test(v)) return [k, railShape(v, kind)]
    // Treppen-Ecken, Türangeln, Doppeltruhen: links ↔ rechts beim Spiegeln
    if (mirror && k === 'shape') return [k, v.replace(/left|right/, s => (s === 'left' ? 'right' : 'left'))]
    if (mirror && (k === 'hinge' || k === 'type') && (v === 'left' || v === 'right')) return [k, v === 'left' ? 'right' : 'left']
    // Crafter/Jigsaw: "north_up" usw.
    if (k === 'orientation') return [k, v.split('_').map(p => dir(p, kind)).join('_')]
    return [k, v]
  })
  // Schlüssel in fester Reihenfolge, damit gleiche Zustände dieselbe ID ergeben
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return `${m[1]}[${out.map(kv => kv.join('=')).join(',')}]`
}
