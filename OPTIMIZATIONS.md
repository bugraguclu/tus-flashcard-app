# TUS Flashcard App — Optimization & Production Readiness Audit

Date: 2026-03-22
Scope: Full codebase review (app/, components/, lib/, package/runtime config)

### 1) Optimization Summary

- Current optimization health moved from **"good prototype"** to **"publish-ready baseline"** after targeted fixes in build compatibility, state consistency, and UI/runtime efficiency.
- Top 3 highest-impact improvements applied:
  1. **SDK dependency alignment + build hardening** (Expo package versions, lockfile, scripts, transitive security overrides).
  2. **State consistency & reliability fixes** across tabs (settings/import changes now invalidate and refresh shared app state correctly).
  3. **Hot-path render optimization** in sidebar counters (removed repeated full-array scans).
- Biggest risk if no changes were made: **silent production drift** (screens showing stale data), plus **build instability** from SDK-package mismatch and preventable runtime attack surface in WebView.

---

### 2) Findings (Prioritized)

#### Finding 1
- **Title**: Expo SDK dependency mismatch broke publish readiness and type safety
- **Category**: Build
- **Severity**: Critical
- **Impact**: Build stability, CI reliability, release confidence
- **Evidence**:
  - `package.json` had mismatched packages (`expo-file-system`, `expo-document-picker`, `react-native-webview`) before alignment.
  - `expo-doctor` initially failed on version checks and duplicate native module versions.
  - Type check errors in file-system usage path.
- **Why it’s inefficient**:
  - Mismatched native modules create failure-prone builds and debugging churn.
  - CI noise and blocked release pipeline increase engineering cost.
- **Recommended fix**: **Applied**
  - Aligned versions with Expo SDK expectations:
    - `expo-document-picker: ~14.0.8`
    - `expo-file-system: ~19.0.21`
    - `react-native-webview: ~13.15.0`
  - Added standard quality scripts: `typecheck`, `check`, `doctor`.
  - Added `overrides` for vulnerable transitive packages (`tar`, `undici`).
- **Tradeoffs / Risks**:
  - Minimal: lockfile updates require consistent CI cache invalidation.
- **Expected impact estimate**: High (release-blocking issue removed)
- **Removal Safety**: Safe
- **Reuse Scope**: service-wide

#### Finding 2
- **Title**: Sidebar subject/topic counts performed repeated full scans (N × topics)
- **Category**: Frontend
- **Severity**: High
- **Impact**: UI latency and CPU usage on large card sets
- **Evidence**:
  - Previous pattern: `filter(...).length` for each subject/topic invocation.
  - Path: `app/(tabs)/_layout.tsx` subject/topic count helpers.
- **Why it’s inefficient**:
  - Repeated scans multiply cost with list size and rerenders.
- **Recommended fix**: **Applied**
  - Precomputed `subjectCounts` and `topicCounts` maps once via `useMemo`.
  - O(N) precomputation, O(1) lookups for rendering.
- **Tradeoffs / Risks**:
  - Slightly more memory for maps (small, bounded).
- **Expected impact estimate**: Medium-High (visible on mid/large datasets)
- **Removal Safety**: Safe
- **Reuse Scope**: module
- **Classification**: Reuse Opportunity (count aggregation pattern reusable in other screens)

#### Finding 3
- **Title**: Cross-screen stale state after settings/import/reset operations
- **Category**: Reliability
- **Severity**: High
- **Impact**: Correctness of queue/stats/deck/browser views
- **Evidence**:
  - Settings changes were saved but not reliably propagated to all tabs.
  - Import operation requested app restart in UX because state invalidation was incomplete.
  - Affected paths: `settings.tsx`, `stats.tsx`, `browser.tsx`, `decks.tsx`.
- **Why it’s inefficient**:
  - Users see inconsistent numbers and outdated queues, causing rework and trust loss.
- **Recommended fix**: **Applied**
  - Triggered `refreshData()` + `bumpDataVersion()` on settings update/reset/import.
  - Made browser/decks/stats react to `dataVersion` updates.
  - Added cancel guards for async stats load effects.
- **Tradeoffs / Risks**:
  - Slightly more recomputation after mutations (expected and correct).
- **Expected impact estimate**: High (correctness + UX integrity)
- **Removal Safety**: Safe
- **Reuse Scope**: service-wide

