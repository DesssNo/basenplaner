// Tiny IndexedDB key-value store for autosave (localStorage is too small for big bases)
let dbPromise = null

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('basenplaner', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const req = fn(d.transaction('kv', mode).objectStore('kv'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const load = key => run('readonly', s => s.get(key)).catch(() => undefined)
export const save = (key, value) => run('readwrite', s => s.put(value, key)).catch(e => console.warn('Autosave fehlgeschlagen', e))
