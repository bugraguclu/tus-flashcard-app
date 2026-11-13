# README screenshots

The four images in `.github/screenshots` (`decks-study-stats-*` and `browser-editor-import-*`,
light and dark) are made in three steps:

1. `sample_deck.py` builds the sample collection with Anki's own library: 74 TUS notes in
   Temel Bilimler and Klinik Bilimler, four weeks of review history, and the digoxin card overdue
   in Farmakoloji so studying that deck opens on it. It needs `/Applications/Anki.app` and the
   oracle host from `../anki-oracle/build-host.sh`.
2. `capture.mjs` imports that package into the web app at iPhone 17 Pro size (402×874 pt, minus
   the status bar and home-indicator strip) and takes the six screens in light and dark.
3. `compose.mjs` puts them in iPhone frames with a 09:41 status bar: 1800×1224 transparent PNGs.

```bash
scripts/anki-oracle/run.sh scripts/readme-screenshots/sample_deck.py outputs/readme-shots/TUS-ornek.apkg
node scripts/readme-screenshots/capture.mjs outputs/readme-shots/TUS-ornek.apkg outputs/readme-shots/raw
node scripts/readme-screenshots/compose.mjs outputs/readme-shots/raw .github/screenshots
```

Playwright is not a project dependency. Point `PLAYWRIGHT_MODULE` at an installed `playwright`
package and, if its own Chromium is not installed, `CHROME_PATH` at a Chromium or headless-shell
binary. `capture.mjs` uses the live preview by default; pass a third argument (for example a local
`npm run build:web` served on 127.0.0.1) to shoot another build. The study streak, "today" and the
history are relative to the day the package is built, so build and capture on the same day.
