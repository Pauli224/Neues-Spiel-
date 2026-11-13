# Wuselwelt

Ein kleiner Gott-Sandkasten im Browser. Völker gründen Städte, bauen selbst Mauern und regieren sich mehr oder weniger selbst. Du formst die Welt, setzt Siedler aus, wirfst Blitze und bestimmst die Regierungsform jedes Reiches.

## Spielen

- `index.html` im Browser öffnen, auch direkt per `file://`. Es gibt keinen Build-Schritt und keine Abhängigkeiten.
- Am iPhone: Die Seite über http(s) öffnen, dann „Teilen → Zum Home-Bildschirm“. Danach läuft Wuselwelt als Web-App im Vollbild und auch offline.

## Bedienung

| | Maus/Tastatur | Touch |
|---|---|---|
| Werkzeug benutzen | Linksklick bzw. Ziehen | ein Finger |
| Karte verschieben | Ziehen mit „Schauen“, rechte Maustaste oder Leertaste + Ziehen, WASD/Pfeile | Ziehen mit „Schauen“ |
| Zoomen | Mausrad, `+`/`-` | zwei Finger |
| Tempo | `0` Pause, `1` 1×, `2` 3×, `3` 8× | Knöpfe oben |
| Sonstiges | `Esc` = Schauen, `C` = Chronik, `M` = Minikarte | |

Antippen zeigt Bewohner, Stadt oder Reich. Tippst du eine Stadt ein zweites Mal an, öffnet sich ihr Reich. Im Reich-Fenster schaltest du die Regierung um und erklärst Krieg, Frieden oder ein Bündnis.

Das Spiel speichert jede Minute automatisch im Browser (`localStorage`). Einen eigenen Speicherplatz gibt es über Menü → Speichern.

## Entwickeln

- `node tests/run.js`: Tests der Simulation.
- `node tools/build.js`: Erzeugt `dist/wuselwelt.html` (eine einzelne, eigenständige Datei) und `dist/artifact.html` (ein Fragment für ein Claude-Artifact).
- `node icons/make-icons.js`: Erzeugt die App-Icons aus den Pixel-Sprites. Dafür werden Playwright und Chromium gebraucht.
- `tools/sprite-preview.html` zeigt alle Sprites, `tools/worldgen-preview.html` den Weltgenerator.

Aufbau: `js/core` (Gelände, Zufall, Spielwerte), `js/data` (Namen, Texte), `js/sim` (Simulation, ohne DOM, deterministisch), `js/render` (Sprites, Kamera, Renderer), `js/ui` (Oberfläche), `js/main.js` (Start und Spielschleife). Alle Skripte sind klassische `<script>`-Dateien im gemeinsamen Namensraum `WW`.

Neue Werkzeuge kommen als Einträge über `WW.UI.Tools.addTool({...})` dazu (siehe `js/ui/tools.js`). Kräfte und Tiere übernimmt die Oberfläche automatisch aus `WW.POWERS` und `WW.CREATURES`.

Wenn eine neue Skriptdatei dazukommt, muss sie in `index.html` (zwischen den `SCRIPTS`-Marken) und in der Liste in `sw.js` eingetragen werden.
