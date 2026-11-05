// Verbindung zum MCPainter-Mod (Brücke im Spiel, siehe docs/MCPainter-Konzept.md Abschnitt 4).
// Im Spiel liefert die Brücke diese Seite selbst aus, der Token steht in der URL.
// Im normalen Browser koppelt man mit dem Code aus /mcpainter code (Port und Token).
const PAIR_KEY = 'mcpainter-pair'

export class Bridge {
  constructor() {
    this.base = null
    this.token = null
    this.inGame = false
    this.hello = null
  }

  get connected() { return !!this.hello }

  // Läuft die Seite im Spiel? Dann hat die Brücke sie mit Token in der URL ausgeliefert.
  static inGame() {
    return location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('token')
  }

  // Prüft, ob eine Brücke erreichbar ist; gibt /api/hello zurück oder null
  async connect() {
    const token = new URLSearchParams(location.search).get('token')
    if (token && location.hostname === '127.0.0.1') {
      this.base = location.origin
      this.token = token
      this.inGame = true
    } else {
      const saved = readPair()
      if (!saved) return null
      this.base = `http://127.0.0.1:${saved.port}`
      this.token = saved.token
    }
    try {
      this.hello = await this.get('/api/hello')
    } catch {
      this.hello = null
    }
    return this.hello
  }

  // Code aus /mcpainter code, z. B. "51234-0123456789abcdef0123456789abcdef"
  async pair(code) {
    const m = /^\s*(\d{2,5})\s*[-:]\s*([0-9a-f]{32})\s*$/i.exec(code ?? '')
    if (!m) throw new Error('Ungültiger Code. Er sieht so aus: 51234-0123456789abcdef… (im Spiel /mcpainter code eingeben)')
    this.base = `http://127.0.0.1:${m[1]}`
    this.token = m[2].toLowerCase()
    this.hello = await this.get('/api/hello')
    try { localStorage.setItem(PAIR_KEY, JSON.stringify({ port: +m[1], token: this.token })) } catch { /* privates Fenster */ }
    return this.hello
  }

  forget() {
    try { localStorage.removeItem(PAIR_KEY) } catch { /* egal */ }
    this.hello = null
  }

  get(path) { return this.request('GET', path) }
  post(path, body) { return this.request('POST', path, body) }

  async request(method, path, body) {
    let res
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { 'X-MCPainter-Token': this.token, ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) },
        body,
      })
    } catch {
      throw new Error('Minecraft ist nicht erreichbar. Läuft das Spiel noch? Nach einem Neustart neu koppeln.')
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `Fehler ${res.status}`)
    return json
  }
}

function readPair() {
  try {
    const p = JSON.parse(localStorage.getItem(PAIR_KEY))
    return p && p.port && /^[0-9a-f]{32}$/.test(p.token) ? p : null
  } catch {
    return null
  }
}
