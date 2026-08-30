# iOS-first verification

The goal is high confidence with the smallest useful amount of live testing. Automated checks
are the default; simulator/device tests are reserved for native boundaries that JavaScript tests
cannot prove.

## Every change

```bash
npm run quality
```

This validates TypeScript, the deterministic test suite, the Anki source registry, and native
iOS configuration. A web export is the fast full-bundle regression and runs in CI.

## Targeted live-test ladder

Run only the row touched by the change, plus the release smoke below for a release candidate.

| Change area | Minimum iPhone test |
| --- | --- |
| Reviewer/scheduler UI | Open one new, learning and review card; reveal and grade; background/foreground once; undo once |
| Typed-answer reviewer | Review one `{{type:Field}}` card with the native input and one with “Cevabı kartın içine yaz”; verify optional focus opens the keyboard, Enter reveals the answer, `#typeans` CSS applies only in-card, the typed diff is correct, and the next/repeated card starts empty |
| Reviewer touch controls | In Controls, verify the default question 3×3 grid is Show Answer and the answer grid is Again/Off/Good by column; reassign one zone on each side, tap all nine card areas, confirm links/audio controls remain interactive, drag Swipe sensitivity to 1%, 100% and 200%, and confirm vertical review swipes only trigger from the left/right screen edge while the card center still scrolls |
| Reviewer Timebox | Set a one-minute Timebox; cross the limit while a card is unanswered and verify the prompt waits for grading; choose Continue and confirm the next prompt counts only the new block; choose Finish and confirm the deck list opens |
| Settings numeric input | In Reviewing, tap the hour in `17:00` and enter `23`; tap a minute value and enter its maximum; verify units remain fixed, out-of-range input is clamped, and both top and bottom Save controls report success |
| General appearance | Open General and switch the three direct System/Light/Dark theme boxes; verify the black night palette and status bar, confirm there is no separate Appearance category or theme modal, then toggle the headerless “Show filenames” row and inspect one audio card in the browser |
| Import/file handling | From Files, open one small `.apkg`; confirm the automatic pre-import backup and retained local media; confirm an oversized, corrupt-SQLite and active-media fixture is rejected before collection mutation; for `.colpkg`, confirm the replacement warning |
| Media/editor | Add one photo and one audio recording; enable PNG clipboard paste, paste one image, then paste a harmless fixture containing `<script>`/`onerror`; confirm no code/navigation runs, force-quit/relaunch, and review both sides offline |
| Reviewer text to speech | Install an Enhanced Turkish voice in iOS Settings; review one whole-card Turkish note and one template with `{{tts tr_TR voices=Apple_<installed_voice> speed=0.8:Field}}`; rapidly reveal/grade three cards and replay once; confirm each side is spoken once, hidden hints/CSS are skipped, the requested rate is used, and speech stops at the configured answer boundary |
| URL automation | Add a note through `tusankim://`; confirm HTTPS and Shortcuts success callbacks work, while `http:`, `file:`, `data:`, credentials and a recursive `tusankim:` callback are ignored |
| Notification | On a fresh install, confirm reminders default to “When reviews are waiting” and provisional delivery is requested without a launch prompt; test 0, 10 and 500 thresholds at the selected time; grant full alerts from the Notifications screen, tap a delivered reminder, confirm the deck screen opens, and confirm no app-icon badge is created; verify the UI explains that vibration and LED/flash are controlled by iOS |
| Purchase/catalog | Test StoreKit sandbox purchase, restore, reinstall entitlement, and learner-deck preservation |
| Backup/restore | Create a backup; tap Share and confirm the dedicated Export Backup screen loads that snapshot, offers deck/format/content options, shows the plaintext warning, and reaches the iOS share sheet; mutate one note before exporting and confirm the package still contains the snapshot state; restore and confirm the mutation is reversed; confirm a malformed-row fixture is rejected without change |
| Deck shortcut | From one deck's overflow menu choose “Kısayol oluştur”; confirm the native Apple Shortcuts sheet names that deck, add it, then run it from Shortcuts and verify the exact deck opens |
| Browser filters | Open the flag dropdown from the browser overflow menu; toggle two checkboxes, confirm the selected count and result chip, then restore “Tümünü seç” |
| Browser table mode | Switch from Cards to Notes; confirm the modal closes, the total changes to notes, sibling cards collapse into one row, aggregate scheduling details appear, and switching back restores individual card rows |
| Filtered deck options | Open Create Filtered Deck from the deck list and Browse; verify the same full-screen form opens, all ten order choices appear in Anki order, second-filter fields expand, the help card scrolls, and Build returns to the created deck |
| Statistics charts | Open Statistics on the smallest supported iPhone; confirm the 12-month default, scroll across every chart, tap a non-empty bar to pin and dismiss its exact-value readout, switch Reviews between count/time, toggle Future Due backlog, and verify empty states, axis units, Card Counts percentages and VoiceOver summaries |
| Native configuration | Install a release build rather than relying only on Expo Go |
| Data protection | On a passcode-protected device, create/import data, lock the device, then unlock and relaunch; confirm the collection remains readable and the release entitlement is `NSFileProtectionComplete` |

## Release candidate smoke

- Fresh install reaches the deck list without network access.
- Safe areas and back gestures work on the smallest supported iPhone and one Dynamic Type size
  above default.
- VoiceOver can identify deck rows, the show-answer control, answer buttons, and overflow tools.
- An `.apkg` opened from Files reaches import and preserves its deck names, note type, media, and
  review history when scheduling import is enabled.
- A study answer survives force-quit/relaunch and the next queue is correct.
- Live and stored-backup exports appear in the iOS share sheet and can be reopened.
- Privacy/support links are reachable and the free catalog unlock does not start a purchase or require a network connection.

Record device model, iOS version, build number, fixture name, and pass/fail in the release notes.
Do not turn this into a full manual retest of every screen unless the native runtime or database
schema changed.
