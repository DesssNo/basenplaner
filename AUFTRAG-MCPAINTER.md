# Auftrag für Claude Code: MCPainter umsetzen

Diese Datei richtet sich an **Claude Code** auf dem PC des Nutzers. Der Nutzer gibt dir nur den Link zu diesem Repo. Du sollst den Rest selbstständig erledigen und ihn nur dort einbinden, wo es ohne ihn nicht geht.

- **Was gebaut wird:** ein NeoForge-Mod für **Minecraft Java 1.21.1**, der den Basenplaner (diese Web-App) **im Spiel** öffnet und Pläne **direkt in der Welt baut**. Der Nutzer spielt eine **Modpack-Welt mit Custom Biomes und Mod-Blöcken**.
- **Wie es aussehen soll:** Das vollständige Konzept steht in [`docs/MCPainter-Konzept.md`](docs/MCPainter-Konzept.md). Lies es komplett, bevor du anfängst. Es ist die Spezifikation. Diese Datei hier sagt dir, **wie** du vorgehst.
- **Sprache:** Mit dem Nutzer sprichst du **Deutsch**. Die Oberfläche der App ist Deutsch. Code-Kommentare folgen dem Stil im Repo.

---

## 0. Zuerst: kurz mit dem Nutzer klären

Stell diese Fragen gesammelt in **einer** Nachricht, nicht einzeln:

1. **Welches Modpack** und welcher **Launcher** (CurseForge, Prism, Modrinth, ATLauncher …)? Wo liegt der **Instanz-Ordner** (mit `mods/`)? Biete an, ihn selbst zu suchen. Typische Orte:
   - `%USERPROFILE%\curseforge\minecraft\Instances\<Name>`
   - `%APPDATA%\PrismLauncher\instances\<Name>\minecraft`
2. Darfst du fehlende Werkzeuge installieren (Java 21 JDK, Node.js LTS), falls sie fehlen?
3. Passen die Standardentscheidungen aus Abschnitt 11 des Konzepts? Name *MCPainter*, Taste `B`, erst nur Einzelspieler, keine Survival-Funktion und keine Geisterblöcke in der ersten Version.

