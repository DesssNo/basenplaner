# MCPainter: der Basenplaner direkt in Minecraft

Konzept für einen NeoForge-Mod (Minecraft Java 1.21.1). Noch nichts davon ist gebaut.

**Ziel:** Im Spiel öffnest du über ein Menü „Mit MCPainter zeichnen“. Darin erscheint der komplette Basenplaner, wie er im Browser läuft. Du zeichnest und drückst **„Bauen“**, dann entsteht die Base in deiner Welt an genau den geplanten Koordinaten.

---

## 1. Geht das?

Ja. Es gibt drei technische Wege:

| | **A: Eingebetteter Browser (MCEF)** | **B: Nachbau in Java** | **C: Externer Browser + Brücke** |
|---|---|---|---|
| Wie | Der Mod zeigt die bestehende Web-App in einem Minecraft-Bildschirm an (Chromium im Spiel) | Alle Werkzeuge werden als native Minecraft-Oberfläche neu geschrieben | Der Mod öffnet die App im normalen Browser; „Bauen“ schickt den Plan an den Mod |
| Im Spiel? | Ja | Ja | Nein, daneben im Browser |
| Aufwand | Mittel | Sehr hoch (alles doppelt pflegen) | Gering |
| Gleicher Funktionsumfang | Sofort (3D, Biomkarte, Import …) | Erst nach langem Nachbau | Sofort |
| Haken | Lädt beim ersten Start ca. 100 MB Chromium; zusätzlicher Mod nötig | Zwei Codebasen, die auseinanderlaufen | Kein „echtes“ Ingame-Gefühl |

**Empfehlung: A, mit C als Fallback.** Beide nutzen dieselbe **Brücke** (Abschnitt 4). Die Web-App bleibt die einzige Quelle für Werkzeuge und Oberfläche. Jede Verbesserung im Browser landet automatisch auch im Spiel.

