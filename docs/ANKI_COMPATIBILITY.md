# Anki compatibility baseline

Last reviewed: 2026-08-26

TusAnkiM is an independent Anki alternative with local-first storage and iPhone as its sole
release target; web is only a local/CI regression target. “Compatible” here means a behaviour or interchange path has explicit code and tests; it
does not mean every Anki client feature is present. The canonical external references are listed
in `docs/anki-reference-sources.json`.

## Source hierarchy

Use the [Anki manual](https://docs.ankiweb.net/intro.html) for product semantics and the
[AnkiMobile manual](https://docs.ankimobile.net/) for iOS interactions. Resolve unclear low-level
behaviour against [Anki source](https://github.com/ankitects/anki). Use
[AnkiDroid source](https://github.com/ankidroid/Anki-Android) only for Android-specific behaviour.
The URLs supplied with a trailing `-` are not the canonical repositories; the links above are.

This MIT project must not copy GPL/AGPL implementation. Behavioural compatibility must be
independently implemented and protected by tests.

## Capability matrix

| Area | Status | Current evidence | Next compatibility gate |
| --- | --- | --- | --- |
| New/learning/relearning/review lifecycle | Implemented, legacy scheduler | `lib/scheduler.ts`, scheduler and repository tests | Keep golden interval/rollover tests |
| Answer buttons, next times, counts, undo | Implemented | opt-in redesigned reviewer with a preserved classic fallback, compact toolbar/footer, directional feedback, `lib/reviewerPresentation.test.ts`, review logger and repository tests | iPhone smoke in both classic and redesigned modes on each reviewer change |
| Daily limits, learning steps, lapses, leeches, burying | Implemented | deck options, Anki-style step parser, collection-limit and queue tests | Preserve selected-deck/subdeck semantics |
| Display/gather/sort order and learn-ahead | Implemented for Anki V3/SM-2 | six gather orders, five new-card sort orders, interday/review ordering and queue tests | Add FSRS-only retrievability orders with FSRS, not as inert controls |
| Audio, timers and auto advance deck options | Implemented | per-card preset resolution, reviewer timer/auto-advance behavior and package round-trip tests | Keep the study-session activation boundary explicit |
| Reviewer Timebox | Implemented | Anki-aligned wall-clock block, post-answer Continue/Finish checkpoint, per-block repetition count, `lib/timebox.test.ts` | Run the focused iPhone Timebox smoke when reviewer flow changes |
| FSRS | Not implemented | Algorithm is explicitly `ANKI_V3` | Add versioned FSRS state, migration, reference vectors, rollback backup |
| Hierarchical decks and presets | Implemented | validated/atomic Deck Options save flow, deck manager, deck-options form, and deck-navigation tests | Continue parent/subdeck limit tests |
| Per-deck shortcuts | Implemented | deck overflow action, local `DeckShortcuts` module, Android pinned shortcut and iOS native Apple Shortcuts add flow | Android launcher approval/open smoke; iPhone Apple Shortcuts add/run smoke |
| Filtered decks and custom study | Implemented subset | Context-preserving overview panels, Anki-ordered create/rebuild options, two independent filters, gather limit/order, rescheduling/preview, excluded-card reporting, in-app help, deck manager and study repository tests | Expand search grammar and FSRS scheduling before full parity claim |
| Note types, conditional templates, cloze, typed answer | Implemented subset | native or template-positioned `#typeans` input, optional focus, token-bound/bounded WebView bridge, template, bridge, settings round-trip and note manager tests | Validate more add-on filters and complex templates |
| HTML, images, audio, video, TTS | Implemented subset with an untrusted-content boundary | sanitizer/CSP, card-content, media, package and TTS tests; scripts, network loads, active media documents and silent navigation are blocked | Add offline MathJax and custom-font runtime QA without weakening CSP |
| MathJax/LaTeX runtime rendering | Not implemented | Source fields are preserved on import | Bundle an offline renderer; never depend on a CDN |
| Whiteboard/scratchpad and drawing attachment | Implemented subset | geometry/photo tests and reviewer UI | Apple Pencil-only mode is pending |
| Browser, card/note table modes, tags, flags, marks, suspend/bury, reposition | Implemented subset | In-place searchable deck scope picker with inline create-and-select, scoped tag and multi-flag filters, optional safe audio-filename projection, Notes-mode first-card and aggregate-row semantics, browser/search/table-mode/selection tests | Expand full Anki search grammar and flag naming |
| `.apkg` import/export with media and scheduling | Implemented subset with bounded archive and SQLite validation | package round-trip, backup-source export, archive-security, SQLite-security and import integration tests; a stored snapshot can be exported without consulting or replacing the live collection, known file size is checked before reading, and every package import creates a recovery backup | Maintain fixtures from current Anki releases and physical-device large-package smoke |
| `.colpkg` replacement | Implemented with safety backup | import flow and backup tests | Add real-device large-package smoke |
| CSV/TSV/TXT import/export | Implemented | delimited import/export tests | Keep metadata-header fixtures |
| iOS Files “Open in” hand-off | Implemented | document UTI config and `importFile` tests | Verify once on a physical iPhone per release |
| Local automatic/manual backup and restore | Implemented with strict row validation | backup-validation, backup-source export, backup and storage round-trip tests; Share opens the canonical export workflow over the selected snapshot | Verify export options, Files share destination and plaintext warning per release |
| Collection/database and media check | Implemented subset | maintenance code and deterministic media-reference audit tests | Add an explicit repair preview; keep checks read-only until the user confirms a change |
| iPhone reviewer preferences and external automation | Implemented subset | persisted classic/redesigned reviewer opt-in; AnkiMobile-aligned, separately configurable question/answer 3×3 tap zones; interactive card-element pass-through; adjustable swipe sensitivity and edge-only vertical swipes; `lib/reviewerTouchControls.test.ts`, storage round-trip, strict HTTPS/Shortcuts callback parsing and media-audit tests | Add a native Share extension before broader parity claims |
| iPhone study notifications | Implemented | AnkiMobile daily review reminder, AnkiDroid-compatible 0/10/25/50/75/100/150/200/500 due-review thresholds, default-on provisional iOS authorization, no badge, notification policy/content tests | Verify provisional and fully authorized delivery on a physical iPhone; vibration and LED/flash remain system-owned iOS settings |
| Statistics and card info | Implemented subset | Anki-aligned 12-month default; Today, Future Due, Reviews/Review Time, Answer Buttons, Review Intervals, Card Counts and Added views; pinned chart readouts, accessible summaries, stats presentation/axis/review logger tests | Add Calendar, True Retention and FSRS-specific views with reference fixtures before a full-parity claim |
| AnkiWeb synchronization | Not implemented | Local-only architecture | Requires a documented protocol/backend, conflict model, encryption and recovery plan |
| Profiles | Not implemented | Single local collection; no inert profile toggle is exposed | Design isolation, migration, backup and recovery before UI |
| Shared-deck marketplace | Product-specific catalog only | BKA catalog tests | Do not present it as AnkiWeb shared decks |
| Image Occlusion note authoring | Not implemented | — | Add a native/offline editor and package fixtures |

## Priority roadmap

1. **Protect the collection.** Keep transactional imports, pre-restore/pre-replacement backups,
   catalog ownership isolation, and round-trip tests green.
2. **Finish iPhone boundaries.** Files hand-off, notifications, purchases, keyboard/safe-area
   behaviour, VoiceOver labels, Dynamic Type review, and recoverable error states.
3. **Add FSRS deliberately.** Treat FSRS as a versioned scheduling engine, not a settings toggle.
   Ship only with official reference vectors, existing-history migration tests, preview parity,
   and an automatic backup before rescheduling.
4. **Close rendering gaps.** Offline MathJax, custom fonts, more template filters, and image
   occlusion come before broader visual polish.
5. **Design sync as a data system.** Offline study must remain authoritative and usable; specify
   tombstones, conflicts, media hashes, full-sync recovery, authentication, and observability
   before implementing a sync button.

## Definition of done for an Anki-facing change

- The exact manual/source page and intended behaviour are identified.
- Compatibility and licensing boundaries are stated in the change.
- Pure logic has deterministic tests; database changes have round-trip or migration tests.
- The matrix status and evidence are updated.
- `npm run quality` passes.
- Only the relevant iPhone smoke path is run and recorded; no blanket manual regression is
  required for a pure-logic change.