Danach selbst ermitteln, ohne zu fragen:
- **NeoForge-Version** der Instanz, z. B. aus `minecraftinstance.json`, `mmc-pack.json` oder dem Ordner `libraries/net/neoforged/neoforge/`. Gegen genau diese Version entwickeln.
- **Liste der installierten Mods** aus `mods/`. Besonders wichtig sind Biom-Mods (TerraBlender, Biomes O' Plenty, Terralith, Regions Unexplored …) und ob **MCEF** schon drin ist.

---

## 1. Umgebung prüfen und einrichten

| Werkzeug | Prüfen | Falls fehlt (nur nach Zustimmung) |
|---|---|---|
| Git | `git --version` | `winget install Git.Git` |
| Java **21 JDK** (nicht nur JRE) | `java -version`, `javac -version` | `winget install Microsoft.OpenJDK.21` |
| Node.js ≥ 20 | `node --version` | `winget install OpenJS.NodeJS.LTS` |
| GitHub CLI (zum Pushen) | `gh auth status` | `winget install GitHub.cli`, dann `gh auth login --web` (der Nutzer meldet sich selbst an) |

Dann das Repo vorbereiten:

```bash
git clone https://github.com/DesssNo/basenplaner.git
cd basenplaner
git config user.name "DesssNo"
git config user.email "169904836+DesssNo@users.noreply.github.com"
npm install
npm test        # muss 25× OK zeigen
npm run build   # erzeugt dist/Basenplaner.html
```

---

## 2. Regeln für dieses Repo

- **Das Repo ist öffentlich.** Niemals persönliche Daten committen: keinen echten Namen, keine E-Mail außer der noreply-Adresse oben, keine Tokens, keine lokalen Pfade wie `C:\Users\…`. Vor **jedem** Commit den Diff danach durchsuchen.
- **Keine Mojang- oder Mod-Jars** und keine dekompilierten Quelltexte ins Repo. Gradle-Caches, `build/`, `run/` und `.gradle/` gehören in `.gitignore`.
- Nach Änderungen an der Web-App immer `npm run build` ausführen und `dist/Basenplaner.html` mitcommitten. Die GitHub-Pages-Seite (https://desssno.github.io/basenplaner/) wird bei jedem Push automatisch daraus gebaut.
- Die **Browser-Version muss weiter funktionieren**. Alles Minecraft-Spezifische nur im „Minecraft-Modus“ aktivieren (Konzept Abschnitt 8).
- Nach jeder Etappe committen. **Vor dem Pushen kurz den Nutzer fragen**, außer er hat schon gesagt, dass du immer pushen darfst.
- Ehrlich berichten: Was du nicht selbst im Spiel testen konntest, sagst du klar.

---

## 3. Vorgehen in Etappen

Arbeite die Etappen der Reihe nach ab. Am Ende jeder Etappe gilt:
1. Bauen und testen, was du selbst testen kannst.
2. Dem Nutzer eine **kurze Test-Checkliste** fürs Spiel geben.
3. Auf seine Rückmeldung warten, bevor du die nächste Etappe beginnst.

### Etappe 0: Machbarkeit (zuerst, klein halten)
- **Projekt anlegen:** `/mod` aus der offiziellen **NeoForge-MDK-Vorlage für 1.21.1 mit ModDevGradle**. Die aktuelle Vorlage findest du über https://neoforged.net bzw. die MDK-Repos auf GitHub. NeoForge-Version = die der Modpack-Instanz.
  - Mod-ID `mcpainter`.
  - Paket nach Wahl, ohne echten Namen, z. B. `io.github.desssno.mcpainter`.
- **MCEF einbinden:** als Abhängigkeit für NeoForge 1.21.1, Version `2.1.6-1.21.1`.
  - Die **aktuellen Maven-Koordinaten bzw. das Repository selbst nachschlagen** (MCEF-README von CinemaMod oder CurseMaven), **nicht raten**.
  - In `neoforge.mods.toml` als `required` eintragen.
- **Testbildschirm:** öffnet sich per Taste und zeigt eine kleine lokale Testseite mit:
  - einem Canvas, auf dem man mit der Maus zeichnen kann
  - einem **WebGL**-Würfel
  - einem **Web Worker**, der eine Zahl zurückmeldet
- **Selbst testen:** `gradlew build` muss durchlaufen. `gradlew runClient` startet die Entwicklungsumgebung. Prüfe dort, so weit möglich, Logs und Fehler.
- **Nutzer testet:** Jar (und MCEF, falls nicht vorhanden) in den `mods/`-Ordner der Instanz kopieren, aber **vorher fragen**. Dann im Modpack prüfen: Startet das Spiel? Öffnet die Taste die Seite? Funktionieren Maus, Tastatur, Mausrad, WebGL und Worker?
- **Wenn MCEF im Modpack nicht funktioniert:** stoppen, die Optionen erklären (Fallback C aus dem Konzept: externer Browser + Brücke) und den Nutzer entscheiden lassen.

### Etappe 1: Brücke + Bauen
- `BridgeServer` (nur `127.0.0.1`, zufälliger Port, Token) mit `/api/hello`, `/api/build`, `/api/build/{id}`, `/cancel` und `/api/undo` laut Konzept Abschnitt 4.
- `BuildJob` und `UndoStore` laut Abschnitt 7: Zeitbudget pro Tick, ohne Physik, Undo speicherbar.
- **Web-App:** Button „In Minecraft bauen“ nur, wenn die Brücke antwortet; Bau-Dialog mit Fortschritt. Für den Test aus dem normalen Browser den Kopplungscode `/mcpainter code` umsetzen.
- **Vorher in der Web-App beheben:** Beim Drehen (Q) bzw. Spiegeln einer Auswahl müssen sich Blockzustände wie `facing`, `axis` und `rotation` mitdrehen. Dazu einen Test in `tools/` ergänzen.
- **Selbst testen:**
  - Unit-Tests für Parser und Bau-Reihenfolge.
  - In `runClient` eine Testwelt erzeugen und einen kleinen Plan über die Brücke bauen lassen, z. B. per `curl` mit Token. Danach die Blöcke prüfen, etwa per Befehl/Log.

### Etappe 2: Editor im Spiel
- `MCPainterScreen` mit MCEF im Vollbild, Button im **Pausemenü** und Taste `B`. Die Seite wird von der Brücke ausgeliefert (`/`), mit Token in der URL.
- **Gradle:** `processResources` kopiert `../dist/Basenplaner.html` nach `web/`.
- **Minecraft-Modus der Web-App:** Export, PNG, Seed und `/tp`-Kopieren ausblenden; Ansicht auf den Spieler zentrieren; Spieler-Marker. Esc schließt erst Dialoge, dann den Bildschirm.

### Etappe 3: Modpack-Anbindung
- `/api/blocks`, `/api/world/biomes`, `/api/world/surface`, `/api/world/blocks`, `/api/player/hotbar` und `/api/teleport` laut Abschnitt 4–6.
- **Web-App:**
  - Palette zur Laufzeit aus `/api/blocks`, gruppiert nach Mod.
  - Karten-Datenquelle austauschbar (Browser = Seed/deepslate, Spiel = Brücke).
  - Dynamische Biom-Legende, Schalter „Biome / echte Oberfläche“, „Bestand übernehmen“.
- **Nutzer testet:** Stimmen die Biome mit `F3` an mehreren Stellen überein, auch bei Mod-Biomen? Lassen sich Mod-Blöcke setzen und bauen?

### Etappe 4: nur auf Wunsch
Geisterblock-Vorschau, echte Texturen, Mehrspieler, Survival-Bauen. Nicht ungefragt anfangen.

---

## 4. Auslieferung

- `.github/workflows/mod.yml` baut den Mod bei jedem Push mit Java 21 und lädt die Jar als Workflow-Artefakt hoch. Der vorhandene Pages-Workflow bleibt unverändert.
- In die `README.md` einen kurzen Abschnitt „Mod installieren“ eintragen: Jar und MCEF in den `mods/`-Ordner, beim ersten Start lädt MCEF Chromium (ca. 100 MB).
- Beim Kopieren in den `mods/`-Ordner des Nutzers alte `mcpainter-*.jar` ersetzen, nie andere Mods anfassen.

---

## 5. Kontext zum bestehenden Code

| Datei | Inhalt |
|---|---|
| `src/main.js` | App, Renderer, UI, Werkzeug-Steuerung |
| `src/tools.js` | Werkzeuge |
| `src/model.js` | Ebenen und Chunks, Undo |
| `src/blocks.js` | Palette und Block-Formen |
| `src/map.js` | Biom-Kacheln (Worker) |
| `src/worldgen-core.js` | deepslate |
| `src/export.js` | Sponge- und Litematic-Export (der Sponge-Writer dient der Brücke als Transportformat) |
| `src/import.js` | Schematic-Import |
| `src/view3d.js` | 3D-Ansicht (three.js) |

- **Build:** `tools/build.mjs` (esbuild) erzeugt eine einzige HTML-Datei, in der Worker und Daten inline stecken.
- **Tests:** `tools/test-export.mjs`, `tools/test-import.mjs` (`npm test`).
- **Biom-Daten der Browser-Version:** gelten für 26.3. Im Spiel werden sie durch die echte Welt ersetzt (Konzept Abschnitt 5).
