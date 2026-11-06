# MCPainter: der Basenplaner direkt in Minecraft

Konzept für einen NeoForge-Mod (Minecraft Java **1.21.1**), gedacht für eine **Modpack-Welt mit Custom Biomes und Mod-Blöcken**. Die Umsetzung beschreibt [`AUFTRAG-MCPAINTER.md`](../AUFTRAG-MCPAINTER.md) Schritt für Schritt für Claude Code.

**Ziel:** Im Spiel öffnest du über das Pausemenü oder eine Taste „MCPainter“. Darin erscheint der komplette Basenplaner. Die Karte zeigt **die echte Welt mit allen Modpack-Biomen**, die Palette enthält **alle Blöcke des Modpacks**. Du zeichnest und drückst **„Bauen“**, dann entsteht die Base direkt in deiner Welt. Ein Export ist im Spiel nicht nötig.

---

## 1. Grundentscheidung

| | **A: Eingebetteter Browser (MCEF)** | B: Nachbau in Java | C: Externer Browser + Brücke |
|---|---|---|---|
| Wie | Der Mod zeigt die bestehende Web-App in einem Minecraft-Bildschirm an (Chromium im Spiel) | Alle Werkzeuge als native Minecraft-Oberfläche neu schreiben | Die App läuft im normalen Browser, „Bauen“ schickt an den Mod |
| Im Spiel? | Ja | Ja | Nein |
| Aufwand | Mittel | Sehr hoch, zwei Codebasen | Gering |
| Funktionsumfang | Sofort alles (3D, Werkzeuge, Import …) | Erst nach langem Nachbau | Sofort alles |

**Entscheidung: A, mit C als Fallback.** Beide nutzen dieselbe **Brücke** (Abschnitt 4). Die Web-App bleibt die einzige Quelle für Oberfläche und Werkzeuge.

