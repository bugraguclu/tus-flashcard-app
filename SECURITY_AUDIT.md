### ### SECURITY AUDIT: Build/runtime hardening + state consistency + WebView lockdown changes
**Risk Assessment:** Low

#### **Findings:**
* **Potential WebView Navigation Surface via Broad Origin Whitelist** (Severity: Low)
* **Location:** `components/CardWebView.tsx` (current `originWhitelist={['*']}`)
* **The Exploit:** If a malicious card payload managed to trigger navigation primitives (e.g., crafted links/user taps), broad whitelist increases permissiveness for external targets. JS is currently disabled, which significantly lowers exploitability, but whitelist remains broad.
* **The Fix:** Restrict allowed origins to the minimal required set for in-app content rendering and media base URL; add `onShouldStartLoadWithRequest` gate if external navigation is not needed.

* **Clipboard-Based Export May Expose Study Data to Other Apps** (Severity: Low)
* **Location:** `app/(tabs)/stats.tsx` (`Clipboard.setStringAsync(data)` in export flow)
* **The Exploit:** On shared/mobile environments, clipboard contents can be read by other apps/services, leaking card content and metadata if user copies full backups.
* **The Fix:** Offer file-based export as primary path on supported platforms, and show explicit sensitivity warning before clipboard export.

* **Verbose Startup Logs in Production Build Channels** (Severity: Low)
* **Location:** `app/(tabs)/use-app-startup.ts`, `lib/ankiInit.ts`, `lib/maintenance.ts`
* **The Exploit:** While no obvious secrets were observed, broad logging can leak operational metadata (counts, migration behavior) in shared logs or crash reports.
* **The Fix:** Route logs through environment-aware logger and strip/reduce informational logs for production builds.

#### **Observations:**
* `components/CardWebView.tsx` now disables JavaScript and DOM storage, materially reducing XSS-style payload execution risk.
* Dependency hardening completed: Expo SDK package versions aligned and vulnerable transitive `tar`/`undici` ranges overridden; `npm audit --omit=dev` reports 0 vulnerabilities.
* No hardcoded API keys/tokens/passwords detected in reviewed staged changes.
* No SQL injection vector found in changed code paths (SQL calls remain parameterized where user input exists).

---
