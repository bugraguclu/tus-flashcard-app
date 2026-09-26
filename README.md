<div align="center">

<img src="public/icons/icon-192.png" width="104" height="104" alt="TusAnkiM app icon">

# TusAnkiM

**Local-first spaced repetition for TUS and medical exam preparation.**

An independent, Anki-compatible flashcard app built for iPhone, with the same app running in the browser.

[**Open the live preview →**][preview]

[![CI](https://github.com/bugraguclu/tus-flashcard-app/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/bugraguclu/tus-flashcard-app/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bugraguclu/tus-flashcard-app/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/bugraguclu/tus-flashcard-app/actions/workflows/codeql.yml)
[![Live preview](https://img.shields.io/badge/preview-live-000000?logo=vercel&logoColor=white)][preview]
[![Platform: iOS](https://img.shields.io/badge/platform-iOS-lightgrey?logo=apple)](#platforms)
[![Expo SDK 57](https://img.shields.io/badge/Expo%20SDK-57-000020?logo=expo&logoColor=white)](https://docs.expo.dev/)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Live preview](#live-preview) · [Features](#features) · [Anki compatibility](#anki-compatibility) · [Getting started](#getting-started) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## Overview

TusAnkiM helps medical students prepare for TUS (Tıpta Uzmanlık Sınavı, Turkey's medical
specialty exam) with spaced repetition. It follows Anki's scheduling behaviour, reads and writes
Anki packages, and keeps the whole collection on the device. There is no account and no server,
and it works fully offline.

An optional, ready-made TUS card pack (9,575 cards across 12 courses and 106 subdecks) installs
for free from inside the app, next to the learner's own decks and without touching them.

### Platforms

| Platform | Role |
| --- | --- |
| **iPhone** | The release target. Native file hand-off, Apple Shortcuts, notifications and data protection. |
| **Web** | The same code base in the browser. Published as the [live preview][preview] and built in CI as the regression target. It is not a supported release. |

Android code that is still in the repository is not shipped and does not drive the design.

## Live preview

[**tusankim.vercel.app**][preview] serves the production web build of `master` and is redeployed
on every push.

- **Private by design.** The collection lives in your browser's IndexedDB. Nothing is uploaded,
  and the page's Content-Security-Policy allows no third-party origins.
- **Works offline.** After the first visit, a service worker starts the app without a network.
  You can also install it to your home screen or dock.
- **Real imports.** Drop an `.apkg`, `.colpkg`, CSV, TSV or TXT file onto the window to import it.
- **One tab at a time.** If the app is already open in another tab, the new tab shows a warning
  and does not save changes.

Reminders only fire while a tab is open. Native iOS integrations such as Apple Shortcuts and
screenshot protection exist only in the iPhone app.

## Features

### Study and scheduling

- Anki's card lifecycle: new, learning, review and relearning cards, with learning steps,
  lapses, leeches, sibling burying, daily limits and learn-ahead
- Two schedulers: Anki's classic algorithm and **FSRS-6** with memory state, rescheduling and
  parameter optimisation
- Anki's gather and sort orders, including all thirteen review orders
- Filtered decks and Anki's six Custom Study options
- Answer undo, Timebox, auto advance, typed answers, text-to-speech and an on-card whiteboard

### Cards and editing

- Note types with conditional templates, cloze deletions, typed-answer and reversed cards
- A rich text editor with Home, Styles and Insert tabs: formatting, lists, tables, links,
  callouts and a raw HTML view
- Images, audio recording, photo annotation and blank drawing pages
- A card browser with Anki-style search (`deck:`, `tag:`, `is:`, `prop:`, `added:` and more),
  card and note table modes, flags, tags, suspend, bury and reposition

### Import, export and data safety

- `.apkg` import and export with media and scheduling, and `.colpkg` collection replacement
- CSV, TSV and TXT import and export with Anki's importer options and per-note outcomes
- Automatic daily backups, manual backups and a validated restore
- A backup before every destructive import or restore, and never a silent overwrite
- Database check and repair

### Statistics

- Today's summary, daily streak, future due, reviews and review time, answer buttons,
  intervals, card counts and added cards
- A study calendar built from the review log, and per-card info

### iPhone integration

- Open `.apkg`, `.colpkg`, CSV, TSV and TXT files straight from the Files app
- Per-deck Apple Shortcuts and `tusankim://` URL automation with x-callback-url
- Local study reminders, and text-to-speech with Enhanced and Premium voices
- VoiceOver labels, Dynamic Type, and Light, Dark and System themes
- Turkish and English interface
- Collection encrypted at rest (`NSFileProtectionComplete`), and screenshot and recording
  protection for the card pack

## Anki compatibility

TusAnkiM aims for behavioural and file-format compatibility with Anki, not a copy of its
interface, and it does **not** claim full parity. Here is a summary. The test-backed
[compatibility matrix](docs/ANKI_COMPATIBILITY.md) is the source of truth.

| Area | Status |
| --- | --- |
| Scheduling lifecycle, limits, steps, leeches, burying | Implemented |
| FSRS-6 scheduling, memory state and optimiser | Implemented, with known divergences documented |
| Filtered decks and Custom Study | Implemented |
| Note types, conditional templates, cloze, typed answers | Implemented |
| `.colpkg` replacement | Implemented, with confirmation and a safety backup |
| CSV / TSV / TXT import and export | Implemented |
| `.apkg` import and export with media and scheduling | Subset, with bounded archive and SQLite validation |
| Card browser and search grammar | Subset |
| HTML, images, audio, video and TTS | Subset, behind an untrusted-content boundary |
| Statistics and card info | Subset |
| MathJax / LaTeX rendering | Not yet (source is preserved on import) |
| Image Occlusion authoring | Not yet |
| AnkiWeb sync and profiles | Not yet |

Behaviour is checked against the official [Anki manual](https://docs.ankiweb.net/), the
[AnkiMobile manual](https://docs.ankimobile.net/) and the upstream sources listed in the
[reference registry](docs/anki-reference-sources.json).

## Tech stack

| Layer | Technology |
| --- | --- |
| App | [Expo](https://expo.dev/) SDK 57, React Native 0.86, React 19, TypeScript (strict) |
| Navigation | Expo Router: file-based routes and a static web export |
| Storage | SQLite through `expo-sqlite` on iOS, and [sql.js](https://sql.js.org/) (WebAssembly) persisted to IndexedDB on the web |
| Packages | JSZip and fzstd for Anki's zip and zstd-compressed collections |
| Rendering | `react-native-webview` for sandboxed card and editor documents, and `react-native-svg` for vector graphics |
| Native modules | Local Expo modules for deck shortcuts and screen capture protection |
| Testing | Vitest (1,500+ tests), `tsc`, and a native iOS configuration verifier |
| Delivery | GitHub Actions, CodeQL and Dependabot. Vercel hosts the web preview, and `eas.json` holds the iOS build profiles |

## Getting started

### Prerequisites

- Node.js 24 (pinned in [`.nvmrc`](.nvmrc)) and npm
- For the native app: macOS with Xcode and an iOS Simulator

### Install and run

```bash
git clone https://github.com/bugraguclu/tus-flashcard-app.git
cd tus-flashcard-app
npm ci
```

```bash
npm run web
```

```bash
npm run ios
```

`npm run web` starts the app in the browser. `npm run ios` builds and runs the native app on the
Simulator. `npm start` opens the Expo dev server. Most screens also run in Expo Go, but the native
integrations need a development build. [Sharing a build with a remote tester through Expo Go](docs/EXPO_GO_TEST_PAYLASIMI.md)
is documented in Turkish.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Build and run the native iOS app |
| `npm run web` | Run the app in the browser |
| `npm run build:web` | Export the production web build to `dist/` |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | Type-check the project |
| `npm run check` | Type-check, then run the tests |
| `npm run quality` | The merge gate: `check`, then the iOS configuration and source-registry verifier |
| `npm run verify:app-store` | Stricter pre-submission check of store metadata and legal pages |
| `npm run doctor` | Run `expo-doctor` |
| `npm run share` | Serve a build to a remote tester through Expo Go |
| `npm run build:catalog-manifest` | Regenerate the card pack's inventory after replacing the package |

## Architecture

```text
app/          Expo Router screens: decks, study, browser, editor, statistics, import/export, settings
components/   Reusable UI: reviewer, rich text editor, charts, sheets and pickers
lib/          Domain logic with co-located tests: schedulers, queue building, search, storage
              and migrations, package import/export, backups, statistics, content sanitising
hooks/        Screen-level hooks: startup, localisation, route scope, notifications, screen guard
contexts/     App-wide state provider
constants/    Theme tokens for the light and dark palettes
locales/      Native app name and permission strings in Turkish and English
modules/      Local Expo native modules: deck shortcuts and screen guard
public/       Web app manifest, icons and service worker
scripts/      Release verification, card pack tooling and Expo Go sharing
test/         Test stubs and the sql.js harness
docs/         Compatibility matrix, iOS release checklist, audits and legal pages
```

- **One code base.** Platform differences live behind `.web.ts` splits and Metro resolver
  overrides, so screens import a single module on every platform.
- **One schema.** Notes, cards, decks and the review log use Anki-compatible tables with
  versioned migrations. `expo-sqlite` runs them natively and sql.js runs them in the browser.
- **Untrusted content stays contained.** Card HTML from imported packages is sanitised and
  rendered in isolated documents under a strict Content-Security-Policy. Scripts, network loads
  and navigation are blocked.

## Quality and testing

`npm run quality` is the gate for every change. It runs the TypeScript compiler, more than 1,500
deterministic tests, and a verifier for the Anki source registry and the native iOS
configuration: file protection, App Transport Security, document types and the packed card pack.

GitHub Actions runs the gate on pushes to `master` and on every pull request, together with
`npm audit`, npm registry signature verification and a production web build. CodeQL scans
pushes and pull requests to `master` and runs weekly, and Dependabot keeps npm packages and
actions current.

Live testing follows a deliberately small, targeted ladder that is described in the
[iOS release checklist](docs/IOS_RELEASE_CHECKLIST.md). Unit and integration coverage comes
first. Simulator and device runs are for native boundaries only.

## Deployment

**Web preview.** [`vercel.json`](vercel.json) configures the Vercel project. It installs with
`npm ci` and builds with `npm run build:web`. The export has one HTML file per route, so clean
URLs are turned on, and the app's own not-found screen becomes `404.html`. Content-hashed bundles
and assets are cached as immutable, and the page's Content-Security-Policy comes from
[`app/+html.tsx`](app/+html.tsx).

**iOS.** [`eas.json`](eas.json) defines the development, preview and production build profiles.
Before submitting, run `npm run verify:app-store` and the release smoke in the
[iOS release checklist](docs/IOS_RELEASE_CHECKLIST.md).

## Roadmap

The [priority roadmap](docs/ANKI_COMPATIBILITY.md#priority-roadmap) is kept next to the
compatibility matrix:

1. Keep the collection safe with transactional imports, safety backups and round-trip tests.
2. Finish the iPhone boundaries: Files hand-off, notifications, keyboard and safe areas,
   VoiceOver and Dynamic Type.
3. Close the rendering gaps: offline MathJax, custom fonts, more template filters and Image
   Occlusion.
4. Design sync as a data system, with offline study kept authoritative, before any sync button
   ships.

## Contributing

Issues and pull requests are welcome. Before changing behaviour, please read:

- [`AGENTS.md`](AGENTS.md), the engineering contract for humans and AI agents alike
- the [compatibility matrix](docs/ANKI_COMPATIBILITY.md) and the
  [iOS release checklist](docs/IOS_RELEASE_CHECKLIST.md)

Scheduling, queue ordering, review logging, import, restore and card pack ownership are
data-safety boundaries. Add focused tests before changing them, and run `npm run quality` before
you open a pull request.

Anki and AnkiDroid are GPL-family projects. You may study their behaviour and file formats, but
do not copy or mechanically translate their code into this MIT repository.

## Security and privacy

- **Local-first.** Study data stays on the device. There is no account, no analytics and no
  tracking, and the iOS privacy manifest declares no collected data. See the
  [privacy policy](docs/privacy.html).
- **Hardened imports.** Packages are size-bounded and validated before they touch the
  collection, and destructive operations take a backup first.
- **Reporting.** Please report vulnerabilities privately as described in
  [SECURITY.md](SECURITY.md). The latest review, in Turkish, is in
  [docs/SECURITY_AUDIT_TR.md](docs/SECURITY_AUDIT_TR.md).

## License

The source code is released under the [MIT License](LICENSE). The in-app card pack is covered by
the app's [terms of use](docs/terms.html).

TusAnkiM is an independent project. It is not affiliated with, or endorsed by, Anki or Ankitects.

[preview]: https://tusankim.vercel.app
