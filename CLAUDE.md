# Basenplaner: Hinweise für Claude Code

Minecraft-Basenplaner als Web-App (Deutsch), live auf https://desssno.github.io/basenplaner/ (öffentliches Repo).

**Offener Auftrag:** Den MCPainter-Mod umsetzen (NeoForge 1.21.1, Modpack-Welt). Lies [`AUFTRAG-MCPAINTER.md`](AUFTRAG-MCPAINTER.md) und folge ihm. Die Spezifikation steht in [`docs/MCPainter-Konzept.md`](docs/MCPainter-Konzept.md).

## Befehle
- `npm install`: Abhängigkeiten installieren (deepslate, three, esbuild)
- `npm test`: Export- und Import-Tests (25 Prüfungen)
- `npm run build`: baut `dist/Basenplaner.html` (eine Datei, alles inline). Nach jeder Änderung an `src/` ausführen und mitcommitten.

## Regeln
- Öffentliches Repo: keine persönlichen Daten, Tokens oder lokalen Pfade committen.
- Git-Identität: `DesssNo <169904836+DesssNo@users.noreply.github.com>`.
- Jeder Push auf `main` aktualisiert die Pages-Seite (`.github/workflows/pages.yml`).
- UI-Texte auf Deutsch; Code-Stil wie im Bestand (ES-Module, kein Semikolon, 2 Leerzeichen).
