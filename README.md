# Basenplaner

> **Für Claude Code:** Hier liegt ein offener Auftrag. Lies [`AUFTRAG-MCPAINTER.md`](AUFTRAG-MCPAINTER.md) und setz ihn um (NeoForge-1.21.1-Mod, der diesen Planer in Minecraft einbaut). Die Spezifikation steht in [`docs/MCPainter-Konzept.md`](docs/MCPainter-Konzept.md).

Top-down-Planer für Minecraft-Basen (Java Edition) mit echter Seed-Karte und Schematic-Export.

**Online benutzen:** https://desssno.github.io/basenplaner/

**Offline:** `dist/Basenplaner.html` per Doppelklick im Browser öffnen (Chrome, Edge oder Firefox).

**Updates:** Nach Änderungen `npm run build` ausführen, dann committen und pushen. Die Seite aktualisiert sich nach ungefähr einer Minute automatisch (`.github/workflows/pages.yml`).

## Funktionen
- **Seed-Karte:** exakte Oberwelt-Biome für Java 26.3, dazu eine Höhenschätzung als Relief und Slime-Chunks
- **Werkzeuge:** Stift, Radierer, Linie, Rechteck, Kreis/Ellipse, Vieleck (5–8 Ecken), Füllen, Auswahl und Zauberstab (verschieben mit pinken Hilfslinien zum Ausrichten, kopieren, drehen, spiegeln), Pipette, Messen, Zonen
- **Ebenen** pro Y-Höhe, darunterliegende Ebenen scheinen durch; „Hochziehen“ kopiert eine Ebene mehrfach nach oben (für Wände), „Runterziehen“ nach unten (für Fundamente und Pfeiler)
- **Symmetrie** in X/Z, Pinselgröße 1–15, Rückgängig/Wiederholen
- **Materialliste** mit Stacks und Shulkerkisten
- **Export** als `.litematic` (Litematica) oder `.schem` (WorldEdit/FAWE), jeweils mit den echten Weltkoordinaten
- **Import** von `.schem` (Sponge v1–v3), `.litematic` und Vanilla-Strukturdateien `.nbt`, über „Importieren“ oder per Drag-and-drop auf die Karte. Die Schematic wird als verschiebbare Auswahl über mehrere Ebenen platziert (Q dreht, Enter setzt ab).
- **3D-Ansicht** mit Drehen, Zoomen und Verschieben, „Bis Ebene Y“-Schnitt für Innenansichten, Boden mit Biomkarte und Bild-Export
- Automatisches Speichern im Browser, dazu Speichern/Öffnen als `.basenplan.json`

## Tastenkürzel
| Taste | Funktion |
|---|---|
| B / E / L / R / O / G | Stift / Radierer / Linie / Rechteck / Kreis / Füllen |
| N | Vieleck (5-, 6-, 7- oder 8-Eck) |
| M / I / U / T / H | Auswahl / Pipette / Messen / Zone / Hand |
| W | Zauberstab: Klick wählt zusammenhängende gleiche Blöcke (Shift = hinzufügen, Alt = abziehen) |
| P | Teleport-Befehl: Klick auf einen Block kopiert `/tp @s X Y Z` (auch Nether-Variante) |
| 1–9 | Hotbar-Slot |
| Bild auf / Bild ab | Ebene höher / tiefer |
| [ / ] | Pinsel kleiner / größer |
| X / Z / S | Symmetrie X / Symmetrie Z / Symmetrie-Mitte auf Mauszeiger |
| Q | Auswahl um 90° drehen |
| Alt (beim Verschieben) | Einrasten an Hilfslinien kurz ausschalten |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen |
| Strg+C / X / V | Kopieren / Ausschneiden / Einfügen |
| Shift+R | Blöcke ersetzen (ganzer Plan, Ebene oder Auswahl) |
| Leertaste + Ziehen, mittlere Maustaste | Ansicht verschieben |
| Rechtsklick (Malwerkzeuge) | Radieren |

