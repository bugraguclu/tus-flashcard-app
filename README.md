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
- Turkish and English interfaces with light and dark themes

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

## Stack

Expo, React Native, TypeScript, Expo Router, SQLite, SQL.js, and Vitest.

## Privacy

Core study data is stored locally and is not sent to an application server by
this project. Users are responsible for their imported content and backups. See
the [privacy policy](docs/privacy.html) for details.

## License

[MIT](LICENSE)
