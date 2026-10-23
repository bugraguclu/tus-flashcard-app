# Anki compatibility baseline

Last reviewed: 2026-10-01

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
| [New/learning/relearning/review lifecycle](ANKI_COMPATIBILITY_NOTES.md#newlearningrelearningreview-lifecycle) | Implemented, legacy scheduler | `lib/scheduler.ts`, `lib/ai2Scheduling.test.ts` (due-based elapsed, filtered early review, persisted fuzz labels), `lib/ai2Safety.test.ts` (Grade Now clears suspend/bury; interday queue restoration), scheduler and repository tests | Keep golden interval/rollover tests |
| [Answer buttons, next times, counts, undo](ANKI_COMPATIBILITY_NOTES.md#answer-buttons-next-times-counts-undo) | Implemented | `lib/ai2Safety.test.ts` (undo preserves later edits/deletions), `lib/reviewerPresentation.test.ts`, `lib/webDb.test.ts` (durable answer/revlog and retry rollback) | iPhone smoke in both classic and redesigned modes on each reviewer change |
| [Daily limits, learning steps, lapses, leeches, burying](ANKI_COMPATIBILITY_NOTES.md#daily-limits-learning-steps-lapses-leeches-burying) | Implemented with uncapped new cards (product policy) | `lib/ai2Queue.test.ts` (answer-time sibling queue priority), `lib/deckOptionsRules.test.ts`, `lib/studyRepository.scope.test.ts`, `lib/studyQueue.dailyLimits.test.ts`, `lib/deckManager.options.test.ts` | Preserve review caps, selected-deck/subdeck semantics and imported limit metadata; new cards remain available after 20 answers. |
| [Display/gather/sort order and learn-ahead](ANKI_COMPATIBILITY_NOTES.md#displaygathersort-order-and-learn-ahead) | Implemented with bounded new-card window | `lib/ai2Queue.test.ts` (full review-key gather, limits without sibling-slot loss), `lib/newCardDeckOrder.test.ts` (deck-list gather order and window), `lib/queueBuild.test.ts`, `lib/exportReviewOrder.test.ts` | Keep the queue's meaning and the dropdown's label in step whenever either changes |
| [Audio, timers and auto advance deck options](ANKI_COMPATIBILITY_NOTES.md#audio-timers-and-auto-advance-deck-options) | Implemented | `lib/reviewerAudio.test.ts`, `lib/reviewerTimers.test.ts`, `lib/reviewerDwellTimer.test.ts` (side-aware playlists, paused modal-free auto advance), per-card preset and package tests | Keep the study-session activation boundary explicit |
| [Reviewer Timebox](ANKI_COMPATIBILITY_NOTES.md#reviewer-timebox) | Implemented | Anki-aligned wall-clock block, post-answer Continue/Finish checkpoint, per-block repetition count, `lib/timebox.test.ts` | Run the focused iPhone Timebox smoke when reviewer flow changes |
| [FSRS](ANKI_COMPATIBILITY_NOTES.md#fsrs) | Implemented (FSRS-6); scheduling and optimizer measured against Anki 26.09.3 | `lib/fsrsAnkiParity.test.ts` replays the 26.09.3 oracle, including six exact scalar f32 probes; `lib/fsrsCardInfo.test.ts` proves read-only missing-state display; optimizer: `lib/fsrsTraining.test.ts` against Anki 26.09.3, max parameter error 4.77e-7 | Fifth-pass items 3, 5–8 and 10 (Set Due Date, Change Deck recompute, Check Database `lrt`, future ignore-before date, scheduling-free export, retrievability filtered orders) remain open, see `AUDIT_FSRS_ANKI_PARITY.md`. Run the named iPhone Card Info smoke. Last-bit exp/pow noise and the uncapped new-card policy remain documented. |
| [Hierarchical decks and presets](ANKI_COMPATIBILITY_NOTES.md#hierarchical-decks-and-presets) | Implemented | shared phone/web deck-count columns; [layout smoke](ui-layout-review/README.md); validated Deck Options and searchable picker; anki-ai1-deletion-history; anki-ai1-deck-names; anki-ai1-preset-steps; anki-ai1-deletion-hardening; anki-ai1-deep-deck-paths | Continue parent/subdeck limit tests |
| [Per-deck shortcuts](ANKI_COMPATIBILITY_NOTES.md#per-deck-shortcuts) | Implemented | deck overflow action, local `DeckShortcuts` module, Android pinned shortcut and iOS native Apple Shortcuts add flow; the web build copies a link that … | Android launcher approval/open smoke; iPhone Apple Shortcuts add/run smoke |
| [Filtered decks and custom study](ANKI_COMPATIBILITY_NOTES.md#filtered-decks-and-custom-study) | Implemented subset: fixed virtual membership | `lib/filteredDeckOptions.test.ts`, `lib/studyRepository.scope.test.ts`, `lib/ankiSortKeys.test.ts`, `lib/filteredSearchSafety.test.ts` (an invalid saved search gathers nothing; dialogs refuse it), `lib/ai2Filtered.test.ts` (fixed reservations, no refill, Empty, physical odue materialization/undo, home presets/due counters), `lib/ai2FilteredSearch.test.ts` (quoted deck, note/card/field/nid/introduced SQL) | New cards in the due and relative-overdueness orders: positions are read against days since 1970, not since the collection's creation; |
| [Custom study dialog](ANKI_COMPATIBILITY_NOTES.md#custom-study-dialog) | Implemented | `lib/customStudy.test.ts`, `lib/deckManager.options.test.ts`, `lib/storage.roundtrip.test.ts` … | Keep the spec test in step with upstream when Anki changes an option |
| [Note types, conditional templates, cloze, typed answer](ANKI_COMPATIBILITY_NOTES.md#note-types-conditional-templates-cloze-typed-answer) | Implemented subset | `lib/editorToolbar.test.ts`, `lib/editorFieldStyle.test.ts`, `lib/editorDynamicFields.test.ts`, `lib/noteManager.newTypes.test.ts` (independent sibling decks); anki-ai1-card-generation; anki-ai1-template-rules; anki-ai1-note-checksum; anki-ai1-editor-type-memory; anki-ai1-template-special-fields; anki-ai1-note-mutation-preflight; anki-ai1-clozeless-warning; anki-ai1-field-rename | Validate more add-on filters and complex templates |
| [HTML, images, audio, video, TTS](ANKI_COMPATIBILITY_NOTES.md#html-images-audio-video-tts) | Implemented subset with an untrusted-content boundary | `lib/localMediaDocument.test.ts`, `lib/cardContentSecurity.test.ts`, `lib/mediaFilename.test.ts`, `lib/webHtmlFrame.test.ts`; card/editor HTML updates keep Safari history owned by the app; anki-ai1-editor-source; anki-ai1-editor-build-csp | Add offline MathJax and custom-font runtime QA without weakening CSP. |
| [Reviewer card display: page, night mode, typed-answer comparison, scroll to answer](ANKI_COMPATIBILITY_NOTES.md#reviewer-card-display-page-night-mode-typed-answer-comparison-scroll-to-answer) | Implemented | `lib/cardAppearance.test.ts`, `lib/templates.test.ts`, `lib/reviewerPresentation.test.ts` | Run the reviewer card display smoke in both themes on each reviewer change |
| [MathJax/LaTeX runtime rendering](ANKI_COMPATIBILITY_NOTES.md#mathjaxlatex-runtime-rendering) | Not implemented | Source fields are preserved on import | Bundle an offline renderer; never depend on a CDN |
| [Whiteboard/scratchpad and drawing attachment](ANKI_COMPATIBILITY_NOTES.md#whiteboardscratchpad-and-drawing-attachment) | Implemented subset | `lib/blankCanvas.test.ts`, `lib/photoEditor.test.ts`, `lib/reviewerTimers.test.ts` … | Apple Pencil-only mode is pending. |
| [Browser, card/note table modes, tags, flags, marks, suspend/bury, reposition](ANKI_COMPATIBILITY_NOTES.md#browser-cardnote-table-modes-tags-flags-marks-suspendbury-reposition) | Implemented subset | `lib/searchParitySafety.test.ts`, `lib/searchQuery.test.ts`, `lib/browserSelection.test.ts`: shared all-field search, Unicode tags, invalid-query errors, safe picker drafts, original positions and sibling reposition, `lib/cardSearchMatch.test.ts`; search-result counts and accessible selection states in [user journey verification](USER_JOURNEY_FIXES.md) | Profile large iPhone collections and expand remaining search grammar/flag naming. |
| [Empty Cards maintenance](ANKI_COMPATIBILITY_NOTES.md#empty-cards-maintenance) | Implemented subset | Canonical `/empty-cards` full-screen route; reports cards whose generated front/cloze/template is no longer valid, deletes cards without deleting …; anki-ai1-empty-card-preservation; anki-ai1-central-card-deletion | Add a named iPhone smoke test for VoiceOver, scan failure and destructive deletion |
| [`.apkg` import/export with media and scheduling](ANKI_COMPATIBILITY_NOTES.md#apkg-importexport-with-media-and-scheduling) | Implemented subset with bounded archive and SQLite validation | `lib/ankiTransferSafety.test.ts` covers safe updates and media-fixup edit stamps, stable schema identity, preset reuse, local/round-trip deck limits, due units, progress stripping and sibling preservation; `lib/importApkg.ankiExport.test.ts` imports Anki 26.05's own exports in both package formats; `lib/exportAnkiPackage.ankiImport.test.ts` pins what Anki needs to accept ours; round-trip and security tests … | Re-record the Anki export fixtures and import an app export into each new Anki release; physical-device large-package smoke |
| [`.colpkg` replacement](ANKI_COMPATIBILITY_NOTES.md#colpkg-replacement) | Implemented with explicit destructive confirmation and a restorable pre-operation safety backup | import confirmation and backup tests; `lib/destructiveBackupSafety.test.ts` (a damaged collection is not replaced) | Add real-device large-package smoke |
| [CSV/TSV/TXT import/export](ANKI_COMPATIBILITY_NOTES.md#csvtsvtxt-importexport) | Implemented | `lib/ankiTransferSafety.test.ts` (unmapped fields, tag preservation, comment-safe export, picker/header priority and HTML detection), `lib/importNotes.test.ts`, `lib/importDelimited.test.ts` | Keep metadata-header fixtures; the mapping table draws at most 24 columns |
| [Import screen and Import Log](ANKI_COMPATIBILITY_NOTES.md#import-screen-and-import-log) | Implemented | `lib/importLog.test.ts`, `lib/importFile.test.ts`, `lib/webDb.test.ts`, `lib/collectionWrite.test.ts` (durable completion, storage errors, read-only rejection) | "Merge note types" is not offered: a schema-conflicting note type is imported as a separate copy instead, so no inert control is shown. |
| [iOS Files “Open in” hand-off](ANKI_COMPATIBILITY_NOTES.md#ios-files-open-in-hand-off) | Implemented | document UTI config and `importFile` tests; `.zip` is accepted as a package the way Anki's own file dialog does. The web build takes the same files … | Verify once on a physical iPhone per release |
| [Local automatic/manual backup and restore](ANKI_COMPATIBILITY_NOTES.md#local-automaticmanual-backup-and-restore) | Implemented with 30-minute default, layered retention and strict restore validation | `lib/backupSafety.test.ts`: recovery-only raw rows, read failures, `lib/destructiveBackupSafety.test.ts` (Reset/replacement need a restorable copy; Repair and restore may keep a recovery copy), >50 MiB snapshots, catalog learner metadata/pending overlays, atomic progress persistence, rejection without live rewrite, schema-9 restore; backup and storage round-trip tests | Verify export options, Files share destination and plaintext warning per release |
| [Collection/database check](ANKI_COMPATIBILITY_NOTES.md#collectiondatabase-check) | Implemented subset | `lib/maintenance.test.ts`, `lib/maintenanceWorkflow.test.ts`, `lib/noteManager.searchIndex.test.ts` …; anki-ai1-cardless-note-repair | Regenerate all missing template cards and recover notes with missing note types; |
| [iPhone reviewer preferences and external automation](ANKI_COMPATIBILITY_NOTES.md#iphone-reviewer-preferences-and-external-automation) | Implemented subset | `lib/reviewerTouchControls.test.ts`, `lib/reviewerAddNote.test.ts`, `lib/reviewerSurface.test.ts`; [phone title/time smoke](ui-layout-review/README.md) | Add a native Share extension before broader parity claims |
| [Reviewer keyboard shortcuts](ANKI_COMPATIBILITY_NOTES.md#reviewer-keyboard-shortcuts) | Implemented subset | `lib/hardwareKeyboard.test.ts`, `lib/keyboardSettingsSection.test.ts`; keyboard binding settings on iPhone and web | Anki's other study keys (`e` edit, `=` bury note, `!` suspend note, `o` options) are not bound yet |
| [iPhone study notifications](ANKI_COMPATIBILITY_NOTES.md#iphone-study-notifications) | Implemented | `lib/studyNotifications.web.test.ts` | Verify provisional and fully authorized delivery on a physical iPhone; vibration and LED/flash remain system-owned iOS settings |
| [Statistics and card info](ANKI_COMPATIBILITY_NOTES.md#statistics-and-card-info) | Implemented subset | `lib/statsAuditSafety.test.ts` (IST-1–IST-6; existing empty snapshot API retained), `lib/statsSeries.test.ts`, `lib/chartPressPoint.test.ts`; [Statistics simplicity smoke](STATS_UI_VERIFICATION.md) | Add Calendar, True Retention and FSRS-specific views with reference fixtures before a full-parity claim; |
| [AnkiWeb synchronization](ANKI_COMPATIBILITY_NOTES.md#ankiweb-synchronization) | Not implemented | Local-only architecture | Requires a documented protocol/backend, conflict model, encryption and recovery plan |
| [Profiles](ANKI_COMPATIBILITY_NOTES.md#profiles) | Not implemented | Single local collection; no inert profile toggle is exposed | Design isolation, migration, backup and recovery before UI |
| [Shared-deck marketplace](ANKI_COMPATIBILITY_NOTES.md#shared-deck-marketplace) | Product-specific catalog; purchased note fields editable | `lib/ai2CatalogStudy.test.ts` (trial scheduling and tag deltas without content unlock), `lib/catalogEditing.test.ts`, `lib/catalogEditorMenu.test.ts`, `lib/bkaCatalog.install.test.ts`, catalog protection/tag tests | Do not present it as AnkiWeb shared decks |
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
