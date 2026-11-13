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
| Tempo | `0` Pause, `1`–`5` = 1×, 2×, 4×, 5×, 10×, Leertaste kurz = Pause an/aus | Knöpfe oben (am Handy: Tempo-Knopf klappt die Stufen auf) |
| Sonstiges | `Esc` = Schauen, `C` = Chronik, `M` = Minikarte | |

Antippen zeigt Bewohner, Stadt oder Reich. Tippst du eine Stadt ein zweites Mal an, öffnet sich ihr Reich. Im Reich-Fenster schaltest du die Regierung um und erklärst Krieg, Frieden oder ein Bündnis.

Das Spiel speichert jede Minute automatisch im Browser (`localStorage`). Einen eigenen Speicherplatz gibt es über Menü → Speichern.

## Als Windows-Programm

Wuselwelt gibt es auch als eigenes Programm für Windows (64 Bit), in zwei Fassungen:

- **`Wuselwelt-Setup-….exe`**: Installationsprogramm. Legt Wuselwelt im Startmenü und auf dem Desktop an und lässt sich über „Apps“ in den Windows-Einstellungen wieder entfernen.
- **`Wuselwelt-…-tragbar.exe`**: ohne Installation. Doppelklick, und das Spiel läuft (z. B. auch vom USB-Stick).

Das Fenster startet groß; `F11` schaltet Vollbild an und aus. Für die schöne Schrift braucht es Internet, ohne Internet läuft alles mit einer Ersatzschrift.

### Fertige Datei von GitHub holen

Mit Veröffentlichung (wenn es eine Version gibt):

1. Die Projektseite auf GitHub öffnen (https://github.com/Pauli224/Neues-Spiel-).
2. Rechts auf **„Releases“** klicken und die oberste Version öffnen.
3. Unten bei **„Assets“** auf `Wuselwelt-Setup-….exe` oder `Wuselwelt-…-tragbar.exe` klicken. Die Datei landet im Download-Ordner.

Ohne Veröffentlichung (aus einem Bau-Lauf; dafür muss man bei GitHub angemeldet sein):

1. Auf der Projektseite oben den Reiter **„Actions“** öffnen.
2. Links **„Windows-App bauen“** wählen.
3. Gibt es noch keinen Lauf (oder soll ein neuer her): rechts **„Run workflow“** → grüner Knopf **„Run workflow“**. Der Bau dauert etwa 5–10 Minuten.
4. Den obersten Lauf mit grünem Haken anklicken, ganz nach unten zu **„Artifacts“** scrollen und **„Wuselwelt-Windows-…“** anklicken.
5. Die heruntergeladene ZIP-Datei mit Rechtsklick → **„Alle extrahieren…“** entpacken. Darin liegen beide `.exe`-Dateien.

Eine neue Veröffentlichung entsteht automatisch, wenn jemand ein Git-Tag wie `v1.0.0` hochlädt.

### Beim ersten Start: Sicherheitswarnung

Das Programm ist nicht digital signiert (das kostet Geld). Darum meldet Windows beim ersten Start „Der Computer wurde durch Windows geschützt“ bzw. „Unbekannter Herausgeber“. So startest du es trotzdem:

1. Im blauen Fenster auf **„Weitere Informationen“** klicken.
2. Dann auf **„Trotzdem ausführen“**.

Fragt der Browser schon beim Herunterladen nach („wird selten heruntergeladen“), dort im Menü **„Behalten“** wählen. Danach fragt Windows nicht mehr.

### Selbst bauen

Voraussetzung: Windows mit [Node.js](https://nodejs.org) (LTS-Fassung) und dieser Ordner auf dem Rechner. In der Eingabeaufforderung im Projektordner:

```
cd app
npm ci
npm run dist
```

Die fertigen `.exe`-Dateien liegen danach in `app\dist\`. Zum schnellen Ausprobieren ohne Verpacken: `npm start` (im Ordner `app`).

### Wo liegen die Spielstände?

Das Programm speichert wie im Browser (automatisch jede Minute und über Menü → Speichern), aber in einem eigenen Ordner:
`%APPDATA%\Wuselwelt` (in die Adresszeile des Explorers eintippen), dort im Unterordner `Local Storage`.
Installierte und tragbare Fassung teilen sich diese Spielstände. Beim Deinstallieren bleiben sie erhalten; wer sie loswerden will, löscht den Ordner `Wuselwelt` dort von Hand. Spielstände aus dem Browser werden nicht übernommen.

## Entwickeln

- `node tests/run.js`: Tests der Simulation.
- `node tools/build.js`: Erzeugt `dist/wuselwelt.html` (eine einzelne, eigenständige Datei) und `dist/artifact.html` (ein Fragment für ein Claude-Artifact).
- `node icons/make-icons.js`: Erzeugt die App-Icons aus den Pixel-Sprites. Dafür werden Playwright und Chromium gebraucht.
- `tools/sprite-preview.html` zeigt alle Sprites, `tools/worldgen-preview.html` den Weltgenerator.

Aufbau: `js/core` (Gelände, Zufall, Spielwerte), `js/data` (Namen, Texte), `js/sim` (Simulation, ohne DOM, deterministisch), `js/render` (Sprites, Kamera, Renderer), `js/ui` (Oberfläche), `js/main.js` (Start und Spielschleife). Alle Skripte sind klassische `<script>`-Dateien im gemeinsamen Namensraum `WW`.

Neue Werkzeuge kommen als Einträge über `WW.UI.Tools.addTool({...})` dazu (siehe `js/ui/tools.js`). Kräfte und Tiere übernimmt die Oberfläche automatisch aus `WW.POWERS` und `WW.CREATURES`.

Wenn eine neue Skriptdatei dazukommt, muss sie in `index.html` (zwischen den `SCRIPTS`-Marken) und in der Liste in `sw.js` eingetragen werden.
