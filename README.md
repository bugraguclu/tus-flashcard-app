# TusAnkiM

TUS (Tipta Uzmanlik Sinavi) odakli flashcard uygulamasi. Expo + React Native ile gelistirilmistir. iOS, Android ve Web destekler.

## Ozellikler

### Scheduler
- **ANKI_V3** scheduler: Again / Hard / Good / Easy
- Learning steps, lapse steps, graduating interval ayarlari
- Queue order: `learning-review-new` veya `learning-new-review`
- New card order: `sequential` veya `random`
- Deck-bazli config destegi
- Leech detection & sibling bury
- Transaction-safe undo

### Veri Modeli (SQLite)
- `notes`, `anki_cards`, `decks`, `deck_configs`, `note_types`, `revlog`
- FTS5 full-text search
- Legacy AsyncStorage'dan otomatik migration

### UI
- Responsive layout (sidebar on desktop, hamburger on mobile)
- Dark mode destegi (sistem temasina gore otomatik)
- Haptic feedback (iOS/Android)
- Cross-platform confirm/alert dialoglari
- Error boundary ile crash korunmasi
- Startup loading screen

### Istatistikler
- Gunluk tekrar, dogruluk, calisma suresi (revlog-bazli)
- Ders bazli ilerleme
- Kart dagilimi: New / Learning / Review / Young / Mature / Mastered
- SQL-bazli aggregation (performans icin)

### Import/Export
- JSON import/export
- Canonical table-level backup & restore

## Tech Stack
- Expo 54 (React Native 0.81)
- TypeScript
- expo-router
- expo-sqlite (WAL mode)
- expo-haptics
- Vitest

## Gelistirme

```bash
npm install
npm test
npx tsc --noEmit
npx expo start --web
```

## Yapi

```
app/
  _layout.tsx          # Root layout + Error Boundary
  (tabs)/
    _layout.tsx        # Tab layout + Sidebar + AppContext
    index.tsx          # Study screen
    browser.tsx        # Card browser (FTS search)
    decks.tsx          # Deck hierarchy
    settings.tsx       # App settings
    stats.tsx          # Statistics + import/export
    sidebar.tsx        # Navigation sidebar
lib/
  studyRepository.ts   # Study queue + answer processing
  scheduler.ts         # ANKI_V3 scheduling engine
  storage.ts           # Settings, session stats, import/export
  noteManager.ts       # Note/Card CRUD
  deckManager.ts       # Deck hierarchy + config
  reviewLogger.ts      # Review logging + statistics queries
  db.ts                # SQLite schema + migrations
  settingsResolver.ts  # Shared deck config -> settings resolver
  confirm.ts           # Cross-platform confirm/alert helper
```