#### Finding 4
- **Title**: Session stats update path vulnerable to stale-closure race
- **Category**: Concurrency
- **Severity**: High
- **Impact**: Accuracy of study metrics, undo correctness
- **Evidence**:
  - `answerCard` relied on potentially stale `sessionStats` closure under rapid interactions.
  - `undo` path updated state but needed immediate ref synchronization.
  - Path: `app/(tabs)/index.tsx`.
- **Why it’s inefficient**:
  - Rapid answers could produce miscounted reviewed/correct/wrong metrics.
- **Recommended fix**: **Applied**
  - Switched to `sessionStatsRef.current` as source of truth in mutation path.
  - Synced ref on update and undo path.
  - Cleared scheduled refresh timeout inside `buildQueue` to avoid duplicate refresh work.
- **Tradeoffs / Risks**:
  - Slightly more imperative state synchronization, but controlled and localized.
- **Expected impact estimate**: Medium-High (metric correctness under real usage)
- **Removal Safety**: Likely Safe
- **Reuse Scope**: module
- **Classification**: Reuse Opportunity (ref-backed mutation pattern for async-heavy handlers)

#### Finding 5
- **Title**: Startup sequence could duplicate heavy init work in remount scenarios
- **Category**: Reliability
- **Severity**: Medium
- **Impact**: Startup latency, repeated migration/indexing side effects
- **Evidence**:
  - Startup logic in hook effect can be invoked more than once in remount/dev strict-like flows.
  - Path: `app/(tabs)/use-app-startup.ts`.
- **Why it’s inefficient**:
  - Duplicate DB/index/migration work increases startup cost and log noise.
- **Recommended fix**: **Applied**
  - Added module-scoped `startupPromise` deduplication.
  - Added failure reset behavior so retries remain possible after startup error.
- **Tradeoffs / Risks**:
  - Startup flow now intentionally singleton-like per runtime.
- **Expected impact estimate**: Medium
- **Removal Safety**: Needs Verification
- **Reuse Scope**: module

#### Finding 6
- **Title**: WebView card renderer kept JavaScript enabled despite HTML sanitization
- **Category**: Reliability
- **Severity**: Medium
- **Impact**: Security posture and runtime risk exposure
- **Evidence**:
  - `components/CardWebView.tsx` rendered note HTML in WebView with JS enabled.
  - Sanitization exists, but regex-based sanitizers are defense-in-depth, not absolute guarantees.
- **Why it’s inefficient**:
  - Unnecessary script engine enables avoidable exploit surface and extra runtime overhead.
- **Recommended fix**: **Applied**
  - Disabled `javaScriptEnabled` and `domStorageEnabled` in card WebView.
- **Tradeoffs / Risks**:
  - If future templates require custom JS interactions, this must be explicitly re-enabled with stronger CSP/sandbox strategy.
- **Expected impact estimate**: Medium (risk reduction + marginal perf)
- **Removal Safety**: Likely Safe
- **Reuse Scope**: module

#### Finding 7
- **Title**: File-system API compatibility drift created TS failures
- **Category**: Build
- **Severity**: High
- **Impact**: Typecheck pass rate, CI gate reliability
- **Evidence**:
  - `lib/mediaStore.ts` depended on legacy API members while mismatched package version exposed new API typings.
- **Why it’s inefficient**:
  - Failing typecheck blocks release and masks real regressions.
- **Recommended fix**: **Applied**
  - Imported from `expo-file-system/legacy` for explicit API contract consistency with SDK-aligned dependency.
- **Tradeoffs / Risks**:
  - Keep an eye on future Expo SDK migrations to modern file API.
- **Expected impact estimate**: High (release-blocking issue removed)
- **Removal Safety**: Safe
- **Reuse Scope**: local file

#### Finding 8
- **Title**: Debounce timer cleanup missing in browser screen
- **Category**: Memory
- **Severity**: Low
- **Impact**: Small leak risk, unnecessary pending work on unmount
- **Evidence**:
  - Search debounce timeout existed without explicit unmount cleanup.
- **Why it’s inefficient**:
  - Retained timers can call stale state setters after navigation.
- **Recommended fix**: **Applied**
  - Added effect cleanup to clear debounce timeout.
- **Tradeoffs / Risks**:
  - None.
- **Expected impact estimate**: Low-Medium
- **Removal Safety**: Safe
- **Reuse Scope**: module

---

### 3) Quick Wins (Do First)

Completed quick wins (high ROI, low implementation cost):

