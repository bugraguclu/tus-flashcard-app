# TusAnkiM

A cross-platform spaced repetition flashcard app built for TUS (Tipta Uzmanlık Sınavı) preparation. Powered by the Anki V3 scheduling algorithm, it runs on iOS, Android, and Web with a single codebase.

## Features

### Spaced Repetition (Anki V3)
- Four answer grades: Again / Hard / Good / Easy
- Configurable learning steps, lapse steps, and graduating intervals
- Queue ordering options (learning-review-new or learning-new-review)
- New card ordering (sequential or random)
- Per-deck configuration overrides
- Leech detection and sibling burying
- Transaction-safe undo for the last review

### SQLite Storage
- Local-first architecture with full offline support
- `expo-sqlite` on iOS/Android, `sql.js` (WebAssembly) on web
- WAL journal mode on native for concurrent read performance
- Web database persisted to localStorage between sessions
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

### Import / Export
- Full JSON backup and restore of all tables
- Web: direct browser download; Native: share sheet integration

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
| Testing | Vitest |
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

# Run tests
npm test

# Type check
npx tsc --noEmit
```

## Project Structure

```
app/
  _layout.tsx              Root layout + error boundary
  (tabs)/
    _layout.tsx            Tab layout, sidebar, AppContext
    index.tsx              Study screen
    browser.tsx            Card browser with FTS search
    decks.tsx              Deck hierarchy view
    settings.tsx           App settings + import/export
    stats.tsx              Statistics dashboard
    sidebar.tsx            Navigation sidebar
    app-context.tsx        Shared app state
    use-app-startup.ts     Startup sequence + migrations

lib/
  db.ts                    Platform-aware SQLite + migrations
  webDb.ts                 sql.js wrapper for web platform
  scheduler.ts             Anki V3 scheduling engine
  studyRepository.ts       Study queue + answer processing
  noteManager.ts           Note/card CRUD operations
  deckManager.ts           Deck hierarchy + configuration
  reviewLogger.ts          Review logging + statistics queries
  storage.ts               Settings, session stats, import/export
  mediaStore.ts            Platform-aware media file storage
  models.ts                Data model definitions
  types.ts                 TypeScript type definitions
  confirm.ts               Cross-platform confirm/alert

components/
  CardWebView.tsx          HTML card renderer (WebView native, div web)

constants/
  theme.ts                 Colors, spacing, typography tokens
  subjects.ts              TUS subject definitions
```

## Architecture

The app follows a local-first, platform-abstracted architecture:

- **Database layer** (`lib/db.ts`) exposes a unified `DBHandle` interface implemented by `expo-sqlite` on native and `sql.js` on web. All database consumers use this interface, making the storage backend transparent.
- **Study flow** is driven by `studyRepository.ts` which manages the queue, delegates scheduling to `scheduler.ts` (a faithful port of Anki V3), and logs reviews via `reviewLogger.ts`.
- **UI state** flows through a single `AppContext` provider, with data refreshed via version bumping to trigger dependent `useMemo` recalculations.

## License

MIT