MCEF gibt es fertig für NeoForge 1.21.1: Version `2.1.6-1.21.1`, nur clientseitig, Lizenz LGPL-2.1. Quellen: [CurseForge: MCEF Dateien](https://www.curseforge.com/minecraft/mc-mods/mcef/files), [Moddex: MCEF](https://moddex.gg/mod/mcef). Andere 1.21.1-Mods wie die [WebDisplays-1.21.1-Fork](https://www.curseforge.com/minecraft/mc-mods/webdisplays-1-21-1-fork) bauen bereits darauf auf.

---

## 2. So fühlt es sich an (Ablauf)

1. **Öffnen**
   - Im **Pausemenü** einer Welt erscheint ein Button **„MCPainter“**, zusätzlich gibt es eine Taste (Standard: `B`, änderbar unter Steuerung).
   - Im **Titelbildschirm** kannst du ohne geladene Welt planen. „Bauen“ ist dort ausgegraut.
2. **Editor startet**
   - Er nimmt **Seed, Dimension und deine Position** automatisch aus der Welt. Die Ansicht ist auf dich zentriert, und die aktuelle Ebene steht auf deiner Fußhöhe.
   - Deine Spieler-Hotbar erscheint als Hotbar im Editor.
   - Statt der geschätzten Seed-Karte kann der Editor das **echte Gelände** zeigen, mit Höhen und obersten Blöcken der bereits generierten Chunks.
3. **Zeichnen** mit allen bekannten Werkzeugen.
4. **„In Minecraft bauen“** öffnet einen Dialog mit Größe, Blockanzahl und Position. Dazu kommen die Optionen *„bestehende Blöcke überschreiben?“* und *„Luft im Plan räumt den Bereich frei?“*. Ein Klick startet den Bau.
5. **Bauen:** Der Editor schließt sich, und die Base wächst Schicht für Schicht, mit einer Fortschrittsanzeige oben am Bildschirm.
6. **Rückgängig:** Im Editor oder mit `/mcpainter undo` stellt der Mod alles wieder her, was vorher dort stand.

---

## 3. Architektur

```
┌──────────────────────────── Minecraft-Client (NeoForge 1.21.1) ────────────────────────────┐
│                                                                                           │
│  MCPainterScreen (MCEF-Browser, Vollbild)                                                 │
│     lädt  http://127.0.0.1:<port>/?token=<t>   ◄─── dieselbe dist/Basenplaner.html        │
│        │                                                                                  │
│        │ fetch() /api/…  (gleicher Ursprung → kein CORS-Problem im Spiel)                 │
│        ▼                                                                                  │
│  Brücke: lokaler HTTP-Server im Mod (nur 127.0.0.1, zufälliger Port, Token)               │
│        │                                                                                  │
│        │ Einzelspieler: direkter Aufruf des integrierten Servers (server.execute(…))      │
│        ▼                                                                                  │
│  Integrierter Server: BuildJob (setzt Blöcke pro Tick), UndoStore, Welt-Abfragen          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
          ▲
          │  Fallback C: externer Browser (auch desssno.github.io) ruft dieselbe Brücke auf
```

### Repo-Aufbau

```
/src, /tools, /data, /dist     ← Web-App wie bisher (unverändert der Kern)
/mod                           ← neues Gradle-Projekt (ModDevGradle, Java 21)
  src/main/java/…/mcpainter/
    MCPainter.java             ← Mod-Einstieg, Konfiguration
    client/MCPainterScreen.java← MCEF-Bildschirm, Eingaben weiterleiten
    client/MenuButtons.java    ← Pausemenü-/Titelbildschirm-Button, Tastenbelegung
    bridge/BridgeServer.java   ← lokaler HTTP-Server + Token
    bridge/Api*.java           ← Endpunkte
    build/BuildJob.java        ← Blöcke setzen mit Zeitbudget pro Tick
    build/SpongeReader.java    ← .schem (Sponge v2) lesen
    build/UndoStore.java       ← Vorher-Zustand speichern
  src/main/resources/web/      ← beim Bauen hineinkopiert: ../dist/Basenplaner.html
.github/workflows/mod.yml      ← baut die .jar bei jedem Push und hängt sie an ein Release
```

Die Gradle-Aufgabe `processResources` kopiert `dist/Basenplaner.html` in das Mod-Jar. Im Spiel läuft also immer genau der Stand aus dem Repo.

---

## 4. Brücke (Schnittstelle zwischen Editor und Mod)

Ein lokaler HTTP-Server im Mod, nur an `127.0.0.1` gebunden. Alle Antworten sind JSON, außer Schematic-Daten (binär).

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/` | liefert den Editor (Basenplaner.html) aus |
| `GET` | `/api/hello` | Mod- und MC-Version, DataVersion (1.21.1 = 3955), Weltname, Seed (falls erlaubt), Dimension, Spielerposition, Rechte (darf bauen?) |
| `GET` | `/api/world/surface?x1&z1&x2&z2&step` | echtes Gelände von oben: Höhe und Farbe bzw. ID des obersten Blocks je Spalte (nur bereits generierte Chunks) |
| `GET` | `/api/world/blocks?x1&y1&z1&x2&y2&z2` | vorhandene Blöcke eines Bereichs als `.schem`, um bestehende Bauten in den Editor zu holen |
| `GET` | `/api/player/hotbar` | Block-IDs der Spieler-Hotbar |
| `POST` | `/api/build` | Body: `.schem` (Sponge v2, der Exporter existiert schon) + Optionen im Header oder Query → `{ jobId }` |
| `GET` | `/api/build/{id}` | Fortschritt `{ done, total, state, unknownBlocks[] }` |
| `POST` | `/api/build/{id}/cancel` | Bau abbrechen |
| `POST` | `/api/undo` | letzten Bau rückgängig machen |
| `POST` | `/api/teleport` | Spieler zu x/y/z teleportieren (ersetzt im Spiel das Kopieren des `/tp`-Befehls) |

**Sicherheit**
- Der Server lauscht nur auf `127.0.0.1` mit zufälligem Port.
- Jede Anfrage braucht einen **Token**. Im Spiel steckt er in der URL des eingebetteten Browsers. Für den externen Browser (Fallback C) zeigt `/mcpainter code` einen 6-stelligen Kopplungscode an.
- CORS ist nur für `https://desssno.github.io` erlaubt. Für Chrome und Edge kommt der Header `Access-Control-Allow-Private-Network: true` dazu. Chrome fragt beim ersten Zugriff einer Website auf `localhost` einmal nach Erlaubnis.
- Bauen dürfen nur der Welt-Besitzer im Einzelspieler oder Spieler mit OP-Level 2 oder höher.

**Technik:** Als Erstes prüfen, ob `com.sun.net.httpserver` in Mojangs Java-Laufzeit verfügbar ist. Sonst nimmt man **Netty**, das Minecraft ohnehin mitbringt.

---

## 5. Bau-Engine (im Mod)

1. **Einlesen:** `NbtIo.readCompressed(…)` liest die `.schem`. Jeder Palettenstring wie `minecraft:oak_stairs[facing=east]` wird mit `BlockStateParser.parseForBlock(…)` in einen echten `BlockState` umgewandelt. Unbekannte Blöcke werden gesammelt, an den Editor gemeldet und übersprungen, statt abzubrechen.
2. **Reihenfolge:** Nach Chunks sortieren, innerhalb eines Chunks von unten nach oben, damit Fackeln, Teppiche usw. Halt haben.
3. **Zeitbudget:** In `ServerTickEvent.Post` nur so viele Blöcke setzen, bis ca. 5 ms pro Tick verbraucht sind. So bleibt das Spiel flüssig, auch bei Millionen Blöcken.
4. **Ungeladene Chunks** werden über `level.getChunk(…)` geladen bzw. generiert. Das ist der teuerste Teil und zählt deshalb mit ins Budget.
5. **Setzen ohne Physik:** `level.setBlock(pos, state, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE)`, damit Sand nicht fällt und Wasser nicht fließt, solange gebaut wird. Am Ende kommt ein Durchgang mit Nachbar-Updates, damit Zäune und Glasscheiben sich verbinden.
6. **Rückgängig:** Vor jedem Block wird der alte Zustand gespeichert, inklusive Block-Entity-Daten wie Truhen-Inhalten. Das liegt pro Chunk gepackt unter `<welt>/data/mcpainter/undo/`, überlebt also einen Neustart. Die letzten 5 Bauten werden aufgehoben.
7. **Optionen:** *Überschreiben* (nichts / nur Luft und Flüssigkeiten / alles) und *Luft räumt frei* (an/aus).

---

## 6. Änderungen an der Web-App („Minecraft-Modus“)

Der Editor erkennt den Mod daran, dass `/api/hello` antwortet (im Spiel oder nach dem Koppeln im Browser). Dann:

- **Button „In Minecraft bauen“** mit Bau-Dialog und Fortschrittsbalken.
- **Seed und Position automatisch.** Das Seed-Feld wird ausgeblendet, und es gibt einen Spieler-Marker auf der Karte.
- **Kartenebene „Echtes Gelände“** aus `/api/world/surface`, wahlweise statt der Biomkarte.
- **Teleport-Werkzeug** teleportiert direkt, statt den Befehl zu kopieren.
- **„Bestand übernehmen“:** einen Bereich der echten Welt als verschiebbare Auswahl in den Plan holen.
- **Versionsfilter:** Die Palette zeigt nur Blöcke, die es in 1.21.1 gibt, und der Export nutzt DataVersion 3955.
- **Pläne pro Welt** werden über die Brücke im Weltordner gespeichert, statt nur im Browser-Speicher.

Außerhalb von Minecraft, also auf GitHub Pages ohne Mod, bleibt alles wie heute.

---

## 7. Wichtig für 1.21.1

- **Biomkarte:** Die Karte im Basenplaner rechnet mit dem Weltgenerator von **26.3**. Eine 1.21.1-Welt mit demselben Seed sieht fast gleich aus, aber:
  - **Blasser Garten** (kam mit 1.21.4) ist in 1.21.1 **Dichter Wald**.
  - **Dappled Forest** ist neu nach 1.21.1 und dort ein anderes Biom.

  Im Minecraft-Modus löst die Ebene „Echtes Gelände“ das, weil sie direkt aus der Welt kommt. Optional könnte man den Generator auf 1.21.1-Daten umstellen: dieselbe Methode wie bisher (`tools/gen_biome_params.js` mit den 1.21.1-Tabellen und den Worldgen-Daten aus der 1.21.1-Server-Jar).
- **Neuere Blöcke** (z. B. `pale_oak_planks`) gibt es in 1.21.1 nicht. Der Versionsfilter (Abschnitt 6) und die Meldung unbekannter Blöcke (Abschnitt 5) fangen das ab.
- **Export-Dialog:** Schon heute dort Java **1.21.1 (3955)** wählen, wenn du Schematics für diese Version exportierst.

---

## 8. Umsetzung in Etappen

| Etappe | Inhalt | Fertig, wenn … |
|---|---|---|
| **0: Machbarkeitstest** | Leeres NeoForge-21.1.x-Projekt mit MCEF als Abhängigkeit; ein Bildschirm, der eine lokale Seite zeigt | Die Seite lädt im Spiel, Maus und Tastatur funktionieren, und **WebGL (3D-Ansicht) und Web Worker (Biomkarte)** laufen in MCEF |
| **1: Brücke + Bauen** | HTTP-Brücke, `/hello`, `/build`, Fortschritt, Undo; Button im Web-Editor | Ein Plan aus dem **normalen Browser** (Fallback C) wird in der Welt gebaut und lässt sich rückgängig machen. Ab hier ist der Mod schon nützlich. |
| **2: Editor im Spiel** | MCEF-Bildschirm, Pausemenü-Button, Taste, Token-Übergabe, Ansicht auf Spieler zentriert | Der komplette Ablauf aus Abschnitt 2 klappt ohne Browser außerhalb des Spiels |
| **3: Welt-Anbindung** | Echtes Gelände, Bestand übernehmen, direktes Teleportieren, Hotbar-Abgleich, Versionsfilter | Planen direkt auf der echten Landschaft |
| **4: Komfort** | **Vorschau als Geisterblöcke** in der Welt vor dem Bauen; Survival-Modus (baut nur mit Material aus Truhen bzw. Inventar); echte Block-Texturen im Editor; Mehrspieler-Server | je nach Wunsch |

**Mehrspieler (Etappe 4):** MCEF läuft nur auf dem Client. Auf einem Server muss der Mod zusätzlich **auf dem Server** laufen, und der Plan geht dann in Stücken per Netzwerk-Paket statt über den lokalen HTTP-Server an den Server.

---

## 9. Risiken und offene Punkte

- **MCEF:** Der erste Start lädt ca. 100 MB Chromium herunter. Die Stabilität auf macOS und Linux ist ungetestet. Etappe 0 klärt das, bevor viel Arbeit drinsteckt.
- **Eingaben:** Maus, Tastatur, Mausrad und Rechtsklick müssen sauber an den Browser gehen. MCEF bringt dafür Beispiele mit. Esc im Editor schließt zuerst Dialoge, erst dann den Bildschirm.
- **Riesige Bauten:** Das Generieren neuer Chunks ist langsam. Das Zeitbudget hält das Spiel flüssig, dauert dann aber eben länger. Der Bau-Dialog sollte eine grobe Zeitschätzung anzeigen.
- **Block-Entities:** Truhen-Inhalte, Schilder-Texte usw. kann der Plan nicht enthalten. Gebaut werden leere Truhen, Schilder ohne Text usw.
- **Drehen:** Treppen und andere ausgerichtete Blöcke drehen sich beim Drehen einer Auswahl im Editor noch nicht mit. Das sollte vor Etappe 1 behoben sein, sonst baut der Mod falsch ausgerichtete Treppen.

---

## 10. Entscheidungen, die du treffen solltest

1. **Name:** „MCPainter“ oder etwas anderes?
2. **Taste:** `B` als Standard okay?
3. **Mehrspieler:** Brauchst du das (eigener Server mit Freunden) oder reicht Einzelspieler bzw. LAN?
4. **Survival-Bauen** mit echtem Material: wichtig oder später?
5. **Geisterblock-Vorschau** in der Welt: Das wäre das größte „Wow“, kostet aber am meisten Arbeit. Gleich mit einplanen?

---

## 11. Wie du am anderen PC weitermachst

1. Repo klonen bzw. `git pull`, dann diese Datei öffnen.
2. Benötigt: **Java 21 JDK** (z. B. `winget install Microsoft.OpenJDK.21`), Git, Node.js (für die Web-App).
3. Mit **Etappe 0** anfangen: In `/mod` ein NeoForge-1.21.1-Projekt aus dem offiziellen MDK (ModDevGradle) anlegen, MCEF 2.1.6 als Abhängigkeit eintragen und einen Testbildschirm bauen.
4. Wenn du dort wieder mit Claude arbeitest: einfach auf diese Datei verweisen („setz Etappe 0 aus `docs/MCPainter-Konzept.md` um“).
