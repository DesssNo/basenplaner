// Integrationstest gegen die echte Brücke im Entwicklungs-Client:
//   cd mod && gradlew runClient -Pmcpainter.autotest=bridge     (lädt die Testwelt, schreibt run/mcpainter-dev.txt)
//   node tools/test-bridge.mjs                                   (baut, prüft, macht rückgängig, beendet das Spiel)
import { readFileSync } from 'node:fs'
import { Project } from '../src/model.js'
import { exportSponge } from '../src/export.js'

const [port, token] = readFileSync('mod/run/mcpainter-dev.txt', 'utf8').trim().split(' ')
const base = `http://127.0.0.1:${port}`
const check = (ok, msg) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + msg); if (!ok) process.exitCode = 1 }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function api(method, path, body, headers = {}) {
  const res = await fetch(base + path, { method, body, headers: { 'X-MCPainter-Token': token, ...headers } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error ?? ''}`)
  return json
}
let builds = 0 // Bauten, die etwas verändert haben (nur die haben Undo-Daten)
async function waitJob(job) {
  for (let i = 0; i < 200; i++) {
    const j = await api('GET', '/api/build/' + job.jobId)
    if (['done', 'cancelled', 'failed'].includes(j.state)) {
      if (j.kind === 'build' && j.placed > 0) builds++
      return j
    }
    await sleep(100)
  }
  throw new Error('Auftrag wird nicht fertig')
}
async function region(x1, y1, z1, x2, y2, z2) {
  const r = await api('GET', `/api/world/blocks?x1=${x1}&y1=${y1}&z1=${z1}&x2=${x2}&y2=${y2}&z2=${z2}`)
  const [W, , L] = r.size
  return { ...r, at: (x, y, z) => r.palette[r.data[((y - y1) * L + (z - z1)) * W + (x - x1)]] }
}
function plan(blocks) {
  const p = new Project()
  for (const [x, y, z, id] of blocks) p.set(y, x, z, p.blockIndex(id))
  return exportSponge(p, { dataVersion: 3955, name: 'test' }).bytes
}

// --- Sicherheit ---
const noToken = await fetch(base + '/api/hello')
check(noToken.status === 401, `ohne Token: ${noToken.status}`)
const pre = await fetch(base + '/api/build', { method: 'OPTIONS', headers: {
  Origin: 'https://desssno.github.io', 'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'x-mcpainter-token', 'Access-Control-Request-Private-Network': 'true' } })
check(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://desssno.github.io' &&
  pre.headers.get('access-control-allow-private-network') === 'true', `CORS-Vorabanfrage von GitHub Pages: ${pre.status}`)
const evil = await fetch(base + '/api/hello', { headers: { Origin: 'https://example.com', 'X-MCPainter-Token': token } })
check(!evil.headers.get('access-control-allow-origin'), 'fremde Seite bekommt keine CORS-Freigabe')

// --- hello ---
const hello = await api('GET', '/api/hello')
check(hello.inWorld && hello.canBuild && hello.player, `hello: Welt „${hello.world}“, ${hello.dimension}, darf bauen: ${hello.canBuild}`)

// Baustelle 6 Blöcke neben dem Spieler, auf Fußhöhe (geht auch durch Gelände)
const X = Math.floor(hello.player.x) + 6, Y = Math.floor(hello.player.y), Z = Math.floor(hello.player.z) + 6
const box = [X - 1, Y - 1, Z - 1, X + 5, Y + 3, Z + 5]
const before = await region(...box)

// --- Bauen ---
const blocks = []
for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) blocks.push([X + x, Y, Z + z, 'minecraft:stone_bricks'])
for (let x = 0; x < 5; x++) blocks.push([X + x, Y + 1, Z, 'minecraft:oak_fence']) // Zaunreihe: soll sich verbinden
blocks.push([X + 2, Y + 1, Z + 2, 'minecraft:oak_stairs[facing=east,half=bottom]'])
blocks.push([X + 4, Y + 1, Z + 4, 'minecraft:pale_oak_planks']) // gibt es in 1.21.1 nicht
const job = await api('POST', '/api/build?overwrite=all&clearAir=false', plan(blocks))
check(job.unknownBlocks.includes('minecraft:pale_oak_planks'), `unbekannte Blöcke gemeldet: ${job.unknownBlocks}`)
const done = await waitJob(job)
check(done.state === 'done' && done.total === 31, `Bau fertig: ${done.state}, ${done.done}/${done.total}, gesetzt ${done.placed}`)

const after = await region(...box)
check(after.at(X, Y, Z) === 'minecraft:stone_bricks' && after.at(X + 4, Y, Z + 4) === 'minecraft:stone_bricks', 'Boden aus Steinziegeln')
check(after.at(X + 2, Y + 1, Z + 2).startsWith('minecraft:oak_stairs[facing=east,half=bottom'), `Treppe: ${after.at(X + 2, Y + 1, Z + 2)}`)
const fence = after.at(X + 2, Y + 1, Z)
check(fence.includes('east=true') && fence.includes('west=true'), `Zaun verbunden: ${fence}`)
check(after.at(X + 4, Y + 1, Z + 4) === before.at(X + 4, Y + 1, Z + 4), 'unbekannter Block übersprungen, Welt dort unverändert')

// --- nichts überschreiben: Glas auf die Steinziegel und in eine Luftlücke, die wir vorher selbst schaffen ---
await waitJob(await api('POST', '/api/build?overwrite=all&clearAir=true', plan([[X + 1, Y + 2, Z + 1, 'minecraft:air']])))
check((await region(...box)).at(X + 1, Y + 2, Z + 1) === 'minecraft:air', 'clearAir=true setzt Luft')
const job2 = await waitJob(await api('POST', '/api/build?overwrite=none', plan([[X + 1, Y, Z + 1, 'minecraft:glass'], [X + 1, Y + 2, Z + 1, 'minecraft:glass']])))
const after2 = await region(...box)
check(after2.at(X + 1, Y, Z + 1) === 'minecraft:stone_bricks', 'overwrite=none lässt Steinziegel stehen')
check(after2.at(X + 1, Y + 2, Z + 1) === 'minecraft:glass', 'overwrite=none baut in die Luft')
check(job2.placed === 1 && job2.skipped === 1, `gesetzt ${job2.placed}, übersprungen ${job2.skipped}`)

// --- Abbrechen: großer Bau, sofort abbrechen; was schon steht, lässt sich trotzdem rückgängig machen ---
const big = []
for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) for (let y = 0; y < 8; y++) big.push([X + 20 + x, Y + 30 + y, Z + 20 + z, 'minecraft:glass'])
const bigBox = [X + 20, Y + 30, Z + 20, X + 83, Y + 37, Z + 83]
const bigBefore = await region(...bigBox)
const bigJob = await api('POST', '/api/build?overwrite=all', plan(big))
for (let i = 0; i < 100 && (await api('GET', '/api/build/' + bigJob.jobId)).done === 0; i++) await sleep(20)
await api('POST', `/api/build/${bigJob.jobId}/cancel`)
const cancelled = await waitJob(bigJob)
check(cancelled.state === 'cancelled' && cancelled.done > 0 && cancelled.done < cancelled.total, `großer Bau mittendrin abgebrochen bei ${cancelled.done} von ${cancelled.total}`)

// --- Rückgängig: alle Bauten zurück (neuester zuerst), dann muss alles wie vorher sein ---
console.log(`     ${builds} Bauten mit Änderungen werden rückgängig gemacht`)
for (let i = builds; i > 0; i--) await waitJob(await api('POST', '/api/undo'))
const restored = await region(...box)
const bigAfter = await region(...bigBox)
const bigDiff = bigBefore.data.filter((v, i) => bigBefore.palette[v] !== bigAfter.palette[bigAfter.data[i]]).length
check(bigDiff === 0 && !bigAfter.palette.includes('minecraft:glass'), `abgebrochener Bau vollständig zurückgesetzt (${bigDiff} Abweichungen von ${bigBefore.data.length})`)
const diff = before.data.filter((_, i) => before.palette[before.data[i]] !== restored.palette[restored.data[i]]).length
check(diff === 0, `nach allen Rückgängig ist der Bereich wie vorher (${diff} Abweichungen von ${before.data.length})`)
const none = await fetch(base + '/api/undo', { method: 'POST', headers: { 'X-MCPainter-Token': token } })
check(none.status === 404, `nichts mehr rückgängig zu machen: ${none.status}`)

await api('POST', '/api/dev/quit').catch(() => {})
