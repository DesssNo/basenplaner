// Erzeugt mod/src/test/resources/basenplaner-export.schem mit dem echten Exporter der Web-App.
// Der Mod-Test (SpongeSchematicTest) liest diese Datei; bei Änderungen am Exporter neu erzeugen:
//   node tools/gen-mod-fixture.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { Project } from '../src/model.js'
import { exportSponge } from '../src/export.js'

const p = new Project()
// über eine Chunkgrenze (x -2..17) und in negative Koordinaten, zwei Ebenen
for (let x = -2; x <= 17; x++) p.set(64, x, -1, p.blockIndex('minecraft:stone_bricks'))
p.set(65, 0, -1, p.blockIndex('minecraft:oak_stairs[facing=east,half=bottom]'))
p.set(65, 17, -1, p.blockIndex('minecraft:glass'))
// viele Palettenbefehle -> Indizes > 127 brauchen zwei Varint-Bytes
for (let i = 0; i < 150; i++) p.set(66, -2 + (i % 20), -1 - Math.floor(i / 20), p.blockIndex(`minecraft:test_block_${i}`))

const { bytes, size, origin } = exportSponge(p, { dataVersion: 3955, name: 'fixture' })
mkdirSync('mod/src/test/resources', { recursive: true })
writeFileSync('mod/src/test/resources/basenplaner-export.schem', bytes)
console.log(`basenplaner-export.schem: ${size.join('x')} bei ${origin.join(' ')}, ${bytes.length} Bytes`)