## Entwicklung
```bash
npm install
npm run build
```
- `src/`: App-Code. `worldgen-core.js` nutzt [deepslate](https://github.com/misode/deepslate) für die Minecraft-Weltgenerierung.
- `data/worldgen-26.3.json`: Noise- und Density-Function-Daten aus der offiziellen Server-Jar 26.3 sowie die Biom-Parameter.
- `tools/gen_biome_params.js`: Portierung von Minecrafts `OverworldBiomeBuilder`. Sie wurde gegen den offiziellen 1.19.2-Report geprüft (7593/7593 Einträge identisch).
- `tools/test-export.mjs`: liest die exportierten Schematics mit einem unabhängigen NBT-Leser zurück.
- `tools/test-import.mjs`: Import-Tests (Round-Trip, Sponge v3, Strukturdateien, Litematic mit mehreren Regionen).

## Mod installieren (MCPainter, in Arbeit)
Der Mod liegt in [`mod/`](mod) (NeoForge 1.21.1). Stand: Etappe 3, der Basenplaner läuft im Spiel, kennt Biome und Blöcke des Modpacks und baut direkt in der Welt.
1. Die Jar bauen (`npm run build`, dann `cd mod` und `gradlew build` → `mod/build/libs/mcpainter-*.jar`) oder als Artefakt aus dem Workflow „Mod bauen“ laden.
2. Die Jar und [MCEF](https://www.curseforge.com/minecraft/mc-mods/mcef/files) `2.1.6-1.21.1` für NeoForge in den `mods/`-Ordner der Instanz legen.
3. Beim ersten Start lädt MCEF Chromium herunter (ca. 100 MB).
4. In einer Welt: Esc → Button „MCPainter“ oben links. Eine Taste ist standardmäßig nicht belegt, man kann sie unter Optionen → Steuerung festlegen.

**Im Spiel:** Der Editor startet auf deiner Position (gelber Pfeil „Du“) und auf deiner Fußhöhe. Export, PNG, Seed und `/tp`-Kopieren gibt es dort nicht; „In Minecraft bauen“ ersetzt den Export. Der Plan wird pro Welt im Weltordner gespeichert (`data/mcpainter/plan.json`). Esc schließt erst offene Dialoge bzw. die Auswahl, dann den Editor; zweimal schnell Esc schließt ihn immer. `Strg` + `+`/`-`/`0` zoomt die Oberfläche.

**Modpack:** Die Palette bleibt bei den Minecraft-Blöcken (schneller in großen Modpacks); Mod-Blöcke kommen über deine Hotbar (wird zur Editor-Hotbar), die Pipette, „Bestand übernehmen…“ oder eine eigene ID in den Plan. Die Karte kommt aus dem echten Weltgenerator, auch mit Mod-Biomen und für Gebiete, in denen du noch nie warst (geladen wird nur der sichtbare Bereich plus Rand, fertige Kacheln merkt sich der Mod); unter „Welt & Seed“ schaltest du zwischen „Biome“ und „Echte Oberfläche“ um, darunter steht die Biom-Legende. Das Teleport-Werkzeug (P) teleportiert direkt, „Bestand übernehmen…“ beim Auswahl-Werkzeug holt einen Bereich der echten Welt in den Plan.

**Aus dem Browser bauen:** Im Spiel `/mcpainter code` eingeben und den Code anklicken (kopiert ihn). Im Basenplaner oben auf „Minecraft koppeln“ klicken und den Code einfügen. Danach erscheint oben der Button „In Minecraft bauen“. Der Planer merkt sich pro Welt, was schon gebaut ist: Beim nächsten Bau werden nur neue oder geänderte Blöcke gesetzt, im Plan gelöschte Blöcke werden in der Welt abgerissen (abschaltbar); „Alles neu bauen“ hilft, wenn du in der Welt von Hand etwas verändert hast. Rückgängig geht im Bau-Dialog oder im Spiel mit `/mcpainter undo`; die letzten 5 Bauten lassen sich auch nach einem Neustart noch zurücknehmen.

**Tests des Mods:** `cd mod` → `gradlew test` (Schematic lesen, Bau-Reihenfolge). Gegen das laufende Spiel: `gradlew runClient -Pmcpainter.autotest=bridge` starten, dann im Hauptordner `node tools/test-bridge.mjs` (bauen, Optionen, Abbrechen, Rückgängig, Token, CORS).

## Geplant
- [MCPainter: der Basenplaner direkt in Minecraft](docs/MCPainter-Konzept.md): NeoForge-1.21.1-Mod mit Editor im Spiel, Bauen direkt in der Welt, Biomen und Blöcken aus dem Modpack. Noch nicht gebaut; Umsetzungsplan in [`AUFTRAG-MCPAINTER.md`](AUFTRAG-MCPAINTER.md).
