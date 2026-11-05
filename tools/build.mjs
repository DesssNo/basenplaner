// Builds dist/Basenplaner.html: one self-contained file (app + worldgen worker + data)
import * as esbuild from 'esbuild'
import fs from 'fs'

const worker = await esbuild.build({ entryPoints: ['src/worldgen.worker.js'], bundle: true, format: 'iife', minify: true, write: false })
const app = await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  define: { __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) },
})
const html = fs.readFileSync('src/index.html', 'utf8')
  .replace('/*STYLE*/', () => fs.readFileSync('src/style.css', 'utf8'))
  .replace('/*SCRIPT*/', () => app.outputFiles[0].text.replace(/<\/script/gi, '<\/script'))
fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync('dist/Basenplaner.html', html)
console.log(`dist/Basenplaner.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
