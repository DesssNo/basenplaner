# Basenplaner: Hinweise für Claude Code

Minecraft-Basenplaner als Web-App (Deutsch), live auf https://desssno.github.io/basenplaner/ (öffentliches Repo).

**Offener Auftrag:** Den MCPainter-Mod umsetzen (NeoForge 1.21.1, Modpack-Welt). Lies [`AUFTRAG-MCPAINTER.md`](AUFTRAG-MCPAINTER.md) und folge ihm. Die Spezifikation steht in [`docs/MCPainter-Konzept.md`](docs/MCPainter-Konzept.md).

## Befehle
- `npm install`: Abhängigkeiten installieren (deepslate, three, esbuild)
- `npm test`: Export-, Import- und Blockzustand-Tests (60 Prüfungen)
- Mod (`mod/`): `gradlew build` (mit Unit-Tests), `gradlew runClient -Pmcpainter.autotest` (Testseite im Spiel), `-Pmcpainter.autotest=editor` (Editor im Spiel, Esc), `-Pmcpainter.autotest=bridge` + `node tools/test-bridge.mjs` (Bauen über die Brücke). Für Modpack-Tests Mod-Jars nach `mod/run/mods/` legen (ignoriert, nicht ins Repo)
- `npm run build`: baut `dist/Basenplaner.html` (eine Datei, alles inline). Nach jeder Änderung an `src/` ausführen und mitcommitten.

## Regeln
- Öffentliches Repo: keine persönlichen Daten, Tokens oder lokalen Pfade committen.
- Git-Identität: `DesssNo <169904836+DesssNo@users.noreply.github.com>`.
- Jeder Push auf `main` aktualisiert die Pages-Seite (`.github/workflows/pages.yml`).
- UI-Texte auf Deutsch; Code-Stil wie im Bestand (ES-Module, kein Semikolon, 2 Leerzeichen).