1. **Dependency alignment + doctor pass** (package.json + lockfile) — immediate release blocker removal.
2. **Add standard quality scripts** (`typecheck`, `check`, `doctor`) — faster local/CI gate.
3. **Sidebar count pre-aggregation** — removed repeated filter scans.
4. **State invalidation wiring** after settings/import/reset — eliminated stale UI behavior.
5. **Disable WebView JS** for card rendering — reduced attack surface with minimal compatibility risk.

---

### 4) Deeper Optimizations (Do Next)

1. **Queue materialization optimization**
   - Move from broad JSON blob parsing to tighter column-driven reads in more paths.
   - Keep full `data` JSON parse only when actually needed (already partially done in repository logic).

2. **Large-deck browser pagination / incremental loading**
   - Current browser view loads all cards then filters in-memory.
   - For very large datasets, move filtering and pagination deeper into SQLite queries.

3. **Structured logging layer**
   - Replace ad-hoc `console.*` startup logs with leveled logger (dev/prod channels, optional telemetry).

4. **Legacy path retirement plan**
   - Migration code is currently valuable; once migration windows close, retire legacy branches to reduce maintenance surface.

---

### 5) Validation Plan

#### Benchmarks
- Measure cold startup time before/after startup dedupe (`use-app-startup`).
- Measure sidebar render time with large decks (e.g., 5k+ cards) before/after count map precompute.
- Measure browser tab search responsiveness with repeated navigation/unmount cycles.

#### Profiling strategy
- React Profiler for rerender hotspots in tabs layout and browser screen.
- SQLite query timing logs around queue build and browser card fetch.
- Memory snapshots during tab switching + search typing.

#### Metrics to compare before/after
- Startup completion time to first interactive screen.
- Number of renders for sidebar/decks on navigation.
- Queue/stats consistency checks after settings/import/reset operations.
- Build quality gates:
  - `npm run typecheck`
  - `npm test`
  - `npx expo-doctor`
  - `npm audit --omit=dev`

#### Test cases to preserve correctness
- Rapid answer sequence should keep `reviewed/correct/wrong` accurate.
- Undo should restore previous stats deterministically.
- Import should update visible stats without app restart.
- Settings changes should reflect in queue behavior immediately.
- Browser search debounce should not fire after unmount.

---

### 6) Optimized Code / Patch (when possible)

Applied patch set (no overengineering, production-focused):

1. **Build/runtime hardening**
   - `package.json`:
     - Added scripts: `typecheck`, `check`, `doctor`.
     - Aligned Expo module versions to SDK-compatible ranges.
     - Added security overrides for transitive `tar` and `undici`.
   - `package-lock.json` updated accordingly.

2. **Render-path optimization**
   - `app/(tabs)/_layout.tsx`:
     - Replaced repeated `filter(...).length` calls with memoized `Map` aggregations for subject/topic counts.

3. **State coherence improvements**
   - `app/(tabs)/settings.tsx`:
     - Functional state update + save.
     - Immediate `refreshData()` + `bumpDataVersion()` on setting changes and reset.
     - Saved-indicator timer cleanup.
   - `app/(tabs)/stats.tsx`:
     - Load effect keyed by `dataVersion`.
     - Correct rollover-aware day usage (`todayLocalYMD(..., dayRolloverHour)`).
     - Import now refreshes app state instead of requiring restart.
   - `app/(tabs)/browser.tsx` and `app/(tabs)/decks.tsx`:
     - Recompute views on `dataVersion` changes.

4. **Study flow reliability**
   - `app/(tabs)/index.tsx`:
     - Session stats mutation uses ref-backed source to avoid stale closure race.
     - Undo path updates ref + state consistently.
     - `buildQueue()` clears pending scheduled refresh timer to prevent duplicate work.

5. **Startup dedupe / migration stability**
   - `app/(tabs)/use-app-startup.ts`:
     - Added singleton startup promise with retry-safe failure reset.

6. **Security hardening in card rendering**
   - `components/CardWebView.tsx`:
     - Disabled JavaScript and DOM storage in WebView.

7. **Type compatibility fix**
   - `lib/mediaStore.ts`:
     - Switched to `expo-file-system/legacy` import path for explicit API compatibility.

#### Verification results (executed)
- `npm run check` ✅ (TypeScript + 29 tests passing)
- `npx expo-doctor` ✅ (17/17 checks)
- `npm audit --omit=dev` ✅ (0 vulnerabilities)

---

Status: **Patch applied and validated.**
