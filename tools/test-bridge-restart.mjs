// Undo überlebt einen Neustart. Zwei Schritte mit Neustart des Entwicklungs-Clients dazwischen:
//   node tools/test-bridge-restart.mjs build    (baut, merkt sich den Vorher-Zustand, beendet das Spiel)
//   node tools/test-bridge-restart.mjs undo     (nach Neustart: rückgängig, vergleicht)
import { readFileSync, writeFileSync } from 'node:fs'
import { Project } from '../src/model.js'
import { exportSponge } from '../src/export.js'

const [port, token] = readFileSync('mod/run/mcpainter-dev.txt', 'utf8').trim().split(' ')
const base = `http://127.0.0.1:${port}`
const state = 'mod/run/mcpainter-restart-test.json'
const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg); if (!ok) process.exitCode = 1 }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = async (method, path, body) => {
  const res = await fetch(base + path, { method, body, headers: { 'X-MCPainter-Token': token } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error ?? ''}`)
  return json
}
const waitJob = async job => {
  for (;;) {
    const j = await api('GET', '/api/build/' + job.jobId)
    if (['done', 'cancelled', 'failed'].includes(j.state)) return j
    await sleep(100)
  }
}
const read = ([x1, y1, z1, x2, y2, z2]) => api('GET', `/api/world/blocks?x1=${x1}&y1=${y1}&z1=${z1}&x2=${x2}&y2=${y2}&z2=${z2}`)
const flat = r => r.data.map(i => r.palette[i])

if (process.argv[2] === 'build') {
  const h = await api('GET', '/api/hello')
  const X = Math.floor(h.player.x) - 10, Y = Math.floor(h.player.y), Z = Math.floor(h.player.z) - 10
  const box = [X, Y - 1, Z, X + 3, Y + 1, Z + 3]
  const before = flat(await read(box))
  const p = new Project()
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) for (let y = 0; y < 3; y++) p.set(Y - 1 + y, X + x, Z + z, p.blockIndex('minecraft:gold_block'))
  const j = await waitJob(await api('POST', '/api/build', exportSponge(p, { dataVersion: 3955, name: 't' }).bytes))
  check(j.state === 'done' && j.placed === 48, `gebaut: ${j.placed} Goldblöcke`)
  writeFileSync(state, JSON.stringify({ box, before }))
} else {
  const { box, before } = JSON.parse(readFileSync(state, 'utf8'))
  const h = await api('GET', '/api/hello')
  check(h.undoCount >= 1, `nach dem Neustart gespeicherte Bauten: ${h.undoCount}`)
  const now = flat(await read(box))
  check(now.every(id => id === 'minecraft:gold_block'), `Bau ist nach dem Neustart noch da (${now.filter(id => id === 'minecraft:gold_block').length} von ${now.length} Gold, Rest: ${[...new Set(now.filter(id => id !== 'minecraft:gold_block'))]})`)
  await waitJob(await api('POST', '/api/undo'))
  const after = flat(await read(box))
  const diff = after.filter((id, i) => id !== before[i]).length
  check(diff === 0, `nach dem Neustart rückgängig gemacht: ${diff} Abweichungen von ${before.length}`)
}
await api('POST', '/api/dev/quit').catch(() => {})