MCEF gibt es fertig für NeoForge 1.21.1: Version `2.1.6-1.21.1`, nur clientseitig, Lizenz LGPL-2.1. Quellen: [CurseForge: MCEF](https://www.curseforge.com/minecraft/mc-mods/mcef/files), [Moddex: MCEF](https://moddex.gg/mod/mcef). Andere 1.21.1-Mods setzen bereits darauf auf, z. B. die [WebDisplays-1.21.1-Fork](https://www.curseforge.com/minecraft/mc-mods/webdisplays-1-21-1-fork).

---

## 2. Ablauf aus Spielersicht

1. **Öffnen:** In einer Welt im **Pausemenü** auf **„MCPainter“** klicken oder die Taste `B` drücken (unter Steuerung änderbar).
2. **Editor startet**, automatisch abgestimmt auf die Welt:
   - Ansicht auf dich zentriert, die aktuelle Ebene steht auf deiner Fußhöhe, Spieler-Marker auf der Karte.
   - **Karte aus der echten Welt** mit allen Modpack-Biomen (Abschnitt 5). Kein Seed-Feld.
   - **Palette mit allen Blöcken des Modpacks**, mit Namen in deiner Spielsprache und Farben aus dem Spiel. Die Spieler-Hotbar wird zur Editor-Hotbar.
3. **Zeichnen** mit allen bekannten Werkzeugen.
4. **„Bauen“** zeigt Größe, Blockanzahl und Position, dazu die Optionen *bestehende Blöcke überschreiben?* und *Luft im Plan räumt frei?*. Ein Klick startet den Bau.
5. **Die Base wächst** Schicht für Schicht, mit Fortschritt oben im Bild.
6. **Rückgängig** im Editor oder mit `/mcpainter undo`.

Im Spiel fehlen bewusst: Export-Button, PNG-Export, Seed-Eingabe und das Kopieren des `/tp`-Befehls. Das Teleport-Werkzeug teleportiert dort direkt. Die Browser-Version auf GitHub Pages bleibt unverändert.

---

## 3. Architektur

```
┌──────────────────────────── Minecraft-Client (NeoForge 1.21.1 + Modpack) ──────────────────┐
│  MCPainterScreen (MCEF, Vollbild)                                                           │
│     lädt http://127.0.0.1:<port>/?token=<t>   ◄── dieselbe dist/Basenplaner.html            │
│        │ fetch /api/…  (gleicher Ursprung, kein CORS-Problem)                               │
│        ▼                                                                                    │
│  Brücke: lokaler HTTP-Server im Mod (nur 127.0.0.1, zufälliger Port, Token)                 │
│        │ Einzelspieler: Aufrufe laufen über server.execute(…) auf dem Server-Thread         │
│        ▼                                                                                    │
│  Integrierter Server: BuildJob, UndoStore, Biom- und Höhenabfragen, Block-Registry          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
   Fallback C: ein externer Browser (auch desssno.github.io) ruft nach Kopplung dieselbe Brücke auf
```

### Repo-Aufbau

```
/src, /tools, /data, /dist   ← Web-App wie bisher
/mod                         ← neues Gradle-Projekt (NeoForge 1.21.1, ModDevGradle, Java 21)
  src/main/java/<paket>/mcpainter/
    MCPainter.java              Mod-Einstieg, Konfiguration
    client/MCPainterScreen.java MCEF-Bildschirm, Eingaben weiterleiten
    client/MenuHooks.java       Pausemenü-Button, Tastenbelegung
    bridge/BridgeServer.java    lokaler HTTP-Server + Token
    bridge/Api*.java            Endpunkte (Abschnitt 4)
    world/BiomeMapper.java      Biom-Karte aus dem echten Weltgenerator
    world/SurfaceMapper.java    Höhen und Oberfläche
    world/BlockCatalog.java     alle registrierten Blöcke mit Name, Farbe, Form
    build/BuildJob.java         Blöcke setzen mit Zeitbudget pro Tick
    build/UndoStore.java        Vorher-Zustand speichern
  src/main/resources/web/       ← beim Bauen hineinkopiert: ../dist/Basenplaner.html
.github/workflows/mod.yml       ← baut die .jar bei jedem Push
```

---

## 4. Brücke (Schnittstelle Editor ↔ Mod)

Ein lokaler HTTP-Server, nur an `127.0.0.1` gebunden. Antworten sind JSON, außer bei Bau-Daten.

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/` | liefert den Editor aus |
| `GET` | `/api/hello` | Mod- und MC-Version, Weltname, Dimension, Spielerposition und -blickrichtung, Rechte (darf bauen?) |
| `GET` | `/api/blocks` | **Block-Katalog des Modpacks**: ID, Anzeigename (übersetzt), Mod-Name, Kartenfarbe, Durchsichtigkeit, Form (voller Block, Höhe), mögliche Zustände |
| `GET` | `/api/world/biomes?x1&z1&x2&z2&step` | **Biom-Karte aus dem echten Weltgenerator** (Abschnitt 5) → `{ palette: [{id, name, color}], data: [...] }` |
| `GET` | `/api/world/surface?x1&z1&x2&z2&step` | Höhe und Farbe des obersten Blocks je Spalte: echt bei generierten Chunks, berechnet bei den anderen |
| `GET` | `/api/world/blocks?x1&y1&z1&x2&y2&z2` | vorhandene Blöcke eines Bereichs, um Bestand in den Editor zu holen |
| `GET` | `/api/player/hotbar` | Block-IDs der Spieler-Hotbar |
| `POST` | `/api/build` | Plan bauen. Body im Sponge-`.schem`-Format (der Exporter existiert schon und dient hier nur als Transport) + Optionen → `{ jobId }` |
| `GET` | `/api/build/{id}` | Fortschritt `{ done, total, state, unknownBlocks[] }` |
| `POST` | `/api/build/{id}/cancel` | abbrechen |
| `POST` | `/api/undo` | letzten Bau rückgängig machen |
| `POST` | `/api/teleport` | Spieler teleportieren |

**Sicherheit**
- Nur `127.0.0.1`, zufälliger Port, ein **Token** pro Sitzung. Im Spiel steckt er in der URL. Für den externen Browser zeigt `/mcpainter code` einen Kopplungscode.
- CORS nur für `https://desssno.github.io`, dazu `Access-Control-Allow-Private-Network: true`. Chrome fragt einmal nach Erlaubnis für den lokalen Zugriff.
- Bauen dürfen nur der Welt-Besitzer im Einzelspieler oder OPs mit Level 2 oder höher.
- **Technik:** zuerst prüfen, ob `com.sun.net.httpserver` in der Java-Laufzeit des Modpacks verfügbar ist. Sonst nimmt man **Netty**, das Minecraft mitbringt.

---

## 5. Biom-Karte und Gelände in einer Modpack-Welt

Die heutige Seed-Karte rechnet den **Vanilla**-Generator im Browser nach. Biome aus Mods (z. B. über TerraBlender, Biomes O' Plenty, Terralith, Regions Unexplored) kennt sie nicht. Im Spiel fragen wir deshalb **den echten Generator der Welt**. Der kennt alle Modpack-Biome, weil die Mods sich genau dort einhängen.

- **Biome**, auch für Chunks, die noch nie generiert wurden. Das ist schnell, weil nur die Klima-Noise berechnet wird und keine Chunks:
  `generator.getBiomeSource().getNoiseBiome(qx, qy, qz, randomState.sampler())`
  mit `generator = serverLevel.getChunkSource().getGenerator()` und `randomState = serverLevel.getChunkSource().randomState()` (Methodennamen mit den 1.21.1-Mappings prüfen). Abgefragt wird auf Oberflächenhöhe.
- **Farbe pro Biom**: Vanilla-Biome behalten die Farben aus `src/biomes.js`. Für Mod-Biome nimmt man die Grasfarbe des Bioms (`biome.getGrassColor(x, z)`), bei Wasser-Biomen die Wasserfarbe. Notfalls gibt es eine feste Farbe aus dem Namen.
- **Name pro Biom** aus dem Übersetzungsschlüssel `biome.<namespace>.<pfad>`, damit die Legende „Lavendelfeld (Biomes O' Plenty)“ zeigt statt einer ID.
- **Höhe/Relief**:
  - Generierte Chunks liefern die echte Höhe aus der Heightmap und die Farbe des obersten Blocks (`state.getMapColor(...)`). Das ergibt eine echte Draufsicht wie eine Minecraft-Karte.
  - Nicht generierte Chunks liefern eine Höhenschätzung über `generator.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, randomState)`, nur grob gerastert, weil das teurer ist.
- **Im Editor** wird die Karte zu einer *Datenquelle*:
  - **Browser:** Seed + deepslate wie heute.
  - **Minecraft:** `/api/world/biomes` und `/api/world/surface`.

  Die Kacheln, die Zoomstufen und die Legende bleiben gleich. Neu ist der Schalter **„Ansicht: Biome / echte Oberfläche“**.
- **Nicht nur Oberwelt:** Weil die Daten aus der Dimension des Spielers kommen, funktioniert das auch im Nether, im End und in Mod-Dimensionen.

---

## 6. Blöcke aus dem Modpack

- `/api/blocks` liefert **alle registrierten Blöcke**. Der Editor baut daraus seine Palette:
  - Gruppen nach Mod, Suche über Namen und IDs, Vanilla-Gruppen wie bisher zuerst.
  - Farben aus der Kartenfarbe des Blocks (`defaultBlockState().getMapColor(...)`). Später echte Texturen als Atlas, siehe Etappe 4.
- **Form für die 3D-Ansicht** kommt aus dem Spiel statt aus Namensregeln: „voller Block ja/nein“ und Kollisionsbox. Damit stimmen auch Mod-Blöcke wie Tische oder Rohre ungefähr.
- **Blockzustände:** Die Pipette im Editor kann Zustände übernehmen, z. B. Treppe nach Osten. „Bestand übernehmen“ bringt alle Zustände mit.
- Die Spieler-Hotbar mit Mod-Blöcken erscheint als Editor-Hotbar.

---

## 7. Bau-Engine

1. **Einlesen:** Jeder Palettenstring, z. B. `create:andesite_casing` oder `minecraft:oak_stairs[facing=east]`, wird mit `BlockStateParser.parseForBlock(...)` in einen `BlockState` umgewandelt. Unbekannte Blöcke werden gesammelt, gemeldet und übersprungen.
2. **Reihenfolge:** nach Chunks sortiert, innerhalb eines Chunks von unten nach oben.
3. **Zeitbudget:** In `ServerTickEvent.Post` nur so viele Blöcke setzen, bis ca. 5 ms pro Tick verbraucht sind. Das Spiel bleibt flüssig, auch bei Millionen Blöcken.
4. **Ungeladene Chunks** laden bzw. generieren und das ins Budget einrechnen. Das ist der teuerste Teil.
5. **Ohne Physik setzen:** `level.setBlock(pos, state, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE)`. Am Ende folgt ein Durchgang mit Nachbar-Updates, damit Zäune und Scheiben sich verbinden.
6. **Undo:** Vor jedem Block den alten Zustand inklusive Block-Entity-Daten sichern, chunkweise unter `<welt>/data/mcpainter/undo/`, die letzten 5 Bauten. Das überlebt einen Neustart.
7. **Optionen:** *Überschreiben* (nichts / nur Luft und Flüssigkeiten / alles) und *Luft räumt frei*.

---

## 8. Änderungen an der Web-App („Minecraft-Modus“)

Aktiv, wenn `/api/hello` antwortet:

- **Ausblenden:** Export, PNG, Seed-Bereich, `/tp`-Kopieren.
- **Neu:**
  - Button **„In Minecraft bauen“** mit Dialog und Fortschritt.
  - Kartenquelle aus der Welt mit dynamischer Biom-Legende (Abschnitt 5).
  - Palette aus `/api/blocks` (Abschnitt 6).
  - Spieler-Marker; Teleport-Werkzeug teleportiert direkt.
  - **„Bestand übernehmen“**: Bereich der echten Welt als verschiebbare Auswahl in den Plan holen.
  - **Pläne pro Welt** werden über die Brücke im Weltordner gespeichert.
- **Technisch:**
  - `src/map.js` bekommt eine austauschbare Datenquelle.
  - `src/blocks.js` bekommt eine Palette, die zur Laufzeit ersetzt werden kann. Die feste Liste bleibt für die Browser-Version.
  - Die Block-Formen kommen aus dem Spiel statt aus Namensregeln.
- **Vorher beheben:** Beim Drehen einer Auswahl (Q) müssen sich Treppen und andere ausgerichtete Blöcke mitdrehen. Sonst baut der Mod sie falsch herum.

---

## 9. Etappen

| Etappe | Inhalt | Fertig, wenn … |
|---|---|---|
| **0: Machbarkeit** | `/mod` aus dem NeoForge-1.21.1-MDK, MCEF als Abhängigkeit, Testbildschirm mit lokaler Seite | Seite lädt im Spiel; Maus, Tastatur und Mausrad gehen; **WebGL und Web Worker laufen** in MCEF |
| **1: Brücke + Bauen** | HTTP-Brücke, `/hello`, `/build`, Fortschritt, Undo; Button „In Minecraft bauen“ in der Web-App | Ein Plan aus dem normalen Browser wird in der Welt gebaut und lässt sich rückgängig machen |
| **2: Editor im Spiel** | MCEF-Bildschirm, Pausemenü-Button, Taste, Token, Ansicht auf Spieler, Minecraft-Modus der Web-App | Der komplette Ablauf aus Abschnitt 2 klappt im Spiel |
| **3: Modpack-Anbindung** | `/blocks`, `/world/biomes`, `/world/surface`, Bestand übernehmen, Hotbar, Teleport | Mod-Biome und Mod-Blöcke erscheinen im Editor und lassen sich bauen |
| **4: Komfort (optional)** | Vorschau als **Geisterblöcke** in der Welt vor dem Bauen; echte Block-Texturen im Editor; Mehrspieler-Server; Survival-Bauen mit Material | nach Wunsch |

---

## 10. Risiken

- **MCEF im Modpack:** Der erste Start lädt ca. 100 MB Chromium. Konflikte mit anderen Mods sind möglich, das testet Etappe 0 in der echten Modpack-Umgebung.
- **Mod-Biome:** Manche Mods verändern die Biomwahl über eigene Systeme. Weil wir den echten Generator fragen, sollte es trotzdem stimmen. Vergleich in Etappe 3: Karte gegen `F3` im Spiel.
- **Sehr große Bauten:** Das Generieren neuer Chunks ist langsam. Das Zeitbudget hält das Spiel flüssig, der Bau dauert dann länger. Der Dialog zeigt eine Zeitschätzung.
- **Block-Entities:** Truhen-Inhalte, Schilder-Texte und Maschinen-Einstellungen aus Mods kann der Plan nicht enthalten.
- **Mehrspieler:** MCEF läuft nur auf dem Client. Auf einem Server muss der Mod auch auf dem Server laufen, und die Daten gehen dann per Netzwerk-Paket statt über HTTP. Das ist Etappe 4.

---

## 11. Standardentscheidungen (änderbar)

| Frage | Standard |
|---|---|
| Name | **MCPainter** (Mod-ID `mcpainter`) |
| Taste | **keine** (frei belegbar unter Steuerung; geöffnet wird über den Pausemenü-Button) |
| Mehrspieler | erst mal nur Einzelspieler / LAN-Host |
| Survival-Bauen | später (Etappe 4) |
| Geisterblock-Vorschau | später (Etappe 4) |
| Export im Spiel | **nein**, „Bauen“ ersetzt ihn |

---

## 12. Für später (Ideen und bekannte Lücken)

Gesammelt beim Umsetzen und Testen; kommt nach Etappe 4 bzw. nach Wunsch.

- **Mod-Blöcke beim Drehen/Spiegeln mitdrehen** (z. B. Create): Klappt bisher nur für Vanilla-Blöcke. Ursache: Die Palette enthält Mod-Blöcke ohne Zustand (`create:…` statt `create:…[facing=north]`), und `src/blockstate.js` kennt die Standardrichtung nur für Vanilla-Blöcke (Tabelle `DEFAULTS`). Lösung: Standardzustände aus `/api/blocks` mitliefern (`defaultBlockState()`) und beim Drehen verwenden; Mod-eigene Eigenschaften mit Richtungswerten (`north`/`east`/…) dabei wie `facing` behandeln.
- **Mod-Blöcke in der Palette (optional):** War in 0.4.0 drin (`/api/blocks`, Gruppen pro Mod), in ATM10 aber zu langsam beim Öffnen und ruckelig. Seit 0.4.1 zeigt die Palette nur Minecraft-Blöcke; Endpunkt und `registerGameBlocks` in `src/blocks.js` sind noch da. Denkbar: per Schalter oder Suche erst bei Bedarf laden.
- **Echte Oberfläche bei starkem Zoom feiner:** Die Karte zeigt die Oberfläche in Zellen von 4 × 4 Blöcken; nah herangezoomt könnte sie blockgenau sein (eigene Kachelstufe mit Schritt 1).
- **Oberfläche auch für gespeicherte, nicht geladene Chunks:** Bisher nur geladene Chunks; der Rest ist geschätzt.

