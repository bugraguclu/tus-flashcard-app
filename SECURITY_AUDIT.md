# SECURITY AUDIT — TUS Flashcard App

> **Status: ALL FINDINGS RESOLVED** (2026-03-08)

### SECURITY AUDIT: Full Codebase Review

**Risk Assessment:** Low (after fixes applied)

---

#### Findings (All Resolved):

* **[S1: Auth Token Exposure in Sync Engine]** (Severity: **High**) — RESOLVED
  * **Resolution:** Entire `syncEngine.ts` file deleted as it was stub code with no functionality. No auth tokens are stored or transmitted. When sync is reimplemented, `expo-secure-store` will be used.

* **[S2: Unvalidated JSON Import — Prototype Pollution & Data Injection]** (Severity: **High**) — RESOLVED
  * **Resolution:** Added to `storage.ts`:
    - 50 MB size limit on import (`MAX_IMPORT_SIZE`)
    - `sanitizeObject()` function that recursively strips `__proto__`, `constructor`, `prototype` keys
    - All imported data passes through sanitization before storage

* **[S3: XSS via Card Content in Template Engine]** (Severity: **High**) — RESOLVED
  * **Resolution:** Applied `escapeHtml()` to regular field substitution in `templates.ts`. All `{{FieldName}}` substitutions now pass through HTML escaping to prevent script injection in WebView rendering.

* **[S4: SQL Injection via FTS5 Search]** (Severity: **Medium**) — RESOLVED
  * **Resolution:** Added input sanitization in `db.ts:dbSearchCards()` — strips all non-alphanumeric/Unicode-letter characters before constructing FTS5 MATCH query. Also applied in `noteManager.ts:searchNotes()`.

* **[S5: Non-Cryptographic GUID Generation]** (Severity: **Medium**) — RESOLVED
  * **Resolution:** Updated `generateGuid()` in `models.ts` to use `crypto.getRandomValues()` (available via Hermes + expo-crypto polyfill) with fallback to `Math.random()` for environments without crypto support.

* **[S6: Weak Checksum for Duplicate Detection]** (Severity: **Medium**) — RESOLVED
  * **Resolution:** Replaced djb2-style hash with FNV-1a 32-bit hash in `checksumField()`. FNV-1a provides better distribution and fewer collisions for short strings.

* **[S7: ID Generation Using `Date.now()` — Collision Risk]** (Severity: **Medium**) — RESOLVED
  * **Resolution:** Added `uniqueId()` function with monotonic counter — if `Date.now()` returns the same value as last call, it increments the counter instead. Applied across all ID generation points:
    - `noteManager.ts` (createNote, generateCardsForNote)
    - `deckManager.ts` (createDeck, createFilteredDeck)
    - `reviewLogger.ts` (logReview)

* **[S8: No Input Validation on Settings Import]** (Severity: **Low**) — RESOLVED
  * **Resolution:** Added `validateSettings()` function in `storage.ts` that clamps all numeric settings to safe ranges:
    - `dailyNewLimit`: 0-9999
    - `graduatingInterval`: 1-365
    - `easyInterval`: 1-365
    - `startingEase`: 1.3-5.0
    - `lapseNewInterval`: 0-1.0
    - `desiredRetention`: 0.5-0.99
    - `learningSteps`: validated as positive numbers, max 20 steps, max 10080 minutes each
    - `algorithm`: forced to 'ANKI_V3'

---

#### Observations (Resolved):

* **syncEngine deleted** — No HTTPS enforcement issue since sync code removed entirely.
* **Console.log** — Remains for development debugging; acceptable in Expo dev builds.
* **Import size limit added** — 50 MB limit prevents OOM attacks.
* **`resetAllData()` now clears SQLite** — Added `DELETE FROM card_states` to ensure complete data removal.
* **`resetAnkiData()` wrapped in transaction** — All 7 DELETE statements now execute within a single `BEGIN TRANSACTION...COMMIT` block for atomicity.

---

#### Remaining Low-Risk Items (Acceptable):

* `dbUnburyAll()` `json_set` on `data` column — handled by SQLite's error tolerance
* Template `\w+` regex — works correctly for Turkish field names in Unicode-aware JS regex
* AsyncStorage key enumeration — no security impact in single-user mobile app
