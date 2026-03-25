# Security Audit Report

**Application**: TUS Flashcard App (React Native + Expo)
**Audit Date**: 2026-03-25
**Auditor**: Automated Security Review
**Scope**: lib/*.ts, app/(tabs)/*.tsx, components/CardWebView.tsx

---

## Risk Assessment

**Overall Risk Level: LOW-MEDIUM**

This is a local-first flashcard application with no server-side components, no authentication, and no network API endpoints. The attack surface is limited to local data manipulation and XSS via card content rendering. The codebase demonstrates good security awareness with parameterized queries, HTML sanitization, prototype pollution guards, and iframe sandboxing. The primary real-world risks are XSS through card content and potential data integrity issues during import.

---

## Findings

### [MEDIUM] XSS via `allow-same-origin` in iframe sandbox

- **Location**: `components/CardWebView.tsx:28`
- **OWASP Category**: A03:2021 - Injection (Cross-Site Scripting)
- **Description**: The web platform renders card HTML inside an `<iframe>` with `sandbox="allow-same-origin"`. While scripts are blocked (no `allow-scripts`), the `allow-same-origin` token means the framed content shares the same origin as the parent. If a future change adds `allow-scripts` or if a browser bypass is discovered, the iframe content could access `localStorage` (which contains the entire database on web) and the parent DOM.
- **Exploit Scenario**: An attacker crafts a malicious Anki deck export containing a card with carefully constructed HTML. If a browser vulnerability allows script execution despite the sandbox, or if `allow-scripts` is ever added, the malicious card could read/modify the entire database from `localStorage` key `tus_flashcard_sqljs_db`, exfiltrate study data, or corrupt the user's progress.
- **Remediation**: Remove `allow-same-origin` from the sandbox attribute. Use `sandbox=""` (most restrictive) or `sandbox="allow-popups"` if link opening is needed. Card rendering does not require same-origin access. Alternatively, serve card content from a `data:` URI or `blob:` URL to create a distinct (opaque) origin.
- **Priority**: Next sprint

### [MEDIUM] HTML sanitization bypass vectors in normalizeFieldHtml

- **Location**: `lib/templates.ts:284-343`
- **OWASP Category**: A03:2021 - Injection (Cross-Site Scripting)
- **Description**: The `normalizeFieldHtml` function uses regex-based HTML sanitization, which is inherently fragile. Several bypass vectors exist:
  1. The `<script>` tag removal regex (`/<script[\s\S]*?>[\s\S]*?<\/script>/gi`) uses a non-greedy match that can be defeated by nested or malformed script tags (e.g., `<script<script>>alert(1)</script>`).
  2. The event handler regex (`/\s+on[a-z0-9_-]+\s*=/`) does not account for HTML entities or null bytes in attribute names (e.g., `o&#110;click`).
  3. The `<svg>` removal strips the whole element, but SVG can also be inline via `<math>` elements with embedded `<maction>` handlers, which are not stripped.
  4. CSS `expression()` blocking does not cover `-moz-binding`, `behavior`, or `@import` vectors.
- **Exploit Scenario**: A user imports a deck containing a card with `<img src=x o&#110;error=alert(1)>`. The HTML entity bypass in the event handler regex could allow the `onerror` handler to execute in the native WebView (where `javaScriptEnabled={false}` mitigates this) but potentially on web if sandbox restrictions are weakened.
- **Remediation**: Replace regex-based sanitization with a proper HTML sanitizer library such as DOMPurify. If bundle size is a concern, at minimum decode HTML entities before applying the event-handler regex, and add a blocklist for `<math>`, `<maction>`, `<annotation-xml>`, and other mutation-XSS vectors.
- **Priority**: Next sprint

### [MEDIUM] Unparameterized table name in PRAGMA query

- **Location**: `lib/db.ts:57`
- **OWASP Category**: A03:2021 - Injection (SQL Injection)
- **Description**: The `hasColumn` function interpolates the `table` parameter directly into a SQL string: `` `PRAGMA table_info(${table})` ``. SQLite PRAGMA statements do not support parameterized queries for the table name argument, but the current callers only pass hardcoded string literals from the `tableSpecs` array (`'notes'`, `'anki_cards'`, `'decks'`, `'note_types'`).
- **Exploit Scenario**: Currently unexploitable because all callers use hardcoded values. If a future developer passes user input to `hasColumn`, SQL injection would be possible. For example, `hasColumn(db, "notes); DROP TABLE notes; --", "col")` would execute destructive SQL.
- **Remediation**: Add a whitelist check or validate the table name against `[a-zA-Z_][a-zA-Z0-9_]*` before interpolation. Add a JSDoc comment warning that the parameter must never come from user input.
- **Priority**: Backlog

### [MEDIUM] Web database stored unencrypted in localStorage

- **Location**: `lib/webDb.ts:27`
- **OWASP Category**: A04:2021 - Insecure Design
- **Description**: On the web platform, the entire SQLite database is serialized to base64 and stored in `localStorage` under the key `tus_flashcard_sqljs_db`. `localStorage` is accessible to any JavaScript running on the same origin, has no encryption, and persists indefinitely.
- **Exploit Scenario**: Any XSS vulnerability on the same origin (from other apps, browser extensions, or a compromised CDN) could read `localStorage.getItem('tus_flashcard_sqljs_db')`, decode the base64, and extract all flashcard data, study history, and user settings. While the data is not highly sensitive (no credentials or PII beyond study habits), a malicious extension or script could corrupt or delete the database.
- **Remediation**: Consider using IndexedDB via `idb` or `localForage` instead of localStorage for larger storage limits and slightly better isolation. For sensitive deployments, consider encrypting the database before storage. Add integrity checks (e.g., a SHA-256 hash stored separately) to detect tampering.
- **Priority**: Backlog

### [LOW] CDN dependency for sql.js WASM binary

- **Location**: `lib/webDb.ts:127`
- **OWASP Category**: A08:2021 - Software and Data Integrity Failures
- **Description**: The sql.js WASM binary is loaded from `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/` at runtime. If the CDN is compromised or serves a tampered file, the WASM binary could execute arbitrary code within the page context.
- **Exploit Scenario**: A CDN compromise or man-in-the-middle attack (on networks without HSTS preload for jsdelivr) could serve a modified `sql-wasm.wasm` file that includes code to exfiltrate `localStorage` data or inject malicious behavior into database operations.
- **Remediation**: Bundle the sql.js WASM file locally with the application instead of fetching from a CDN. If a CDN is required, add Subresource Integrity (SRI) hashes. Pin the exact version and verify the hash on load.
- **Priority**: Next sprint

### [LOW] Import size limit but no row count limit

- **Location**: `lib/storage.ts:381,595-658`
- **OWASP Category**: A04:2021 - Insecure Design
- **Description**: The import function enforces a 50 MB size limit on the JSON string, but does not limit the number of rows in each table. A crafted import file under 50 MB could contain millions of small rows (e.g., revlog entries with minimal data), causing the SQLite database to grow unboundedly and potentially exhausting device storage or causing the app to become unresponsive.
- **Exploit Scenario**: A malicious export file contains 2 million minimal revlog entries (each ~50 bytes in JSON = ~100 MB uncompressed, but gzip-compressed import could be under 50 MB). Importing this file would create an unusably large database, degrading app performance to the point of denial of service.
- **Remediation**: Add per-table row count limits during import (e.g., max 500,000 cards, max 5,000,000 revlog entries). Validate row counts before beginning the import transaction.
- **Priority**: Backlog

### [LOW] Error messages may leak internal state

- **Location**: `lib/webDb.ts:77,94,114`
- **OWASP Category**: A09:2021 - Security Logging and Monitoring Failures
- **Description**: SQL error messages in the web database wrapper include up to 200 characters of the failed SQL query in the thrown error message. While this is a local-first app with no server, on the web platform these errors could appear in browser console logs accessible to extensions, or be captured by error monitoring services if added later.
- **Exploit Scenario**: Minimal real-world risk for a local app. If error monitoring (e.g., Sentry) is added without filtering, SQL fragments including table structures or data patterns could be sent to third-party servers.
- **Remediation**: Truncate SQL in error messages to the query type (SELECT/INSERT/UPDATE/DELETE) and table name only. Avoid including parameter values or full query text in production error messages.
- **Priority**: Backlog

### [LOW] `getBrowserCards` uses string interpolation for LIMIT/OFFSET

- **Location**: `lib/studyRepository.ts:897-898`
- **OWASP Category**: A03:2021 - Injection (SQL Injection)
- **Description**: The `getBrowserCards` function constructs LIMIT and OFFSET clauses via template literals: `` ` LIMIT ${Math.floor(limit as number)}` ``. While `Math.floor()` ensures the value is always a number (not injectable), this pattern is inconsistent with the rest of the codebase which correctly uses parameterized queries for limit values (e.g., `loadRowsByQueue`).
- **Exploit Scenario**: Not exploitable in the current code because `Math.floor` guarantees numeric output. However, the inconsistent pattern could lead to copy-paste errors by future developers who omit the `Math.floor` guard.
- **Remediation**: Use parameterized queries consistently: `` `... LIMIT ? OFFSET ?`, limit, offset ``. This matches the pattern already used in `loadRowsByQueue`.
- **Priority**: Backlog

### [LOW] Potential race condition in concurrent database writes

- **Location**: `lib/studyRepository.ts:746-757,813-838`
- **OWASP Category**: A04:2021 - Insecure Design
- **Description**: The `answerStudyCard` and `undoAnswer` functions use `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` for atomicity. However, the synchronous database API on native (expo-sqlite) operates on a single connection, and concurrent calls from timers (the 45-second refresh interval, scheduled queue rebuild) could interleave reads between another operation's transaction boundaries.
- **Exploit Scenario**: User answers a card while the periodic 45-second refresh fires. The refresh reads the queue state mid-transaction, getting a partially updated view. This could cause the queue to show stale data or skip a card. Not a security vulnerability per se, but a data integrity issue.
- **Remediation**: The synchronous SQLite API on a single connection serializes transactions inherently, so this is already safe on native. On web (sql.js), the single-threaded JS event loop prevents true concurrency. No immediate action needed, but document this assumption.
- **Priority**: Backlog

### [INFO] `generateGuid` fallback uses Math.random

- **Location**: `lib/models.ts:328`
- **OWASP Category**: N/A
- **Description**: The `generateGuid` function has a fallback to `Math.random()` when `crypto.getRandomValues` is unavailable. `Math.random()` is not cryptographically secure and produces predictable GUIDs.
- **Exploit Scenario**: In environments without Web Crypto API (rare for modern React Native), GUIDs become predictable. Since GUIDs are only used as Anki note identifiers and not for authentication or security purposes, the practical impact is negligible.
- **Remediation**: Log a warning when the fallback path is taken. Consider removing the fallback entirely and requiring `crypto.getRandomValues` (which Expo provides via expo-crypto polyfill on all supported platforms).
- **Priority**: Backlog

### [INFO] Prototype pollution guard is present but could be bypassed by Symbol keys

- **Location**: `lib/storage.ts:384-393`
- **OWASP Category**: N/A
- **Description**: The `sanitizeObject` function correctly strips `__proto__`, `constructor`, and `prototype` keys from imported JSON data. Since `JSON.parse` never produces Symbol keys, the current guard is sufficient for the import path.
- **Exploit Scenario**: None in the current code. The guard is correctly implemented for the JSON import use case.
- **Remediation**: None needed. The implementation is correct.
- **Priority**: N/A

---

## Positive Observations

The codebase demonstrates several strong security practices:

1. **Parameterized SQL queries throughout**: Nearly all database queries use parameterized placeholders (`?`) rather than string concatenation. This is the single most important defense against SQL injection and is applied consistently across `studyRepository.ts`, `noteManager.ts`, `deckManager.ts`, `reviewLogger.ts`, `storage.ts`, and `db.ts`.

2. **FTS5 query sanitization**: The `sanitizeFtsToken` function in `db.ts:290-298` strips control characters, FTS5 syntax characters (`"*():`), and reserved keywords (`AND`, `OR`, `NOT`, `NEAR`) before building match queries. The `buildFtsPrefixQuery` function double-quotes tokens and escapes internal quotes. This prevents FTS5 injection attacks.

3. **HTML field sanitization**: The `normalizeFieldHtml` function in `templates.ts` strips `<script>`, `<svg>`, `<iframe>`, `<object>`, `<embed>` tags, removes inline event handlers, neutralizes `javascript:` and `vbscript:` URI schemes, blocks dangerous `data:` URIs (allowing only safe image/audio MIME types), and strips CSS expression/behavior payloads. While regex-based, it covers the major attack vectors.

4. **CSS injection prevention**: The `wrapInCardHtml` function replaces `</style` in user-provided CSS to prevent CSS breakout via style tag injection.

5. **Iframe sandboxing on web**: Card content is rendered in a sandboxed iframe without `allow-scripts`, preventing JavaScript execution in card HTML on the web platform.

6. **JavaScript disabled in native WebView**: On native platforms, `CardWebView` sets `javaScriptEnabled={false}` and `domStorageEnabled={false}`, providing defense-in-depth against XSS.

7. **Prototype pollution protection on import**: The `sanitizeObject` function uses `Object.create(null)` and filters dangerous prototype keys before processing imported data.

8. **Import size limiting**: A 50 MB hard limit on import data prevents trivial denial-of-service via oversized imports.

9. **Settings validation with bounds checking**: The `validateSettings` function in `storage.ts` enforces numeric ranges (min/max clamping), whitelists enum values, and sanitizes step arrays with per-element bounds and array length limits.

10. **Transaction safety**: Database write operations in `answerStudyCard`, `undoAnswer`, `deleteNote`, `importCanonicalTables`, and `resetAllData` all use proper BEGIN/COMMIT/ROLLBACK transaction wrappers with error handling.

11. **No PII collection**: The application does not collect, store, or transmit any personally identifiable information. No analytics, no telemetry, no account system.

12. **WAL mode enabled**: Native SQLite uses WAL (Write-Ahead Logging) journal mode for better concurrent read performance and crash resilience.

---

## Recommendations Summary

### Fix Immediately
_(None - no critical vulnerabilities found)_

### Next Sprint
1. **Replace regex HTML sanitization with DOMPurify** (`lib/templates.ts`) - Eliminates entire class of XSS bypass vectors
2. **Remove `allow-same-origin` from iframe sandbox** (`components/CardWebView.tsx`) - Prevents potential same-origin access from card content
3. **Bundle sql.js WASM locally or add SRI hashes** (`lib/webDb.ts`) - Eliminates CDN supply-chain risk

### Backlog
4. **Add whitelist validation to `hasColumn`** (`lib/db.ts`) - Defensive coding against future misuse
5. **Use parameterized LIMIT/OFFSET in `getBrowserCards`** (`lib/studyRepository.ts`) - Consistency with rest of codebase
6. **Add per-table row count limits during import** (`lib/storage.ts`) - Prevent resource exhaustion
7. **Consider IndexedDB over localStorage for web database** (`lib/webDb.ts`) - Better storage limits and isolation
8. **Reduce SQL fragment exposure in error messages** (`lib/webDb.ts`) - Preparation for future error monitoring
9. **Remove `Math.random` fallback in `generateGuid`** (`lib/models.ts`) - Require crypto API
