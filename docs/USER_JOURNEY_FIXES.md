# User journey regression fixes — 2026-10-21

This change fixes three issues reproduced in the production web build. The release branch starts
from the deployed `master`; unrelated local UI and catalog work is excluded.

## Changes

- Settings Save waits for the IndexedDB transaction to commit before showing success on web.
  Overlapping saves wait for the newest snapshot. A failed durable write reports an error and
  restores the previous in-memory settings unless a newer settings write has superseded it.
  Native SQLite writes remain synchronous. Draft edits made during the save are preserved.
- Checkbox and radio controls expose explicit `aria-checked` values, alongside their existing
  native accessibility state. The flag filter's Select All control reports `mixed` when only
  some flags are selected.
- The browser header uses the same matching-result total as pagination, including text searches
  returning zero results, in Cards and Notes modes.

No schema, persisted units, review scheduling, package contents or catalog assets change.

## Deterministic coverage

`lib/webDb.test.ts` adds four regressions: awaiting the durable commit, saving an edit made during
an earlier commit, rejecting write failures, and rejecting saves in read-only tabs.
`lib/storage.roundtrip.test.ts` adds three regressions: restoring settings after a failed durable
save, withholding success until the commit settles, and preserving a newer settings write when
an older save fails.

`npm run quality` passes on Node 24 with 157 test files / 1661 tests. The production web export
succeeds. The baseline has fewer tests than the earlier working-copy audit because the audit
also included uncommitted catalog/editor work that is not part of this release.

## Named browser smoke

Environment: local production export, Chrome 155, isolated temporary collection,
390×844 viewport, Turkish locale, Europe/Istanbul. Test data is synthetic.

| Check | Procedure | Result |
| --- | --- | --- |
| UJ-01 durable settings | Save English, immediately reload after Saved; save Turkish, immediately reload after Kaydedildi | Saved language survives |
| UJ-01 write failure | Inject an IndexedDB read-write failure in the test profile, change language and Save | Recoverable error; no Saved confirmation |
| UJ-02 radio state | Inspect General language/theme choices | Exactly the active choice exposes `aria-checked=true` |
| UJ-02 checkbox state | Inspect all-selected flags, deselect Red, then clear all | True/false values and Select All `mixed` match the visual ticks |
| UJ-03 Cards results | Create two notes; search for an absent term, one note's text, then clear | Header reports 0, 1, 2 cards |
| UJ-03 Notes results | Switch to Notes; search for one note and an absent term | Header reports 1 and 0 notes |

Screenshots and raw observations from the local run are saved outside the release source in
`outputs/user-journey-fixes-2026-10-21/` in the main checkout. The original audit report remains
in `outputs/user-journey-2026-10-21/REPORT.md`.

## Scope limits

The public browser preview is the deployment target for this change. There is no App Store,
TestFlight or OTA iPhone release in this operation. A physical iPhone and native VoiceOver smoke
remain unperformed; web accessibility-tree inspection is not a substitute. Existing native
accessibility state is retained, and the new durable persistence boundary is web-only.

Before an iPhone release, run the Settings save and Browser filters rows in
`IOS_RELEASE_CHECKLIST.md` on device, including checked/mixed announcements in VoiceOver.
