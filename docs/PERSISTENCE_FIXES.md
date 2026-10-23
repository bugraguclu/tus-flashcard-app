# Collection persistence regression fixes — 2026-10-22

The reviewer, editor and import workflow previously acknowledged their synchronous in-memory
SQLite writes while the web IndexedDB snapshot was still pending. They now share an awaited
commit boundary and reject read-only tabs before mutation. Note creation and answer retries
compensate failed durable writes; failed answers restore review history, buried siblings,
filtered-deck bookkeeping and optional card scheduling data. Undo/redo of answers also waits
for persistence before changing its history stack.

Note fields remain shared by siblings. Their individual deck placement and scheduling survive
an answer-only edit. An explicit destination change moves the selected card, while newly
generated cards use the selected destination.

## Automated verification

`lib/collectionWrite.test.ts` covers pending completion, rejected commits, rollback callbacks,
read-only rejection before mutation and asynchronous import ordering. `lib/webDb.test.ts`
uses real sql.js note/import/scheduler writes and reads back only the acknowledged IndexedDB
bytes to check review history, repetitions, sibling burying, text import and retry uniqueness.
A pagehide/in-flight-save regression also prevents an older snapshot from satisfying a newer
explicit save before its data commits.
`lib/noteManager.newTypes.test.ts` pins sibling decks and scheduling during content edits.

The isolated staged snapshot passed `npm run quality`: 160 files / 1678 tests, TypeScript and
iOS configuration/source-registry checks. The full working copy also passed (166 files / 1718
tests), including the unrelated local changes. The production web export passed.

## Named browser smoke

Production export built from the isolated staged snapshot; Chrome 155, isolated temporary profile, Turkish locale,
Europe/Istanbul, 390×844 viewport. All fixtures are synthetic or the checked-in Anki 26.05
legacy package. No learner collection or public deployment is modified.

| ID | Procedure | Result |
| --- | --- | --- |
| PF-01 | Add a reversed note; reload as soon as the save acknowledgement appears | Both generated cards remain |
| PF-02 | Grade a card; reload as soon as the next question appears | One review-log row and one repetition remain |
| PF-03 | Import one TSV note; reload on Import Log | Note and card remain |
| PF-04 | Reject IndexedDB read-write transactions while saving a new note | Error appears; no note-saved message |
| PF-05 | Restore writes and retry the failed note save | Exactly one note is stored |
| PF-06 | Save a note in a second tab sharing the writer's profile | Read-only restriction; no success |
| PF-07 | Put reverse sibling in another deck; edit only answer and save | Answer updates; sibling deck remains unchanged |
| PF-08 | Import `test/fixtures/anki-26.05-legacy.apkg`; reload on Import Log | Imported notes remain |
| PF-09 | Reject one answer write, restore storage and retry after the double-tap guard | Exactly one new review-log row; no duplicate answer |

Raw observations and screenshots are in the ignored
`outputs/persistence-fixes-2026-10-22/` directory.

## Remaining device check

No physical iPhone is connected for this change. Before an iPhone release, run the reviewer
reveal/grade/background/undo row, the Files `.apkg` open/import/relaunch row, and the editor
save/relaunch check from `IOS_RELEASE_CHECKLIST.md`. Native SQLite commits remain synchronous;
the new acknowledgement wait changes web persistence only. No schema or persisted units change.
