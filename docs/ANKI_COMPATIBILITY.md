# Anki compatibility baseline

Last reviewed: 2026-09-04

TusAnkiM is an independent Anki alternative with local-first storage and iPhone as its sole
release target; web is a local/CI regression target, also published as a browser preview, not a
release. “Compatible” here means a behaviour or interchange path has explicit code and tests; it
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

One line per area. The full evidence and known divergences for each area live in
[ANKI_COMPATIBILITY_NOTES.md](ANKI_COMPATIBILITY_NOTES.md); open only the section you are changing.
When an Anki-facing capability changes, update its row here and its section there together.

| Area | Status | Key evidence | Next compatibility gate |
| --- | --- | --- | --- |
| [New/learning/relearning/review lifecycle](ANKI_COMPATIBILITY_NOTES.md#newlearningrelearningreview-lifecycle) | Implemented, legacy scheduler | `lib/scheduler.ts`, scheduler and repository tests | Keep golden interval/rollover tests |
| [Answer buttons, next times, counts, undo](ANKI_COMPATIBILITY_NOTES.md#answer-buttons-next-times-counts-undo) | Implemented | `lib/reviewerPresentation.test.ts` | iPhone smoke in both classic and redesigned modes on each reviewer change |
| [Daily limits, learning steps, lapses, leeches, burying](ANKI_COMPATIBILITY_NOTES.md#daily-limits-learning-steps-lapses-leeches-burying) | Implemented | `lib/deckOptionsRules.test.ts`, `lib/studyRepository.scope.test.ts` | Preserve selected-deck/subdeck semantics. |
| [Display/gather/sort order and learn-ahead](ANKI_COMPATIBILITY_NOTES.md#displaygathersort-order-and-learn-ahead) | Implemented | `lib/queueBuild.test.ts`, `lib/exportReviewOrder.test.ts` | Keep the queue's meaning and the dropdown's label in step whenever either changes |
| [Audio, timers and auto advance deck options](ANKI_COMPATIBILITY_NOTES.md#audio-timers-and-auto-advance-deck-options) | Implemented | per-card preset resolution, reviewer timer/auto-advance behavior and package round-trip tests | Keep the study-session activation boundary explicit |
| [Reviewer Timebox](ANKI_COMPATIBILITY_NOTES.md#reviewer-timebox) | Implemented | Anki-aligned wall-clock block, post-answer Continue/Finish checkpoint, per-block repetition count, `lib/timebox.test.ts` | Run the focused iPhone Timebox smoke when reviewer flow changes |
| [FSRS](ANKI_COMPATIBILITY_NOTES.md#fsrs) | Implemented (FSRS-6), audited 2026-09-04 | `lib/fsrsScheduler.test.ts` | Known divergences from that audit: `Set Due Date` is not FSRS-aware (`lib/studyRepository.ts`); |
| [Hierarchical decks and presets](ANKI_COMPATIBILITY_NOTES.md#hierarchical-decks-and-presets) | Implemented | validated/atomic Deck Options save flow, searchable deck picker, explicit deck-vs-preset labels, preset rename scoped to the selected config, … | Continue parent/subdeck limit tests |
| [Per-deck shortcuts](ANKI_COMPATIBILITY_NOTES.md#per-deck-shortcuts) | Implemented | deck overflow action, local `DeckShortcuts` module, Android pinned shortcut and iOS native Apple Shortcuts add flow; the web build copies a link that … | Android launcher approval/open smoke; iPhone Apple Shortcuts add/run smoke |
| [Filtered decks and custom study](ANKI_COMPATIBILITY_NOTES.md#filtered-decks-and-custom-study) | Implemented | `lib/filteredDeckOptions.test.ts`, `lib/studyRepository.scope.test.ts` | Retrievability ascending/descending and relative overdueness are approximated by overdue time relative to the last interval; |
| [Custom study dialog](ANKI_COMPATIBILITY_NOTES.md#custom-study-dialog) | Implemented | `lib/customStudy.test.ts`, `lib/deckManager.options.test.ts`, `lib/storage.roundtrip.test.ts` … | Keep the spec test in step with upstream when Anki changes an option |
| [Note types, conditional templates, cloze, typed answer](ANKI_COMPATIBILITY_NOTES.md#note-types-conditional-templates-cloze-typed-answer) | Implemented | `lib/editorToolbar.test.ts`, `lib/editorFieldStyle.test.ts`, `lib/editorDynamicFields.test.ts` | Validate more add-on filters and complex templates |
| [HTML, images, audio, video, TTS](ANKI_COMPATIBILITY_NOTES.md#html-images-audio-video-tts) | Implemented subset with an untrusted-content boundary | `lib/localMediaDocument.test.ts`, `lib/cardContentSecurity.test.ts`, `lib/mediaFilename.test.ts` … | Add offline MathJax and custom-font runtime QA without weakening CSP. |
| [MathJax/LaTeX runtime rendering](ANKI_COMPATIBILITY_NOTES.md#mathjaxlatex-runtime-rendering) | Not implemented | Source fields are preserved on import | Bundle an offline renderer; never depend on a CDN |
| [Whiteboard/scratchpad and drawing attachment](ANKI_COMPATIBILITY_NOTES.md#whiteboardscratchpad-and-drawing-attachment) | Implemented subset | `lib/blankCanvas.test.ts`, `lib/photoEditor.test.ts`, `lib/reviewerTimers.test.ts` … | Apple Pencil-only mode is pending. |
| [Browser, card/note table modes, tags, flags, marks, suspend/bury, reposition](ANKI_COMPATIBILITY_NOTES.md#browser-cardnote-table-modes-tags-flags-marks-suspendbury-reposition) | Implemented subset | `lib/cardSearchMatch.test.ts` | Expand full Anki search grammar and flag naming. |
| [Empty Cards maintenance](ANKI_COMPATIBILITY_NOTES.md#empty-cards-maintenance) | Implemented subset | Canonical `/empty-cards` full-screen route; reports cards whose generated front/cloze/template is no longer valid, deletes cards without deleting … | Add a named iPhone smoke test for VoiceOver, scan failure and destructive deletion |
| [`.apkg` import/export with media and scheduling](ANKI_COMPATIBILITY_NOTES.md#apkg-importexport-with-media-and-scheduling) | Implemented subset with bounded archive and SQLite validation | package round-trip, backup-source export, archive-security, SQLite-security and import integration tests; a stored snapshot can be exported without … | Maintain fixtures from current Anki releases and physical-device large-package smoke |
| [`.colpkg` replacement](ANKI_COMPATIBILITY_NOTES.md#colpkg-replacement) | Implemented with explicit destructive confirmation and pre-operation safety backup | import confirmation and backup tests | Add real-device large-package smoke |
| [CSV/TSV/TXT import/export](ANKI_COMPATIBILITY_NOTES.md#csvtsvtxt-importexport) | Implemented | `lib/importNotes.test.ts`, `lib/importLog.test.ts`, `lib/importDelimited.test.ts` … | Keep metadata-header fixtures; the mapping table draws at most 24 columns |
| [Import screen and Import Log](ANKI_COMPATIBILITY_NOTES.md#import-screen-and-import-log) | Implemented | `lib/importLog.test.ts`, `lib/importFile.test.ts` | "Merge note types" is not offered: a schema-conflicting note type is imported as a separate copy instead, so no inert control is shown. |
| [iOS Files “Open in” hand-off](ANKI_COMPATIBILITY_NOTES.md#ios-files-open-in-hand-off) | Implemented | document UTI config and `importFile` tests; `.zip` is accepted as a package the way Anki's own file dialog does. The web build takes the same files … | Verify once on a physical iPhone per release |
| [Local automatic/manual backup and restore](ANKI_COMPATIBILITY_NOTES.md#local-automaticmanual-backup-and-restore) | Implemented with strict row validation | backup-validation, backup-source export, backup and storage round-trip tests; Share opens the canonical export workflow over the selected snapshot | Verify export options, Files share destination and plaintext warning per release |
| [Collection/database check](ANKI_COMPATIBILITY_NOTES.md#collectiondatabase-check) | Implemented subset | `lib/maintenance.test.ts`, `lib/maintenanceWorkflow.test.ts`, `lib/noteManager.searchIndex.test.ts` … | Anki additionally regenerates cards a note type's templates should produce and deletes notes whose note type is gone; |
| [iPhone reviewer preferences and external automation](ANKI_COMPATIBILITY_NOTES.md#iphone-reviewer-preferences-and-external-automation) | Implemented subset | `lib/reviewerTouchControls.test.ts`, `lib/reviewerAddNote.test.ts`, `lib/reviewerSurface.test.ts` … | Add a native Share extension before broader parity claims |
| [Reviewer keyboard shortcuts](ANKI_COMPATIBILITY_NOTES.md#reviewer-keyboard-shortcuts) | Implemented subset | `lib/hardwareKeyboard.test.ts` | Anki's other study keys (`e` edit, `=` bury note, `!` suspend note, `o` options) are not bound yet |
| [iPhone study notifications](ANKI_COMPATIBILITY_NOTES.md#iphone-study-notifications) | Implemented | `lib/studyNotifications.web.test.ts` | Verify provisional and fully authorized delivery on a physical iPhone; vibration and LED/flash remain system-owned iOS settings |
| [Statistics and card info](ANKI_COMPATIBILITY_NOTES.md#statistics-and-card-info) | Implemented subset | `lib/statsSeries.test.ts` | Add Calendar, True Retention and FSRS-specific views with reference fixtures before a full-parity claim; |
| [AnkiWeb synchronization](ANKI_COMPATIBILITY_NOTES.md#ankiweb-synchronization) | Not implemented | Local-only architecture | Requires a documented protocol/backend, conflict model, encryption and recovery plan |
| [Profiles](ANKI_COMPATIBILITY_NOTES.md#profiles) | Not implemented | Single local collection; no inert profile toggle is exposed | Design isolation, migration, backup and recovery before UI |
| [Shared-deck marketplace](ANKI_COMPATIBILITY_NOTES.md#shared-deck-marketplace) | Product-specific catalog only | `lib/catalogProtection.test.ts`, `lib/noteManager.catalogTags.test.ts` | Do not present it as AnkiWeb shared decks |
| [Image Occlusion note authoring](ANKI_COMPATIBILITY_NOTES.md#image-occlusion-note-authoring) | Not implemented | — | Add a native/offline editor and package fixtures |

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
- The matrix row and its section in `docs/ANKI_COMPATIBILITY_NOTES.md` are updated.
- `npm run quality` passes.
- Only the relevant iPhone smoke path is run and recorded; no blanket manual regression is
  required for a pure-logic change.
