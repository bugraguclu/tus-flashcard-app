# TusAnkiM

TUS-focused flashcard app built with Expo + React Native.

This codebase now uses **SQLite as the canonical persistence model** and follows an Anki-like scheduling pipeline (new → learning/relearning → review).

---

## Current Status (Implemented)

### ✅ Scheduler / Review
- Single active scheduler: **ANKI_V3**
- Button flow: **Again / Hard / Good / Easy**
- Separate step definitions:
  - `learningSteps` for new cards
  - `lapseSteps` for relearning after lapse
- `lapseNewInterval` is applied for review Again behavior
- Queue policy options are supported:
  - `queueOrder`: `learning-review-new` or `learning-new-review`
  - `newCardOrder`: `sequential` or `random`
- Deck config values are wired into runtime scheduling (`deck_configs` → scheduler inputs)
- Every answer updates persistent card state in `anki_cards`
- Every answer writes a log record into `revlog`
- Undo is transaction-safe for card snapshot + review log entry rollback
- Sibling bury behavior is applied from deck config flags
- Leech detection/action is applied from deck config (`threshold` + `suspend/tag`)

### ✅ Canonical Data Model (SQLite)
The runtime uses these canonical tables:
- `notes`
- `anki_cards`
- `decks`
- `deck_configs`
- `note_types`
- `revlog`

Legacy AsyncStorage/card_states flow is only kept for one-shot migration/import compatibility (not as the runtime source of truth).

### ✅ Migration / Maintenance
- One-shot migration from legacy AsyncStorage `card_states` to canonical `anki_cards`
- One-shot migration for legacy custom cards into canonical notes/cards
- Daily maintenance supports unbury flow on canonical queues
- Reset clears canonical study data and re-initializes base Anki entities

### ✅ Search / Browser
- FTS5-backed search is wired to canonical cards
- Browser screen reads from canonical study repository

### ✅ Stats
- Stats classification is separated for:
  - `new`
  - `learning`
  - `review`
  - `young`
  - `mature`
  - `mastered`
- Review cards are not all treated as mastered

### ✅ Type/Test Baseline
- TypeScript check (`tsc --noEmit`) passes
- Scheduler + stats helper tests pass via Vitest

---

## Not Implemented Yet (Planned)

### 🔜 APKG Import
- No production APKG import pipeline yet
- Planned as a dedicated import layer that maps package data into canonical tables

### 🔜 Sync Backend
- No production sync server/client yet
- Schema groundwork exists (sync-ready metadata columns such as `updated_at`, `usn`, `tombstone`)

### 🔜 FSRS Runtime
- FSRS is not active in runtime scheduling
- Current production scheduler is ANKI_V3 only

---

## Tech Stack
- Expo (React Native)
- TypeScript
- expo-router
- expo-sqlite (WAL mode)
- Vitest

---

## Development

```bash
npm install
npm test
npx tsc --noEmit
npx expo start --web
```

---

## Notes
- This repository prioritizes a stable local Anki-like pipeline first.
- APKG import and sync are intentionally staged after local parity and persistence correctness.
