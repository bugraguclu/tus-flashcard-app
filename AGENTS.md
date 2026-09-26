# TusAnkiM engineering contract

This file applies to the entire repository. Every AI agent and human contributor must read
`docs/ANKI_COMPATIBILITY.md` and `docs/IOS_RELEASE_CHECKLIST.md` before changing product
behaviour, scheduling, storage, import/export, or iOS configuration; of
`docs/ANKI_COMPATIBILITY_NOTES.md`, read only the section for the area being changed. Treat
`docs/anki-reference-sources.json` as the canonical source registry.

## Where things live

- Screens are expo-router routes in `app/`: the reviewer is `app/(tabs)/index.tsx`, the deck list
  `app/(tabs)/decks.tsx`, the root layout (startup, error screen) `app/_layout.tsx`; every other
  screen is `app/<name>.tsx` (`editor`, `browser`, `deck-options`, `deck-overview`, `import`,
  `export`, `stats`, `settings`, `backups`, `catalog`, `note-types`, `empty-cards`, ...).
- A screen's pieces (dialogs, rows, toolbars, styles) live in `components/<feature>/`: `editor`,
  `deck-options`, `browser`, `photo-editor`, `import`, `stats`. Shared components sit in `components/`.
- Study data: `lib/studyRepository.ts` re-exports `studyQueue` (today's queue), `studyAnswer`
  (answer, undo, suspend, bury, forget), `filteredDeckQueue`, `browserRepository` (browser queries),
  `studyCardRows` and `studySearchSql` (search to SQL). Queue ordering is `lib/queueBuild.ts`,
  review logging `lib/reviewLogger.ts`.
- Scheduling: `lib/scheduler.ts` (classic), `lib/fsrs*.ts` (FSRS), `lib/ankiState.ts` (card state,
  day numbers). Reviewer behaviour: `lib/reviewer*.ts`; card rendering `components/CardWebView.tsx`
  with `lib/templates.ts` and `lib/cardAppearance.ts`.
- Decks: `lib/deckManager.ts` re-exports `deckStore`, `deckPresets`, `deckLimits`, `filteredDecks`
  (with Custom Study sessions) and `deckTree`. Notes and cards: `lib/noteManager.ts` re-exports
  `noteStore`, `noteTypeStore`, `noteTagStore` and `tusCards` (the editor's save path).
- Import/export: `lib/importApkg.ts` (with `importApkgLossless`, `importApkgMedia`, `apkgFormat`),
  `lib/importNotes.ts`, `lib/importDelimited.ts`, `lib/importFile.ts`, `lib/importLog.ts`,
  `lib/exportAnkiPackage.ts`, `lib/exportNotes.ts`.
- Storage: `lib/db.ts` (SQLite, schema, migrations); `lib/storage.ts` re-exports `settingsStore`
  and `backupData`; backups `lib/backup*.ts`; database check `lib/maintenance*.ts`.
- Catalog and purchases: `lib/bkaCatalog.ts`, `lib/catalog*.ts`, `lib/catalogProtection.ts`,
  `lib/purchasesSdk.ts`. App-wide state: `contexts/AppContext.tsx`. Theme: `constants/theme.ts`.
  Copy: `lib/i18n.ts` keys and inline `l('Türkçe', 'English')`. Web-only code is in `*.web.ts`.

## Working in this repository

- Search with `rg` or `git grep`. A plain `grep -r` from the root also walks `node_modules`, `ios`
  and the worktrees (over 100,000 files). `.ignore` keeps `package-lock.json`, the catalog manifest
  and `docs/archive/` out of `rg`.
- `docs/archive/` holds dated session reports. Do not read it unless asked.
- Keep files under about 800 lines. Move a growing screen's pieces into `components/<feature>/`,
  never into `app/`, where every file is a route. Split a growing `lib/` module by concern; if other
  code imports it, keep it re-exporting its old API, and never let the new modules import the file
  that re-exports them (an import cycle can hand a module an undefined constant at load time).
- Start agent sessions from the repository root, not from `ios/TusAnkiM`.

## Product direction

- TusAnkiM is an independent, local-first alternative to Anki, not an Anki-branded product.
- iPhone is the sole release target. Preserve iOS safe areas, native back gestures, file
  hand-off, keyboard behaviour, accessibility labels, and recoverable data flows.
- Keep web working as the local/CI regression target. `vercel.json` also publishes it as the
  public browser preview linked from the README; that preview is not a release target. Android is
  not a shipped target; retained Android code must not dictate the iOS interaction model.
- Prefer behavioural and package compatibility over copying another client's visual design.
- Do not claim full Anki parity. A capability is “compatible” only when the matrix records it
  as implemented and an automated or named manual test supports the claim.

## Interaction architecture

- Treat changes to deck, tag, flag, time range, sort order, and search inside an existing data
  view as local filter/scope state. They must update the query in place and preserve the other
  active controls; do not implement them with `router.push()` or `router.replace()`.
- Route parameters may establish an entry/deep-link scope. After the screen is open, use
  `useRouteDeckScope` (or the same route-initial/local-afterward model) for scope changes.
- Use navigation only when the user's task actually changes screens: opening an editor, deck
  options/overview, import/export, or another distinct workflow. Selecting a destination for a
  move/import is an operation, not a filter, and may keep its confirmation modal.
- Do not duplicate one scope control with a second breadcrumb/chip filter strip. When a data
  view already has a compact deck selector, keep the hierarchy and search inside that selector;
  changing its value must still update the current view in place.
- Do not route through the Desteler tab merely to reveal a modal. Deck creation launched from a
  picker must complete inside that picker and return the created deck to the original operation.
  Filtered-deck options and Custom Study launched from a deck overview must open over that
  overview, preserve its context, and return there when dismissed.
- On iPhone, routed utility screens that are presented as dismissible sheets must use the native
  form-sheet grabber and pull-down gesture. Custom bottom sheets must use `SwipeDismissSheet` so
  the grabber is both visible and functional. Do not add grabbers to centered dialogs, popovers,
  side panels, or full-screen work surfaces.
- Import and export are canonical full-screen workflows. Every entry point, including Settings
  and the Decks overflow menu, must open `/import` or `/export`; do not implement a second
  import/export path inside the calling screen.

## Source and licensing rules

1. Use the current official Anki manual for behaviour and file-format semantics.
2. Use the AnkiMobile manual for iPhone/iPad interaction decisions.
3. Use `ankitects/anki` for difficult scheduler/package questions and `ankidroid/Anki-Android`
   for Android behaviour only.
4. Anki and AnkiDroid are GPL-family projects. Study their behaviour and formats, but do not
   paste or mechanically translate their implementation into this MIT repository. Record any
   independently derived algorithm with a focused test and source link.
5. Preserve the independent-product disclaimer and never use Anki trademarks as our product
   identity.

## Change discipline

- Scheduling, queue ordering, review logging, import, restore, and catalog ownership are
  data-safety boundaries. Add focused tests before changing them and run `npm run quality`.
- Never silently reinterpret persisted scheduling units or overwrite a collection. A
  destructive import/restore requires a pre-operation backup and explicit user confirmation.
- Imported templates, stable note GUIDs, media references, and review history must survive a
  round trip unless a documented incompatibility says otherwise.
- Keep the app usable offline. Network features must fail closed without blocking local study.
- Use the minimum live-test ladder in `docs/IOS_RELEASE_CHECKLIST.md`; do not substitute a
  simulator tap-through for deterministic unit and integration coverage.
- Update the compatibility matrix row, its section in `docs/ANKI_COMPATIBILITY_NOTES.md` and the
  source registry in the same change when adding or changing an Anki-facing capability.

## Required verification

Run at least:

```bash
npm run quality
```

For release-impacting UI, package import, notifications, purchases, or native configuration,
also follow the targeted iPhone smoke tests in `docs/IOS_RELEASE_CHECKLIST.md`.
