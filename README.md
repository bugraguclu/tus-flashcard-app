# TusAnkiM

A cross-platform spaced repetition flashcard app built for TUS (Tipta Uzmanlık Sınavı) preparation. Powered by the Anki V3 scheduling algorithm, it runs on iOS, Android, and Web with a single codebase.

## Features

### Spaced Repetition (Anki V3)
- Faithful port of the Anki V3 scheduling algorithm, verified against the Rust source (`rslib/src/scheduler/states/`)
- Four answer grades: Again / Hard / Good / Easy
- Early and non-early review paths with correct interval formulas
- Deterministic fuzz for non-early reviews (DJB2 hash, day + card ID seeded)
- Configurable learning steps, lapse steps, and graduating intervals
- Ease factor management with named constants and 1.3 floor
- Anki serving order: due learning cards first, learn-ahead cards last
- Configurable learn-ahead limit, queue order (mix / new first / new last), and new card order
- Per-deck configuration overrides
- Leech detection and sibling burying
- Transaction-safe undo for the last review
- Day rollover handling (configurable rollover hour, foreground-aware)

### SQLite Storage
- Local-first architecture with full offline support
- `expo-sqlite` on iOS/Android, `sql.js` (WebAssembly) on web
- WAL journal mode on native for concurrent read performance
- Web database snapshotted to IndexedDB (debounced, flushed on page hide) with Web Locks writer election across tabs
- Automatic schema migrations (versioned, transactional)

### Full-Text Search
- FTS5-powered search across questions, answers, topics, and subjects
- Unicode-aware tokenization with diacritic removal
- Prefix matching for instant search-as-you-type results

### Study Interface
- Flip-card study flow with HTML rendering support
- Keyboard shortcuts on web (Space to flip, 1-4 to answer)
- Haptic feedback on iOS/Android
- Undo last answer during a study session

### Deck Management
- Hierarchical deck structure with `::` separator (e.g., `TUS::Anatomi::Sinir`)
- Per-deck card counts (new / learning / review)
- Custom deck creation
- Deck-level study sessions

### Statistics
- Daily review count, accuracy, and study time
- Subject-level progress tracking
- Card distribution breakdown: New / Learning / Review / Young / Mature / Mastered
- SQL-based aggregation from the review log

### Backups & Data Safety
- Automatic daily backups (one snapshot per study day, newest 7 kept)
- Backups screen: restore with an automatic pre-restore snapshot (restores are undoable), share, delete
- Database check: SQLite integrity, orphan detection, search index rebuild

### Import / Export
- Anki `.apkg` import (guid-based dedupe) and CSV/TSV import
- Full JSON export/import of all tables (cards, decks, review log, settings)
- Web: direct browser download; Native: share sheet integration

### Editor & Note Types
- Note editor with live card preview
- Note type manager: fields, card templates (`{{Field}}`, `{{cloze:}}`, conditionals), CSS

### Responsive UI
- Sidebar navigation on desktop (768px+), hamburger menu on mobile
- Automatic dark/light mode based on system preference
- Cross-platform alert/confirm dialogs
- Error boundary with recovery option

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo 54, React Native 0.81 |
| Language | TypeScript 5.9 |
| Navigation | expo-router (file-based) |
| Database (native) | expo-sqlite (WAL mode) |
| Database (web) | sql.js (WebAssembly) |
| Testing | Vitest (161 tests across 20 suites) |
| State | React Context |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on specific platform
npm run ios
npm run android
npm run web

# Run tests + type check
npm run check
```

## Project Structure

```
app/
  _layout.tsx              Root layout + error boundary
  (tabs)/
    _layout.tsx            Tab layout and responsive navigation shell
    index.tsx              Study screen
    browser.tsx            Card browser with FTS search
    decks.tsx              Deck hierarchy view
    settings.tsx           App settings + import/export + database check
    stats.tsx              Statistics dashboard
  backups.tsx              Backup list / restore / share
  import.tsx               .apkg and CSV/TSV import
  editor.tsx               Note editor
  note-types.tsx           Note type & template manager

components/
  Sidebar.tsx              Navigation sidebar

contexts/
  AppContext.tsx           Shared app state

hooks/
  useAppStartup.ts         Startup sequence, migrations, auto backup

lib/
  db.ts                    Platform-aware SQLite + migrations
  webDb.ts                 sql.js wrapper for web platform
  scheduler.ts             Anki V3 scheduling engine (verified against Rust source)
  studyRepository.ts       Study queue + answer processing
  queueBuild.ts            Queue assembly (limits, burying, ordering)
  backup.ts                Daily auto backups + undoable restore
  maintenance.ts           Day rollover housekeeping + database check
  noteManager.ts           Note/card CRUD operations
  deckManager.ts           Deck hierarchy + configuration
  importApkg.ts            Anki .apkg importer
  reviewLogger.ts          Review logging + statistics queries
  storage.ts               Settings, session stats, import/export
  templates.ts             Anki card template renderer
  mediaStore.ts            Platform-aware media file storage
  models.ts                Data model definitions
  types.ts                 TypeScript type definitions

components/
  CardWebView.tsx          HTML card renderer (WebView native, div web)

constants/
  theme.ts                 Colors, spacing, typography tokens
  subjects.ts              TUS subject definitions
```

## Architecture

The app follows a local-first, platform-abstracted architecture:

- **Database layer** (`lib/db.ts`) exposes a unified `DBHandle` interface implemented by `expo-sqlite` on native and `sql.js` on web. All database consumers use this interface, making the storage backend transparent.
- **Study flow** is driven by `studyRepository.ts` which manages the queue, delegates scheduling to `scheduler.ts` (a faithful TypeScript port of Anki V3, verified against the official Rust source at `ankitects/anki`), and logs reviews via `reviewLogger.ts`.
- **UI state** flows through a single `AppContext` provider, with data refreshed via version bumping to trigger dependent `useMemo` recalculations.

## License

[MIT](LICENSE)
