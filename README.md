# TusAnkiM

TusAnkiM is an Anki-inspired, local-first spaced-repetition app for TUS and other
medical exam preparation. It runs on iOS, Android, and the web from a single
Expo codebase.

The project is independent and is not affiliated with or endorsed by Anki or
Ankitects.

## Features

- Anki-style scheduling with learning steps, lapses, leeches, sibling burying,
  deck limits, and answer undo
- Hierarchical and filtered decks with deck-specific study options
- `.apkg`, CSV, and TSV imports; JSON backups and safe restore
- Rich cards with HTML, images, audio, drawing, templates, flags, and tags
- Search, study history, streaks, and deck- and subject-level statistics
- Offline-first storage using SQLite on native platforms and IndexedDB on web
- Turkish and English interfaces, with a light release theme and dark-theme foundation

## Anki compatibility and iOS direction

TusAnkiM prioritizes behavioural and package interoperability without claiming complete Anki
parity or copying Anki's interface. The maintained [compatibility matrix](docs/ANKI_COMPATIBILITY.md)
records implemented and planned capabilities; [iOS verification](docs/IOS_RELEASE_CHECKLIST.md)
defines the smallest reliable live-test set. Canonical upstream manuals and repositories are kept
in a [machine-readable source registry](docs/anki-reference-sources.json) and enforced for future
AI and contributor work by [AGENTS.md](AGENTS.md).

On iOS, `.apkg`, `.colpkg`, CSV, TSV, and TXT files can be handed to TusAnkiM directly from the
Files share/open flow. FSRS and AnkiWeb synchronization are not currently implemented and are
listed explicitly in the compatibility roadmap.

## Optional card pack

The app itself is free. The pre-made BKA TUS pack (9,583 cards across 12 courses
and 60 author-tagged subdecks) is currently unlocked locally without payment or a store check.
A pinned `BKA TUS` row opens the catalog preview; “Unlock cards for free” replaces the sample
with the full catalog and preserves trial review progress. The dormant RevenueCat path can be
re-enabled later with an explicit build flag. Installation never touches the learner's own decks,
notes, or history.

## Development

Requires Node.js 20 or newer.

```bash
git clone https://github.com/bugraguclu/tus-flashcard-app.git
cd tus-flashcard-app
npm ci
npm start
```

Platform commands:

```bash
npm run ios
npm run android
npm run web
```

Validation:

```bash
npm run check
npm run build:web
npm run doctor
```

Regenerate the card pack's build-time inventory after replacing the package:

```bash
npm run build:catalog-manifest
```

## Stack

Expo, React Native, TypeScript, Expo Router, SQLite, SQL.js, and Vitest.

## Privacy

Core study data is stored locally and is not sent to an application server by
this project. Users are responsible for their imported content and backups. See
the [privacy policy](docs/privacy.html) for details.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). The current
plain-language security review and verification status are recorded in
[docs/SECURITY_AUDIT_TR.md](docs/SECURITY_AUDIT_TR.md).

## License

[MIT](LICENSE)
