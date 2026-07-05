# Device QA Checklist (Phase 2)

Run on a physical Android phone with a `preview` build (`eas build -p android --profile preview`),
installed from the APK. Check items off as they pass; file anything that fails.

## Install & first run

- [ ] Fresh install boots to the study screen with seeded decks, no error screen
- [ ] First startup writes an automatic backup (Ayarlar → Yedekler shows today's entry)
- [ ] App icon, splash screen, and app name render correctly

## Study flow

- [ ] Show answer → all four grade buttons work; interval labels look sane
- [ ] Haptic feedback fires on answers
- [ ] Undo restores the previous card and session stats
- [ ] Suspend (⏸️) and bury (💤) remove the current card from the session
- [ ] Learning card countdown appears when the queue is only waiting cards
- [ ] Congrats screen appears when the queue is exhausted

## Day rollover

- [ ] With the app open overnight (or device clock moved past 04:00): buried cards release,
      a new daily backup appears, today counters reset

## Backups & data (Phase 1 features)

- [ ] Manual backup (Şimdi Yedekle) creates an entry with size/date
- [ ] Restore round-trips: study a few cards → backup → study more → restore → state matches backup point
- [ ] Restore while mid-study does not crash; answering resyncs the queue
- [ ] Share backup opens the Android share sheet with a .json file
- [ ] Verileri Dışa Aktar opens the share sheet; Verileri İçe Aktar imports the shared file back
- [ ] Veritabanını Denetle reports integrity ok / no orphans

## Kill & persistence

- [ ] Force-stop the app (Settings → Apps → TusAnkiM → Force stop) right after answering a card;
      reopen → the answer was persisted (WAL flush)
- [ ] Airplane mode: everything above still works (fully offline)

## Media smoke test

- [ ] Create a card whose answer contains `<img src="test.png">` after saving `test.png` via import
      (or manually into `documentDirectory/tus-media/`); the image renders in study
      (exercises WebView `allowFileAccess`)
- [ ] A card with `[sound:...]` in a field does not break rendering

## UI / system integration

- [ ] Dark mode: toggle system theme; all screens readable, no white flashes
- [ ] Edge-to-edge: no content hidden under the status bar, camera cutout, or gesture bar
- [ ] Back gesture navigates screens as expected, does not exit mid-study unexpectedly
- [ ] All visible strings are Turkish (note anything English for the 2.3 sweep)
- [ ] Rotation locked to portrait

## Performance

- [ ] Cold start under ~3s on the test device
- [ ] Browser search over the full collection feels instant
- [ ] Answering cards has no visible lag
