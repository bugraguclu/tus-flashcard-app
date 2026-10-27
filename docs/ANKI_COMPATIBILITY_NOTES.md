# Anki compatibility notes

Full evidence and known divergences behind each row of the capability matrix in
[ANKI_COMPATIBILITY.md](ANKI_COMPATIBILITY.md). Sections follow the matrix order; read only the
one for the area you are changing.

## New/learning/relearning/review lifecycle

**Status:** Implemented, legacy scheduler

**Evidence:** `lib/scheduler.ts`, scheduler and repository tests

Grade Now clears suspend/bury flags before encoding every scheduling column. Unsuspend/unbury preserves day-number due values in queue 3, including overdue learning cards (`lib/ai2Safety.test.ts`).

Classic review elapsed days come from interval minus days until due, independent of manual/review-log timestamps. Only a filtered context uses early-review formulas, including zero elapsed days. Day labels call the exact scheduling path with the same card-ID/repetition fuzz seed and balancer (`lib/ai2Scheduling.test.ts`).

Lapses with "New interval" above 0% are fuzzed like any review interval, and a failed relearning step lapses the pending interval once more (no extra lapse, no ease change); the default 0% stays on the minimum lapse interval. Relearning graduation keeps the interval the lapse settled instead of applying the minimum lapse interval a second time, and relearning Easy adds one day without clipping at the maximum interval. A card that has never graduated is written with factor 0, Anki's value; an ease already stored on a learning card is read as before. A note tagged "Leech" by another client is the leech tag and is not tagged a second time (`lib/schedulerLapse.test.ts`, `lib/answerStoredState.test.ts`).

**Next compatibility gate:** Keep golden interval/rollover tests

## Answer buttons, next times, counts, undo

**Status:** Implemented

**Evidence:** opt-in redesigned reviewer with a preserved classic fallback, compact toolbar/footer, directional feedback, `lib/reviewerPresentation.test.ts`, review logger and repository tests

Web answers, undo and redo wait for the IndexedDB snapshot before publishing completion or
advancing the queue. Failed answer persistence restores the card (including optional `ankiData`),
revlog, buried siblings and filtered-build bookkeeping so retry cannot count the answer twice.
`lib/webDb.test.ts` exercises the real scheduler against the acknowledged stored bytes;
`lib/collectionWrite.test.ts` covers pending/error acknowledgement and rejection before mutation
in a read-only tab.

Undo applies only the operation delta to existing rows, preserving later note fields, unrelated tags, deck and flag edits; deleted cards are never recreated. Answer undo restores scheduling and known scheduler data while preserving opaque card data. This is a reviewer-local stack, not Anki's collection-wide undo stack (`lib/ai2Safety.test.ts`).

A card's scheduling columns (type, queue, due, ivl, factor, reps, lapses, left, odue, odid, last review, the data blob, and the deck when a filtered home moves) are restored as one unit: once anything else rescheduled the card (an answer, the Browser's Grade Now, Forget or Set Due Date), the step is refused and the undo history is cleared, as Anki clears it behind a change it cannot undo, instead of writing a mixed card. Every row of a step is written inside one SQLite savepoint and the stacks move only after the durable write; a failed step stays on its stack. Steps whose rows were deleted elsewhere are dropped together with everything older. Undo puts the card it took back on screen. Redo replays an answer in its original filtered context (`lib/reviewerUndoSafety.test.ts`, `lib/reviewerQueueRefresh.test.ts`).

Answer-button spans use Anki's units (the largest unit that fits, one decimal: 90 minutes is 1.5h, 30 days stay 30d, 45 days are 1.5mo with 365/12-day months), a learning step reaching past the rollover is labelled in the days it is stored as, a step shorter than the learn-ahead limit gets Anki's `<` prefix, and the English interface shows English units; a preview deck's finishing button reads "(end)". A grade inside the double-tap window after the answer appears is ignored, and a held key acts once: browser auto-repeat never acts, and native hardware-key repeats are dropped by a per-key gap (the platform's first repeat after its initial delay still counts as a press) (`lib/schedulerLapse.test.ts`, `lib/reviewerInputGuards.test.ts`). Set Due Date accepts only Anki's grammar (`5`, `3-7`, `0!`); negative or spaced forms are rejected (`lib/browserSelection.test.ts`). The classic "next position" counter of Reset is not adopted: Reset still places a card after the highest new position in use, because a counter honoured by Reset alone would disagree with every other path that assigns positions.

**Next compatibility gate:** iPhone smoke in both classic and redesigned modes on each reviewer change

## Daily limits, learning steps, lapses, leeches, burying

**Status:** Implemented with uncapped new cards (deliberate product policy, 2026-10-21)

**Evidence:** TusAnkiM no longer applies a daily new-card quota. Every eligible new card remains available in collection, deck, subdeck, subject and topic scopes, even after 20 introductions, with a stored zero/today-only/parent limit, or with the legacy “new cards ignore review limit” preference off. Queue loading has no replacement daily cap (a 200-card working window is refilled as cards are studied), and deck-list new counts are uncapped. Deck Options explains that new cards are unlimited instead of offering a quota, the reviewer has no new-quota completion screen, and Custom Study omits “increase today's new card limit”. Existing preset, per-deck and today-only new limits and the collection preference remain interchange metadata for backup/package round trips; they are not rewritten or reinterpreted as different units. This intentionally differs from the [Anki daily-limit semantics](https://docs.ankiweb.net/manual/deck-options#daily-limits).

Real-SQLite tests in `lib/studyQueue.dailyLimits.test.ts` cover 128 available new cards despite exhausted legacy limits, 21 actual answers followed by rebuilding and undo, unchanged imported metadata, and continued review-limit enforcement. `lib/deckManager.options.test.ts` covers uncapped deck-tree new counts, including legacy boosts and already-introduced cards. Learning steps, lapses, leeches, sibling burying and review caps retain their existing behavior. Deck-option advice remains non-blocking; advice based on a new-card quota is not shown. “Limits start from top” is off by default and governs review caps when enabled (`lib/studyRepository.scope.test.ts`).

New cards have no daily cap (product decision 2026-10-21); imported new limits remain metadata. Intraday counts stop at now plus learn-ahead. Interday learning consumes the global and hierarchical review limit before reviews; answered interday cards leave local per-revlog settings markers so the allowance does not refill after restart, and undo deletes its marker. Queue building suppresses siblings in memory while applying limits, using the earlier accepted sibling's preset; skipped siblings spend no review slots; answers persist burying only for the same or later eligible category. Priority is intraday, interday, review, then new; a new/review answer cannot bury an earlier-category sibling (`lib/ai2Queue.test.ts`).

The deck list, tree and sidebar count the same work the queue deals: intraday learning up to now plus the learn-ahead limit, interday learning spending a deck's review limit before reviews, and with "limits start from top" a subdeck row capped by its parents (`lib/deckListCounts.test.ts`). Only a deck scope has a limit of its own: course, topic and "all decks" scopes let every card answer to its own deck chain instead of capping the whole collection with the Default preset's limit, and the deck overview previews the queue with the deck's own preset (`lib/queueScopeOrder.test.ts`). Subdeck "today only" limits are read with the collection's rollover hour. Deck subtree scopes and per-deck usage match names exactly and case-sensitively (`lib/deckScopeCase.test.ts`). The local `interday_review_usage:` and `filtered_membership_v1:` rows are pruned by `pruneQueueBookkeeping()` (markers from before today's rollover or without a revlog row; builds of decks that are gone or not filtered), which also runs when the day rolls over in an open reviewer (`lib/filteredDeckDeletion.test.ts`, `lib/studyDayRollover.test.ts`). Crossing the rollover while the reviewer stays open unburies, clears the undo history and re-reads today-only limits. The day boundary follows local clock time, so on a daylight-saving change day it moves by the hour the clock moves; Turkey keeps no daylight saving, so the effect is limited to learners abroad.

**Sibling burying (2026-10-25):** gathering leaves a sibling out by the bury toggles of the decks its note's earlier cards sit in, merged per note as Anki's `get_and_update_bury_mode_for_note` does, rather than by the first card's deck alone (`lib/queueBuild.test.ts`).

**Next compatibility gate:** Preserve selected-deck/subdeck review limits and lossless new-limit interchange metadata. Wire `pruneQueueBookkeeping()` into app startup and after a backup restore or `.colpkg` replacement (owned by the backup code), so a restored collection never inherits stale markers. Verify on iPhone that a collection with a legacy 20-card preset can reveal, grade and undo beyond the twentieth new card without a quota message.

## Display/gather/sort order and learn-ahead

**Status:** Implemented with bounded new-card window

**Evidence:** six gather orders, five new-card sort orders, interday/review ordering and queue tests. All thirteen of Anki's review orders are offered, including the two retrievability orders, which appear only while FSRS is on because only then does a card carry the memory state they read (`reviewSortOrderChoices`). The scheduler decides what three of them mean, as `review_order_sql(order, timing, fsrs)` does: with FSRS on the two ease orders sort by difficulty in the opposite direction — and are relabelled for it — while relative overdueness is measured against retrievability, `-(R^(-1/decay) - 1) / (DR^(-1/decay) - 1)`, falling back to the interval measure for a card FSRS has never scheduled. A card with no memory state stands where SQLite's NULL would (`lib/queueBuild.test.ts`). A preset left on a retrievability order moves to relative overdueness if FSRS is switched off, and the ordinals still round-trip through `.apkg` (`lib/exportReviewOrder.test.ts`) The learn ahead limit (Preferences, default 20 minutes) also governs the reviewer's own step after an answer, not only a full rebuild: when nothing else is left, a learning card whose step ends inside the limit is dealt again at once instead of the "all done" countdown, and with other cards waiting it stays behind them (`advanceQueueAfterAnswer`, `lib/reviewerQueueAdvance.test.ts`).

New-card loading uses a 200-card replenished working window and SQL LIMIT, with one cached note-type read per type rather than one JSON payload per row. Deck gathering walks the decks in the deck list's order — siblings as the learner arranged them (alphabetical until reordered), each parent before its subdecks — so the catalog's topic subdecks arrive in course order; inside one deck a course's topics keep their listed order, then position. The window is filled deck by deck in that same order, never by deck-name collation, which misplaces Ç, İ, Ö, Ş and Ü (`lib/newCardDeckOrder.test.ts`). Sorting by template applies within the working window so later card types are not held behind the entire uncapped backlog. Mix uses a fixed 1:1 review/new cadence regardless of new-card total. These are explicit product differences from Anki's finite daily-new gather (`lib/ai2Queue.test.ts`). The two random gathers take their window from a per-day stable hash of the card or note id and every new-card shuffle is seeded by the study day alone, so a rebuild (every few answers, on focus, on the periodic refresh) no longer picks a different window or reshuffles it. "Deck then due" and "due then deck" rank decks by the same display walk. With "show new cards before reviews" and no daily new cap, each study day's first window of new cards (200, counted from the review log) comes first and due reviews are then served before further new cards, so reviews are always reached (`lib/queueScopeOrder.test.ts`).

**Insertion order (product difference, DST-6):** Anki's "Insertion order" assigns positions: switching a preset between Sequential and Random repositions the existing new cards of its decks, and Random gives each new note a random position when it is added. TusAnkiM does not rewrite stored positions. The preset value is kept and exported (`new.order`), and Random shuffles new cards per study day in the "Deck" gather order, stably across rebuilds. Rewriting `due` of every new card on a preset change, and randomising positions at note creation, would change persisted positions from the Deck Options save and the note-creation paths at once; before release this needs a pre-change backup, an explicit confirmation and its own round-trip tests, so it is deferred rather than done silently. Review gather sorts lightweight scheduler keys across the entire due backlog before the limit, then loads fields/templates only for selected cards; interval/ease/retrievability orders cannot be truncated by an earlier due-date fetch window.

**Next compatibility gate:** Keep the queue's meaning and the dropdown's label in step whenever either changes

## Audio, timers and auto advance deck options

**Status:** Implemented

**Evidence:** per-card preset resolution, reviewer timer/auto-advance behavior and package round-trip tests

Manual answer replay plays question then answer audio, or only the answer when skip-question is enabled. Automatic answer playback excludes FrontSide audio while the displayed answer retains FrontSide content. The single card frame gets an explicit playback playlist; it does not route signals to a nonexistent question frame. Per-card presets and the global sound toggle control autoplay. A side's sound files and its text-to-speech play one after the other in the order of the side's first tag of each kind (grouped, not interleaved tag by tag), with a fallback when the first never starts; with "Interrupt current audio when answering" off, speech runs on into the next side (`lib/reviewerAvSequence.test.ts`). The answer timer, the Auto Advance reminder and the remaining-time estimate show in the classic toolbar as well as the redesigned one, and the "done for now" countdown runs to the moment the next learning card enters the learn-ahead window (`lib/reviewerInputGuards.test.ts`). Menus (including their Set Due Date/tag/reset dialogs), deck/catalog/custom-study pickers, route blur, backgrounding and whiteboard use block Auto Advance. A side owns its dwell clock: menus, route blur and backgrounding pause its accumulated time; only changing the card/side or dwell settings resets it (`lib/reviewerAudio.test.ts`, `lib/reviewerTimers.test.ts`, `lib/reviewerDwellTimer.test.ts`).

**Next compatibility gate:** Keep the study-session activation boundary explicit

## Reviewer Timebox

**Status:** Implemented

**Evidence:** Anki-aligned wall-clock block, post-answer Continue/Finish checkpoint, per-block repetition count, `lib/timebox.test.ts`

**Next compatibility gate:** Run the focused iPhone Timebox smoke when reviewer flow changes

## FSRS

**Status:** Implemented (FSRS-6). Scheduling (FSRS-A) and the optimizer (FSRS-B) are measured
against Anki 26.09.3 (29bb700b, fsrs-rs 6.6.2), recorded on 2026-10-23; this is not full client
parity.

**Evidence:** `scripts/anki-oracle/` runs Anki's own bundled interpreter/backend against temporary
collections. The ten existing generators ran without API changes. `build_fixture.py` checks the
recorded version and builds `test/fixtures/anki-26.09-fsrs.json` without optimizer output, which
FSRS-B records separately. The four suites `lib/fsrsAnkiParity.test.ts`, `lib/previewAnswers.test.ts`,
`lib/resetCards.test.ts` and `lib/ankiSortKeys.test.ts` now use that fixture. Existing Anki 26.05
package-import fixtures and the legacy optimizer reference remain unchanged.

What the current scheduling reference pins:

- all four answer outcomes for new, learning, review and relearning cards, their delays and
  intervals; whole answers through SQLite compare card columns, card data and revlog rows;
- memory replay from complete, truncated, reset, cramming and manual histories, plus the
  ignore-before cutoff and SM-2 fallback;
- same-day Hard/Good/Easy never lower stability (`rating >= 2`), unlike the old 26.05 Hard rule;
- `minimumReviewFuzzInterval` shared by answering and rescheduling: a rounded increase grows,
  an overlapping bounded window holds the old interval, and a genuinely smaller window can
  shrink. Anki's three upstream assertions and a capped-window case are in
  `lib/fsrsScheduler.test.ts`;
- six exact recorded scalar probes distinguish 6.6.2's f32 curve-factor and difficulty order
  from the previous Burn order. The broad state comparisons retain the documented exp/pow
  tolerance; an exact match on selected vectors is not an all-platform last-bit guarantee;
- Anki's seeded fuzz, learning-step randomness, workload balancing, Easy Days and the order
  cards are visited on preset rescheduling; intervals and due days match the recorded outputs;
- stored-state rounding (`s` 4, `d` 3, `dr` 2, `decay` 3 decimals), elapsed study days from the
  next rollover and the last counted review, preset-specific retention and decay;
- Reset Card's restore-position and reset-count options and their separate remembered contexts;
  preview answers and their filtered revlog rows; browser and filtered-deck sort keys.

**Card Info:** When FSRS is on, a non-new card with no memory state is projected from its history
using its home deck's preset. The computed state is never written. Ease is hidden whenever FSRS
is on, even for a new card; retrievability is a whole percentage. `lib/fsrsCardInfo.test.ts` renders
the screen against SQLite and a 26.09.3 memory vector, proves zero writes and unchanged card
JSON, and covers stored decay, FSRS off and filtered-card home-preset lookup.

**Optimizer:** "Optimize" (`lib/fsrsTraining.ts`, `lib/fsrsTrainingModel.ts`, `lib/fsrsPretrain.ts`):
Anki 26.09.3's production path around fsrs-rs 6.6.2. It retains outlier filtering and
pre-training, then trains eight epochs over whole-card windows (at most 512 predictions),
excluding prefixes longer than 256 reviews after recency weighting. Analytic gradients and
Adam moments use f64, the forward model and stored updates f32; the last epoch is used.
Same-day Hard has the stability floor. Evaluation sums weighted BCE sequentially in f32,
while the trainer clamps probabilities for finite derivatives. Cancellation and the existing
adoption rule remain. Four recorded collections (`test/fixtures/anki-26.09-optimize.json`)
include 64/65 and 255/256/257 review boundaries; five additional seeded collections up to
1,500 cards / 6,440 items were measured. Maximum parameter error was 4.76837158203125e-7;
evaluation matches within 1e-6 (`lib/fsrsTraining.test.ts`). The collector supplies original
card ids as non-persisted metadata (FSRS-A integration `aa7cf78`); the oracle tests use the
production collector directly. An interleaved-history test in `lib/fsrsMaintenance.test.ts`
protects card identity while preserving review-log order.

**Collection operations:** `scripts/anki-oracle/gen_fsrs_ops.py` records Anki 26.09.3's own
results in `test/fixtures/anki-26.09-fsrs-ops.json`; `lib/fsrsCollectionOps.test.ts` replays them
through SQLite.

- Set Due Date follows the collection FSRS switch, not the card's memory state. With FSRS on, a
  card in the new queue or with no interval yet, learning cards included, stays at `ivl = 0`, and
  its first answer starts from the initial parameters. Other cards take the days since `lrt` plus
  the requested days, or shift by the due-date difference without `lrt`; `!` does not apply.
  With FSRS off the SM-2 rule applies even to a card that still carries a state. 80 recorded
  cases: 10 card shapes, both switch positions, inputs `3`, `3!`, `0`, `1!`. Anki's backend
  rejects a negative day such as `-2`, which this app's dialog accepts; that difference is
  outside this item and is recorded rather than changed.
- Change Deck clears the moved cards' FSRS data, then, with FSRS on, gives every card without a
  memory state in the target deck itself (not its subdecks) a state from its review log under
  the target preset's parameters, desired retention and decay. Nothing is rescheduled; `lrt` is
  kept. The move and the recompute are one transaction, and undo restores the moved cards' data.
  A memory-less card that already sat in the target deck also gets its state, as in Anki, and
  undo leaves that one in place.
- Check Database sets each non-new card's `lrt` to its last scheduling-affecting answer after the
  last reset, corrects a wrong value and removes it when no answer counts. New cards and cards
  without review-log rows are left alone. The audit counts these cards, the backed-up repair
  fixes them, and Settings reports both. The answer path stamps `lrt` at the start of the answer,
  while its review-log id is taken a few milliseconds later; when that crosses a second boundary,
  the next check corrects `lrt` by one second.
- A future "Ignore reviews before" date is saved, and used by Optimize, as the collection's today
  (rollover hour included). The text field clamps a complete future date like a date picker's
  maximum. Package import reads the date as written.
- An export without scheduling empties only `fsrsWeights`, `fsrsParams5` and `fsrsParams6`;
  desired retention, historical retention (`sm2Retention`) and the cutoff are kept, matching the
  recorded Anki export, and survive a re-import (`lib/ankiPackageRoundtrip.test.ts`).
- With FSRS off, the filtered deck dialog does not list the two retrievability orders. A deck saved
  with one shows Random, as Anki's dialog does, and is stored as Random only if the dialog is
  saved. Until then it keeps the order, round-trips it, and builds with the tiebreak alone
  (`lib/filteredDeckOptions.test.ts`).

**Next compatibility gate:** All eleven fifth-pass items now have code and automated coverage.
Older known differences remain: last-bit memory noise from platform exp/pow; filtered-deck
`prop:r` SQL comparisons in f64; new-card positions in the due/relative-overdueness orders use the
app's epoch; Reset Card allocates a missing position from the highest current position rather
than Anki's independent `nextPos`. The deliberate uncapped daily new-card policy remains
unchanged. Retention/true-retention graphs and the FSRS simulator are still absent.

Named iPhone smokes for the collection operations, not yet run: Set Due Date `3` on a new card
and on a review card from the reviewer menu and the browser with FSRS on and off, then answer
the new card; Change Deck of a reviewed card into a deck with another preset, then open Card
Info and undo; Check Database and "Repair and optimize" on a copy of a collection, reading the
new summary line; type a future "Ignore reviews before" date and save; open filtered-deck
options with FSRS off and on.

Named iPhone Card Info smoke still required: open a new card and an answered card without memory,
close/reopen Card Info, verify Ease with FSRS on/off, whole percentages, back swipe and VoiceOver.
That native smoke has not been run. Deterministic screen tests do not replace it.

Full item-by-item status and before/after evidence are in `docs/AUDIT_FSRS_ANKI_PARITY.md`.

## Hierarchical decks and presets

Normalized ancestor paths are resolved against one deck-name snapshot, keeping the existing 100-level hierarchy regression below the normal test timeout without weakening name normalization or exact legacy subtree rules.

Deletion undo also restores persistent per-deck whiteboard preferences/ink. Injected write failures roll back note/card/grave changes. The default deck ID 1 remains available after its contents are removed, with its name reset to Default (a free suffix is used on a legacy name collision); undo restores its previous name and subtree. Exact-prefix buried-card count/unbury queries have real SQLite regression coverage.

Changing learning/relearning steps or assigning another preset remaps the remaining-step counter from the last passed delay, including suspended/buried cards and cards temporarily in a filtered deck (home preset). Config and card writes share a savepoint; due values and queue units are unchanged. Change Deck applies the same remap when a learning/relearning card moves to a deck on a preset with other steps, and its undo restores the counter unless the card changed since (`lib/deckPresetSteps.test.ts`).

Deck creation trims and NFC-normalizes every `::` component (empty components become `blank`) and resolves case variants to the existing deck, including Unicode lowercase matching. Deletion, rename and unbury select legacy descendants using SQLite `instr` with the exact stored prefix, so case-colliding legacy trees and literal `%`/`_` names cannot be mixed (`lib/deckNames.safety.test.ts`). The Decks create, Add Subdeck and Rename flows accept `::` hierarchy paths; rename resolves each existing ancestor case-insensitively to its stored name. Creating a deck that already exists (any case) selects it, in the Decks tab and in every deck picker (`createOrSelectDeck`), instead of making a numbered copy. A rename, move or new filtered deck whose name is taken gets `+` appended until it is free, as Anki's `ensure_deck_name_unique` does (2026-10-25; it was refused, and earlier numbered `(1)`). New decks and implicitly created parents start on preset 1 rather than inheriting a parent's preset (DST-9). Saving a legacy deck under its own unchanged name never trips the collision check, even beside a case/space variant. Name lookups and deletions are batched (one name snapshot per rename; one statement per table for deletion capture and card/note removal) so large subtrees stay fast (`lib/deckStore.legacyNames.test.ts`). Query consumers outside `deckStore` still require the same exact-prefix treatment when legacy case collisions exist.

Deletion keeps lifetime review history. Note deletion from the editor, the reviewer and the browser selection (one transaction and one undo for the whole selection, `deleteNotes`) and deck-list deletion offer a one-shot Undo action with the affected card count; restoration refuses to overwrite intervening edits (`lib/noteDeletion.test.ts`). Undo currently lives only while the deletion result is held by the caller, not across app restarts.

**Status:** Implemented

The deck overview shows an imported HTML description as readable text (line-level tags become line breaks, other markup is dropped; DST-11), and its Unbury asks whether to unbury all, only manually buried cards or only buried siblings when both kinds are present, as Anki's overview does (`lib/deckOverviewParity.test.ts`).

The daily-limit tabs decide the review limit in effect, as in Anki: the screen opens on the tab that applies (Today only, else This deck, else Preset), and saving on a tab drops the more specific overrides it does not use (DST-7, `lib/deckOptionsLimitScope.test.ts`). Preset handling follows Anki's options screen: Add Preset asks for a name and starts from the built-in defaults rather than copying Default's current values (DST-8); deleting a preset is part of the unsaved form and happens on Save, so leaving without saving keeps it; Save to All Subdecks gives every normal subdeck the preset and this deck's "This deck" and "Today only" limits (`lib/deckSubdeckOptions.test.ts`). The preset menu runs the chosen action after it has dismissed on iOS, so a confirmation alert is not dropped.

Starting ease (1.31–5), Hard interval (0.5–1.3) and Interval modifier (0.5–2) now accept only Anki's ranges, so a typed value is not reset when the preset reaches Anki; a stored value from the older wider ranges is kept unchanged while untouched (DST-10, `lib/deckOptionsMultiplierBounds.test.ts`).

**Evidence:** validated/atomic Deck Options save flow, searchable deck picker, explicit deck-vs-preset labels, preset rename scoped to the selected config, hierarchical deck rename with subtree/collision protection, deck manager, deck-options form and deck-navigation tests. Which settings the screen shows follows the scheduler in use, as Anki's `{#if !$fsrs}` gates do: the ease multipliers, graduating and easy intervals and the lapse minimum are hidden while FSRS is on, and the FSRS inputs while it is off. A hidden field keeps its stored value through a save and can never report an error, because an error the learner cannot see is one they cannot fix (`isDeckOptionFieldVisible`)

**Overflow menu audit (2026-10-25):** Rename opens on the deck's full `Parent::Child` path, as Anki's Rename prompt does, so editing a level moves the deck; a path that reaches under a catalog deck is refused, in Rename and in Create Deck. Preset changes on Deck Options wait for Save as on Anki's screen: Add Preset (from the built-in defaults), Clone Preset (the current preset with the edits on screen), Rename and Remove change only what the screen shows, and leaving without saving forgets them (`components/deck-options/usePresetStaging.ts`, `lib/presetStaging.test.ts`); a clone never inherits catalog ownership or the package its source came from. The menu uses Anki's names, Clone Preset and Remove Preset. The deck overview shows the description with its bold, italic, underline, list bullets and http(s) links (`lib/deckDescription.ts`), a filtered deck shows Anki's fixed explanation instead of its own text, and the description dialog has Anki's "Interpret as Markdown", stored as the deck's `md` flag and carried through `.apkg` import and export. The study screen shows the description as text and never a filtered deck's. Unbury on the finished-deck screen asks the overview's question when both kinds are buried (`lib/unburyChoice.ts`), and the study screen's deck options open a filtered deck's own options for a card in one.

**Layout smoke (2026-10-16):** Decks shares the name/new/learning/review columns between phone and web, with common header/count widths and bounded compact indentation. The named production-web and iPhone-simulator checks, screenshots and physical-device limits are recorded in [Mobile layout review](ui-layout-review/README.md). This is product-specific presentation; deck hierarchy, count calculation and scheduling semantics are unchanged.

**Next compatibility gate:** Continue parent/subdeck limit tests

## Per-deck shortcuts

**Status:** Implemented

**Evidence:** deck overflow action, local `DeckShortcuts` module, Android pinned shortcut and iOS native Apple Shortcuts add flow; the web build copies a link that opens the deck, and the installed web app's manifest carries static Decks/Add/Statistics shortcuts

**Next compatibility gate:** Android launcher approval/open smoke; iPhone Apple Shortcuts add/run smoke

## Filtered decks and custom study

**Status:** Implemented subset: fixed virtual membership

**Evidence:** Context-preserving overview panels, two independent filters, all 11 gather search orders (0..10) stored with Anki's own ordinals (migration 10), rescheduling/preview modes whose Again/Hard/Good delays mirror Anki's `preview_again_secs`/`preview_hard_secs`/`preview_good_secs` (read from `Deck.Filtered` fields 7/5/6, which `decks.proto` numbers out of order; an omitted field imports as zero exactly as proto3 and Anki's schema-11 serde defaults leave it, and `60`/`600`/`0` are used only when creating a deck, matching `Deck::new_filtered`, whose second search term also starts at 20 cards) with Easy always retiring the card as `preview_filter.rs` does, gather orders built from `rslib/src/storage/card/filtered.rs` including its note-id/ordinal added order and its single timeline for due order, reviewer session countdown timers, excluded-card reporting, in-app help, deck manager, `lib/filteredDeckOptions.test.ts`, `lib/studyRepository.scope.test.ts`, and reviewer preview queue tests. An emptied filtered deck opened from the deck list offers Rebuild rather than Add Card, since tapping a deck now opens study instead of the overview. The study screen's finished state carries the actions Anki shows around its congrats page (`CongratsPage.svelte` and the overview's bottom bar): Custom Study for a regular deck, Rebuild for a filtered deck, and Unbury when the deck has buried cards. A filtered deck gathers its cards by search, so one that runs dry ends on the finished state rather than on the empty-deck state with Add Card. Custom Study opens over the reviewer and its session is studied in place.

**Membership:** Create/Build/Rebuild saves ordered card IDs once in collection settings. Queue refreshes, answers, search changes on the card and rollover never refill that build. Completed cards leave it; Empty releases reservations. Normal study excludes reserved cards and a second filtered build cannot claim them. The second filter applies its limit after excluding the first filter's cards. Imported physical filtered cards are visible in their session and Empty/Rebuild returns them home without clearing suspend/bury (`lib/ai2Filtered.test.ts`). Materialization and scheduling read the home due in `odue`, not a negative gather position; graduation returns the new schedule home, while ongoing learning updates `odue`. Physical cards use the home preset for scheduling, answer-time caps and sibling-bury settings. Undo restores the physical transport state only while the filtered deck still exists and no later move chose another destination.

Filtered counts subtract a reservation from the home due/learn-ahead counter only if that card was included there, so a future review cannot consume another due review. Stored membership, rather than timestamp-shaped card IDs, determines the build count (`lib/ai2Filtered.test.ts`).

A learning card a rescheduling build gathered is dealt straight away, as Anki replaces its due with the gather position; once answered inside the build it obeys its step timer. A preview deck counts what it holds as review (a card waiting out its preview delay as learning) in its queue and the deck list. Finishing a card and a preview delay are written inside the answer's own transaction, so a crash cannot re-deal an answered card. Deleting an imported physical filtered deck returns its cards exactly as Empty does (home deck, original due, suspend/bury kept) and drops its build row, which undo restores; deleting a home deck also deletes its cards a filtered deck holds. New filtered decks get an empty description, and Custom Study names its session in the interface language while rebuilding a session carrying the other language's name (`lib/filteredSessionRemaining.test.ts`, `lib/filteredDeckDeletion.test.ts`). The completed-card list of a build is bounded by the build's size and reset by Rebuild.

This remains a virtual model: local cards retain their home `did` and do not use Anki's `odid`/`odue` transport. Export/search/browser behavior must account for this documented difference. Imported `odue` conversions are owned by package import; this change does not guess or reinterpret broken persisted units.

**Filtered search:** SQL accepts whole quoted deck terms, wildcard deck names, note types, template names/numbers, note IDs, named fields and introduction windows (`lib/ai2FilteredSearch.test.ts`). Search interfaces remain unchanged; full search grammar/Unicode normalization is still subject to the Browser compatibility gate.

**Preview answers:** an answer in a deck with rescheduling off follows `apply_preview_state`. The card's schedule, repetitions and review time stay as they were. The answer is logged as a filtered review with no ease (`ivl` the preview delay, `lastIvl` the Again delay, negative seconds or days past the rollover), which FSRS and the optimizer skip as cramming and which counts as studied today but never as introducing a card. Siblings are buried, and under FSRS the card gets the preset's decay and any missing memory state, as for every Anki answer. A delayed card waits on the deck (`filteredPreviewDue`) with Anki's learning-step fuzz, across restarts, and comes back ahead of the rest. A preview answer can be undone. Checked against 72 answers recorded from Anki 26.05 (`lib/previewAnswers.test.ts`).

**Gather order:** every order but random is computed in JS from Anki's own keys, including the retrievability pair and relative overdueness, which Anki takes from registered SQL functions, and the `fnvhash(c.id, c.mod)` tiebreak (`lib/filteredDeckQueue.ts`, `lib/ankiSortKeys.ts`). With FSRS off the retrievability pair keeps only the tiebreak, as upstream. Checked against a filtered deck Anki 26.05 built for each order: the same cards in the same order (`lib/ankiSortKeys.test.ts`).

**Invalid searches:** the filtered-deck, Custom Study and Browse-to-filter dialogs check a search with the strict parser before saving it and name the search they refuse, as Anki refuses to build from a search it cannot parse. A search already saved before the parser became strict is not migrated: every collection read (deck list counts, study queue, rebuild, excluded count) treats it as matching no card instead of failing, so one such deck cannot blank the deck list or stop the reviewer (`lib/filteredSearchSafety.test.ts`). The browser still reports the error.

**Next compatibility gate:** `prop:due` still skips intraday learning cards (FLT-9): the search evaluator (`lib/cardSearchMatch.ts`) should compare a queue-1 card's due day (its timestamp's day relative to today) as Anki does, so "Review ahead" also gathers them. For a new card, the due and relative-overdueness orders read the queue position as a day number. Anki counts those days from the collection's creation and this app from 1970, so a new card whose position is beyond the collection's age in days is gathered first here and last in Anki. A filtered deck is never written to an exported package and its cards return to their home deck; upstream instead exports it as filtered when every original deck is present, and otherwise converts it to a regular deck keeping the cards inside it

## Custom study dialog

**Status:** Implemented

**Evidence:** Five visible options (the new-card quota increase is omitted because new cards are uncapped), with Anki's spinner bounds, remembered limit deltas and per-deck include/exclude tags, the four cram kinds, and the per-option search/order/reschedule contract pinned by `lib/customStudy.test.ts` against `rslib/src/scheduler/filtered/custom_study.rs`; empty results and a name clash are refused the way Anki refuses them. Building a session replaces the session deck's whole filtered configuration rather than merging into it, as `apply_update_to_filtered_deck` does: the second filter, "allow empty" and the preview delays are all rewritten, the delays to Anki's own 60/600/0, so nothing the learner edited on the deck by hand survives into the session the next run asked for (`lib/deckManager.options.test.ts`). The tag chooser opens on the deck's current tags with the remembered ones marked, the way `custom_study_defaults` rebuilds the flags, so a tag the deck no longer carries drops out of the selection instead of filtering the search down to nothing — and the "require one or more of these tags" box follows it, as `TagLimit` only ticks it for a tag it listed. A window search reaches as far back as it is asked to: `added:`, `rated:` and `introduced:` carry no ceiling of their own, matching a parser that only lifts a zero to one, so "preview new cards added in the last N days" is not quietly shortened to a year Extending today's limits follows the same switch Anki's `extend_limits` reads: the deck itself always, its parents only while "limits start from top" is on, its children never. That switch now defaults to off as `apply_all_parent_limits` does, so an unconfigured collection reads a subdeck's allowance from the subdeck the learner opened; a collection that had already turned it on keeps it (`lib/storage.roundtrip.test.ts`, `lib/studyRepository.scope.test.ts`)

**Next compatibility gate:** Keep the spec test in step with upstream when Anki changes an option

## Note types, conditional templates, cloze, typed answer

Saving a cloze note without any deletion now asks before keeping the note text and safety card 1. The decision checks all template-referenced cloze fields, so a valid deletion in an additional field does not trigger a false warning (`lib/editorClozeWarning.test.ts`). Empty Cards also detects static text around an empty replacement (BAK-9).

Bulk type conversion exposes `getNoteTypeChangeDeletionCount` for a read-only total before any mutation; the default call throws `NoteTypeChangeConfirmationRequired` with that total if unmapped cards would be removed. Add-screen type-memory changes are rolled back when durable new-note saving fails. Atomicity is covered for note deletion and preset/card-counter saves. The browser's Change Note Type runs that count first and, when cards would go, asks in a localized native confirmation that names the count and says review history is kept before converting with `allowCardDeletion`; the refusal error is localized too (`lib/noteTypeChangeFlow.test.ts`).

Real note fields now take precedence over same-named special fields (SAB-11). The built-in Basic typed-answer definition uses Front on the back instead of FrontSide (SAB-15), avoiding duplicate comparisons in Anki; existing stored/imported user templates are not migrated. Typed-answer and sanitizer helpers were moved into independent modules, with the old templates API re-exported and no import cycle; templates.ts is below 800 lines.

The Add screen remembers the last successfully added note type per destination deck, falling back to the collection last-used type and then Basic when unavailable. Route-specified types still establish the entry scope; failed/abandoned additions do not select a new default (`lib/editorNoteTypeMemory.test.ts`).

Duplicate detection now uses an unsigned SHA1 prefix over the HTML-free, NFC-normalized first field, including media filenames, and compares normalized text after the checksum lookup. Older local notes keep their FNV value until edited, without a migration: every first-field lookup (editor duplicate check, CSV first-field matching, legacy card import) asks the checksum index for both values and then compares the first field, with no note-type scan; a legacy row is matched only by the same raw first field it was hashed from (`lib/noteChecksum.test.ts`, `lib/noteChecksum.legacy.test.ts`). The stripped text follows Anki's `strip_html_preserving_media_filenames`: img/audio/video/object/source tags keep their `src`/`data` filename, comments and style/script blocks are removed with their contents, and entities are decoded strictly against the HTML 4 table Anki's decoder uses (so `&apos;`, a bare `&` or any unknown reference leaves the whole field undecoded, exactly as Anki does); after a successful decode every U+00A0 becomes a space, and a literal U+00A0 without any `&` is kept (`lib/noteChecksum.test.ts`). Notes saved by the editor, type changes and field edits store the sort field (`sfld`) as the same stripped text, as Anki does, so `<b>Zebra</b>` no longer sorts before `apple`; existing rows and the CSV importer's path are not rewritten (EDT-9).

P1 template fixes: renaming/removing a field rewrites its replacement/filter/conditional references on both sides; the note-type screen keeps a typed field name as a draft and renames once, on blur or Return, so references move straight from the original name to the final one, and a name another field already uses (ignoring case, as Anki's Fields dialog and collection layer do) is refused with the old name kept; a case-only rename of the same field is applied, where Anki's dialog ignores it (`lib/noteTypeEditor.test.ts`, `lib/noteTypeFieldNameInput.test.ts`); like Anki's Fields dialog, a new name starting with `#`, `^` or `/` or containing `:`, `{`, `}` or `"` is refused with a localized reason. The note-type screen lists every card template and edits/previews the selected one (SAB-9), and saving is refused, with one localized line per problem, for duplicate or invalid field names, references to a field the type does not have, unclosed or unmatched `{{#…}}`/`{{^…}}` sections, a standard front that uses no field and a cloze front without a cloze filter (SAB-10, `lib/noteTypeValidation.test.ts`); adding, moving or removing a field of an imported type moves the source model's per-field options (font, size, description, exclude-from-search, field id) with it, so the exporter's positional merge keeps them on the right field (SAB-14); generation checks populated original fields instead of template literals or filtered display output; as in rslib cardgen the card-level special fields (Card, CardFlag, Deck, Subdeck, Type, CardID) count as filled, Tags only when the note has tags, FrontSide never, and a real field of the same name replaces the special one. A field is blank only when it holds ASCII whitespace and bare `<br>`/`<div>` tags; attributes, `&nbsp;`, a literal U+00A0 or any other markup count as content, both for generation and for `{{#F}}`/`{{^F}}`. `{{#cN}}` is true on the card for cloze N (SAB-12) and `{{CardID}}` renders the card id. Typed comparisons are rendered through FrontSide when the answer template has no separate type marker; `type:cloze` contributes only an input and never a duplicate sentence (`lib/noteTemplates.parity.test.ts`). The earlier inline-cloze input placement was corrected to match this contract; iPhone typed-answer smoke must use a separate cloze replacement plus the type marker.

Every card of a newly added note shares one new-card position, as in Anki (cards added later by an edit still take the next position). The leech tag is matched case-insensitively and marks the note for sync. Field edits only add missing card ordinals; empty siblings retain IDs, decks, scheduling and history until Empty Cards. Cloze generation and the empty-card scan use the union of template-referenced cloze fields, with a first-card fallback for a deletion-free cloze note. Type changes use Anki's default mapping for both fields and standard templates: exact names are reserved first, then each unmatched target slot takes the next unused source slot by position. Converting into a cloze type keeps every card ordinal; cloze → standard removes only ordinals at or above the target's template count. Unmapped cards require `allowCardDeletion: true`; the browser presents that explicit confirmation and then offers a one-shot Undo (`changeNotesTypeUndoable`) that restores the note and card rows, drops cards the conversion generated and refuses to overwrite a later edit (`lib/noteCardGeneration.safety.test.ts`, `lib/noteTypeChange.mapping.test.ts`). SAB-7 was already fixed in the baseline and remains covered by the sibling-deck tests.

A card whose front no longer renders, kept because an edit never deletes cards, shows Anki's notice on both sides ("The front of this card is blank." or, for a cloze card, "No cloze N found on card…") instead of a blank page, as `render_card` does. Cards an edit or a note-type change adds take the position of a sibling that is still new, otherwise one fresh position shared by the note, as `cardgen.rs` chooses it.

**Status:** Implemented

**Evidence:** AnkiMobile-aligned rich text editing toolbar grouped into Home/Styles/Insert tabs (Anki's own inline formats, lists, four paragraph alignments and indent/outdent as in `ts/routes/editor/editor-toolbar`; plus local additions Anki's editor does not have — block styles, quote, code block, table, validated http/https/mailto link, callout and font size — with MathJax and a raw HTML source editor), whose insertions are pinned by `lib/editorToolbar.test.ts` to pass the field sanitizer unchanged, note-type template aware card generation validation (a note saves whenever any template would generate a card, so an empty front is allowed when the reversed card generates — a deliberate divergence: Anki's `note_fields_check` tests only whether the first field is blank and refuses the note either way), native or template-positioned `#typeans` input, optional focus, token-bound/bounded WebView bridge, template, bridge, settings round-trip and note manager tests; dynamic note-type picker exposing all collection note types with field/template counts and `/note-types` management shortcut; dynamic multi-field editor rendering arbitrary N-fields with per-field sticky pinning tied to the note type's sticky flag, keeping a pinned value verbatim with its media and links as Anki does (`lib/editorStickyFields.ts`, EDT-5), individual media attachment, localized labels, and the note type's own per-field font, size and right-to-left flag — the three values an imported collection carries on every field. A size or a family that a collection built elsewhere leaves unset, or writes outside anything a phone should render, falls back to the editor's own preference rather than being applied literally, and a family name is reduced to the characters a CSS family can hold before it is written into the field's stylesheet (`lib/editorFieldStyle.ts`, `lib/editorFieldStyle.test.ts`). The cloze button wraps the selection in the field being edited with its formatting and media kept, numbers it one past the highest cloze in any field of the note, and a long press (or the VoiceOver action) reuses that highest number, as Anki's same-cloze shortcut does (EDT-3, `lib/richTextEditorScript.test.ts`). The cloze button sits on the tab the toolbar opens on, which is the tab the save-time error tells the learner to look at, and adding a note offers to stay on the screen for the next one as Anki's Add dialog does — the pinned fields keep their values, the deck, note type and tags stay chosen. Real-time first-field duplicate detection (`findDuplicateNote`) matching AnkiMobile non-blocking warning badge with target deck reporting (`lib/editorDynamicFields.test.ts`)

Editing fields updates the shared note while preserving each existing card's deck and scheduling.
Choosing a different destination moves the selected card the way Change Deck does (FSRS memory state cleared for re-derivation, remaining learning steps remapped to the destination preset, `lib/tusCards.deckMove.test.ts`); newly generated cards use that
destination. `lib/noteManager.newTypes.test.ts` covers siblings stored in different decks.
Editor success, draft-baseline reset and external callbacks follow durable storage completion;
a read-only tab is rejected before note/tag mutation. A failed new-note flush removes its
unacknowledged rows so retry creates one note.

**Next compatibility gate:** Validate more add-on filters and complex templates

## HTML, images, audio, video, TTS

The editor source-restoration routine is literal trusted browser script, so different server/client compilation targets emit identical script bytes and CSP hashes (`lib/richTextEditorBuild.test.ts`). On 2026-10-23, an isolated Chrome 155 DOM smoke edited text next to nine imported HTML/media fixtures and preserved their exact source; script/onerror fixtures did not execute. This is a browser-engine check, not a physical iPhone smoke.

Editor storage now preserves source HTML independently of its safe display projection: bracketed sound markers, http/mailto/relative links, remote image references, SVG/MathML/style nodes and scrubbed attributes survive editing nearby text. Unsupported active nodes are inert placeholders, and links/media still obey the existing display CSP. Newly attached files drop the characters Anki's media check removes (`[]<>:"/?*^\|`, control characters, trailing dots/spaces), and `%`/`#` become `_`, so the stored file and its reference always agree; an existing reference whose name holds a literal `%` ("50% off.png") is no longer neutered to `#` by the display sanitizer. Attachments keep a timestamp prefix instead of Anki's content-hash de-duplication (EDT-6, `lib/fieldMediaSafety.test.ts`). A style attribute that mixes a `url(…)` declaration with safe ones keeps the safe declarations instead of losing the whole attribute (SAB-13). `<svg>`, `<math>`, `<form>` and field `<style>` blocks remain removed from the card display, and `data:image/svg+xml` images remain blocked: these are deliberate WebView security limits, not Anki behaviour. A pasted picture is always stored as collection media, as PNG with "Paste clipboard images as PNG" and as JPEG otherwise, as in Anki; remote images in pasted HTML are not downloaded (the app stays offline-first) (EDT-7). Before the rich editor is ready, the plain-text stand-in no longer selects the whole field on focus and is read-only for a field holding markup, entities or sound markers, so an early keystroke cannot replace formatted content (EDT-8). A `[sound:x]` inside an attribute value stays part of its tag, and a placeholder copied from another field is never saved: an inert one is dropped and a sound player becomes its `[sound:x]` marker again. The raw HTML editor saves its source directly; fields are no longer sliced at 2 MB (`lib/richTextEditorContent.test.ts`, script/CSP tests). Native rendering and keyboard smoke remains required.

**Status:** Implemented subset with an untrusted-content boundary

**Evidence:** sanitizer/CSP, card-content, media and package tests; Anki TTS language/voice/speed parsing, installed Enhanced/Premium iOS voice preference, generation-safe single speech queue, reviewer-only focus/foreground gating and hidden-content filtering are covered by focused TTS tests; scripts, network loads, active media documents and silent navigation are blocked. Reviewer and note editor both resolve Anki's bare media filenames by loading their WebView from the media directory (`lib/localMediaDocument.ts`), so a field shows its own images while its stored HTML keeps the plain filename; both documents refuse every navigation but their own base, keep file-origin reads and network off, and are pinned by `lib/localMediaDocument.test.ts` and `lib/cardContentSecurity.test.ts`. An attached file is named after the bytes actually copied rather than after the picker's label for them (`mediaFilenameForPickedAsset`, `lib/mediaFilename.test.ts`): iOS reports the library original (`IMG_0042.HEIC`) while handing over a transcoded JPEG, and storing that name would put a mislabelled media entry into the collection and into every `.apkg` exported from it; the same rule names an untouched photo saved out of the editor. The reference written into the field is built in one place and escaped for the attribute it lands in (`mediaReferenceSnippet`, `lib/mediaAttach.test.ts`), so a quote or an ampersand in a picked filename cannot close `src` early, and a bracket is taken out of an audio filename before the file is stored rather than truncating its own `[sound:…]` marker. A card page carries the active theme's text colour at zero specificity, as Anki does with the `body { color: var(--fg) }` it loads under every card, so a note type that declares no colour reads dark on the day surface and light on the night one, while any colour or `.nightMode` rule of the note type's own still wins; the typed-answer comparison uses Anki's pastel marks with black text, so it stays readable on either page (`defaultCardTextCss`, `lib/cardPageDefaults.test.ts`, `lib/templates.test.ts`). At night the page also carries Anki's `body.nightMode { background-color: var(--canvas); color: var(--fg) }` (`ts/reviewer/reviewer.scss`) at the weight it has in Anki, as `div.nightMode` because the card is a `div` here, ahead of the note type's CSS: a stock `.card { color: black; background-color: white }` then shows the theme's text on the reviewer's own surface instead of a white strip, while a note type's `.nightMode.card` rule still wins (`nightModeCardCss`, checked in a browser engine on the stock Basic card and on a note type with its own night colours)

The web reviewer and editor share `components/WebHtmlFrame.tsx`: their HTML is written into the existing same-origin blank document instead of assigning `srcDoc`. In Safari, successive `srcDoc` loads could add child-document entries to the browser history and a reviewer return could restore a blank `about:srcdoc` in the main tab. Keeping content updates out of navigation preserves the app router's history; unchanged HTML is not rewritten on a height report, so editor selection and event bindings survive. Sandbox permissions and the inherited and document CSPs remain in force (`lib/webHtmlFrame.test.ts`; HTML Standard frame-navigation and document-open references in the registry).

**Web verification (2026-10-08):** On macOS 26.5.2 / Safari 26.5.2, the local production build at `d1531bf` reproduced the blank main-tab `about:srcdoc` after successive TUS Kartları answers and a sidebar return. With this fix, six catalog answers kept `history.length` unchanged; sidebar return, reviewer back arrow and browser Back all reached `/decks`. The redesigned reviewer passed six reveal/grade/undo cycles and a header return on a Basic fixture. Both rich editor fields saved a Basic note immediately. Chromium 153 and Playwright WebKit 26.5 also passed four Basic-note saves and three successive answers followed by a sidebar return. `npm run quality` passed 1,643 tests and the production web export succeeded. These are web smoke results; the native WebView path was not changed or tested on a physical iPhone in this change.

**Next compatibility gate:** Add offline MathJax and custom-font runtime QA without weakening CSP. On web the field editor runs the same document and script as the iPhone WebView, in a same-origin iframe the host calls into directly; its media, which lives in IndexedDB there, is shown through object URLs with the real filename kept in `data-tus-src` and restored before the field is saved. The field script is one constant whose hash the web app's CSP names, because the blank iframe inherits the page's policy (`lib/richTextEditorScript.ts`, `lib/webAppContentSecurityPolicy.ts` and their tests). A non-media file attachment is stored, referenced and exported, but the link policy allows `href` only for a fragment or an absolute https URL, so the reviewer renders it with `href="#"` and it does not open the file (pinned in `lib/mediaAttach.test.ts`); opening one needs the link policy and the reviewer's navigation rules changed together.

## Reviewer card display: page, night mode, typed-answer comparison, scroll to answer

**Status:** Implemented

**Evidence:** The reviewer paints the page and the card document is transparent over it, so no white slab sits behind a card in either theme. Night mode reproduces Anki's `body.nightMode` override at the same specificity (`div.nightMode`, 0,1,1): a stock `.card { color: black; background-color: white; }` reads as light text on the night page, while a note type's own `.nightMode.card` rule still wins. In day mode a light authored page — white, off-white or cream, relative luminance of at least 0.8 — is handed to the reviewer canvas, and a darker, patterned or unreadable one keeps its paint so its text keeps its contrast (`lib/cardAppearance.ts`, `lib/cardAppearance.test.ts`). The typed-answer comparison uses the markup of Anki's `compare_answer`: nothing typed shows the expected answer alone, an exact match one `typeGood` run, anything else the typed line, `↓` and the expected line, with Anki's `#afa`/`#faa`/`#ccc` marks (`lib/templates.test.ts`). Revealing an answer scrolls the template's `id=answer` element to the top once the side's images have loaded, as Anki's reviewer does (`answerScrollTarget`, `lib/reviewerPresentation.test.ts`), and the remaining counts underline the queue the card on screen came from. Show Answer and the grades sit in one bar above the home indicator in both reviewer layouts, where AnkiMobile keeps them, and the classic layout centres the counts under them as `new + learning + review`, the form of Anki's bottom bar. A deletion still hidden on the question side is tinted at zero specificity, so a note type's own `.cloze` rules still decide its look; the curated catalog also takes the app's text and cloze colours and drops the AnKing rule and line breaks that only served Anki's full-screen reviewer The expected answer is prepared the way Anki's `strip_expected` prepares it: a line break reads as one space and both sides are NFC-normalized. `{{type:nc:…}}` is read as one instruction, as Anki's reviewer reads it, so it ignores accents in the comparison while still showing the expected answer with them, rather than stripping the accents from the answer as a stand-alone `nc` filter would (`lib/templates.test.ts`).

**Next compatibility gate:** Three deliberate departures keep a partly typed list answer readable on a phone: an omission shows at most three `-` rather than one per character, a single shared letter stranded inside a longer mistake is not counted as a match, and the comparison keeps the card's typeface rather than Anki's monospace. Run the reviewer card display smoke in both themes on each reviewer change

## MathJax/LaTeX runtime rendering

**Status:** Not implemented

**Evidence:** Source fields are preserved on import

**Next compatibility gate:** Bundle an offline renderer; never depend on a CDN

## Whiteboard/scratchpad and drawing attachment

**Status:** Implemented subset

**Evidence:** geometry/photo tests, reviewer UI, and a blank drawing page that opens the full annotation editor (pen, highlighter, shapes, movable text, placed pictures, partial/whole eraser, undo/redo, crop, rotate) with ruled/plain paper pinned by `lib/blankCanvas.test.ts`; the saved PNG is attached as a normal `<img>` media reference. A picture chosen from the library or taken with the camera is placed on the page as an annotation rather than a second attachment: it lands where the page was tapped, it is drawn under the ink so every stroke made over it stays on top, it is carried through undo, crop and a quarter turn with everything else on the sheet, and it is baked into the exported PNG at the export surface's resolution. The eraser deliberately passes over it — rubbing out a stroke drawn on a picture must not take the picture with it — so a picture is removed by selecting it and using its own bin (`photoImagePlacement`, `resizePhotoImage`, `lib/photoEditor.test.ts`). A placed picture and a written label are manipulated by one selection frame, which is derived from each kind's own geometry rather than built twice (`selectionGeometryFor`, `photoSelectionHandlePoints`): its four corners resize about the corner opposite the one being dragged, keeping a picture's aspect exact and scaling a label by its font size, measured from the box the corner was grabbed at so a drag never compounds its own samples and a drag back restores the size it started from (`photoHandleResizeFactor`, `photoAnchorForFixedCorner`, `resizePhotoImageByHandle`, `resizePhotoTextByHandle`); its knob turns the object freely and settles onto quarter and half turns the finger is already within a few degrees of (`resolvePhotoHandleRotation`), and swaps to the other side of the frame rather than being clipped off a page it would hang over (`photoRotateHandleSide`); a drag gives way to the page's own centre lines, measured on the box's middle rather than on the anchor a label hangs from (`resolvePhotoDragSnap`). The handles are painted at the same points the gestures hit-test against, so a handle is never somewhere other than where it must be reached for. Either object tool takes hold of either kind of object, in the order the page draws them — a label over a picture is what the finger reached for — a second tap on a label opens it for editing, and a label written by tapping the page lands under that tap. One range governs a label's size however it is changed, by the pill, by a pinch or by a corner (`clampPhotoTextSize`). A page carries its ruling rather than re-deriving it, so cropping trims the sheet without resizing its squares and a quarter turn takes the rules with the ink — writing stays on the line it was written on, and lined paper turned on its side is ruled down the page; undo restores the sheet along with the strokes. The paper, page colour and shape a drawing was made on are remembered and reopened for the next one (`lib/blankCanvasSetup.ts`), a local row like the board's, and leaving the editor with unsaved ink asks first. The PNG is rendered on its own off-screen surface at the drawing's real resolution rather than photographed off the canvas the user drew on, so a page created at 1600×1200 is exported at 1600×1200 and an annotated photo keeps its detail up to a 2000px cap instead of collapsing to a screen's worth of pixels; stroke widths and label sizes are taken up with the surface, so the exported drawing is the one that was on screen (`photoExportSurface`, `scalePhotoAnnotation`, `lib/photoEditor.test.ts`). The reviewer board is bounded to the card stage, so ink never lands on the reviewer toolbar or the fixed answer bar, and those stay tappable while drawing. Answering a card clears its ink and drops its stored strokes, so a card that comes back after Again starts on a clean board, as AnkiDroid starts every question; otherwise ink clears only on a genuine move to another card, on a deck switch, or when the learner clears it: an empty queue is not a card change, so a learn-ahead rebuild, a timebox checkpoint or the "all done" screen no longer destroys a drawing. Auto Advance is suspended while the board is open and its dwell resumes rather than restarting, and a background queue refresh holds the drawn-on card in front; both rules are pinned by `lib/reviewerTimers.test.ts` The board's on/off state, stylus-only choice and pen colour are stored per deck and restored on return, as AnkiDroid's MetaDB `whiteboardState` row does, with a separate pen kept for the light and dark themes and non-hex colours refused before they reach the renderer (`lib/whiteboardSession.ts`, `lib/whiteboardSession.test.ts`). Like MetaDB, the row is local and stays out of the exported collection: a pen colour describes the device in the learner's hand, not the collection

**Next compatibility gate:** Apple Pencil-only mode is pending.

## Browser, card/note table modes, tags, flags, marks, suspend/bury, reposition

Browser operations retain the original new-card position through Set Due Date and sample due ranges independently. Reposition follows Anki's `sort_cards` (`lib/browserReposition.ts`, `lib/browserReposition.test.ts`): only new cards move, siblings share their note's position, notes keep selection order or a random one ("Randomize order"), and "Shift position of existing cards" moves every other new card at or after the start by step × the number of selected cards — Anki counts cards, not notes, so siblings leave gaps. The shift and randomize choices are remembered (shift starts off, as in Anki), the whole operation is one transaction, and the last reposition can be undone from the dialog. Choosing the flag the current card already has clears it from the selection. The Due sort orders new, learning, then review cards by one key that reads an epoch-ms learning due as days, in both table modes.

`lib/collectionCardSearch.ts` is the shared evaluator for browser and filtered SQL searches; exported SQL helper signatures remain unchanged. Term semantics follow the manual's searching page (`lib/searchSyntax.test.ts`, `lib/searchParitySafety.test.ts`):

- Plain text searches every field's stored HTML (joined with Anki's field separator, so `&amp;`, not `&`, finds an ampersand) plus the sort field with its formatting removed, which is how a word formatted mid-way is still found there. Tags, deck names and serialized metadata are not searched. `*` is any run and `_` one character; a backslash makes `*`, `_`, `"`, `:`, `(`, `)`, `-` literal.
- Field searches compare the whole field: `front:dog` does not match "underdog", `front:*dog*` does. `front:` finds an empty field, `front:_*` a non-empty one, `front:*` any note with the field; field names take wildcards (`fr*:x`); `front:re:` and `front:nc:` read the field as a regex or without accents.
- Case folding: Anki folds Latin case in plain text and full Unicode case in names, field searches and regexes. This app folds full Unicode case everywhere and folds the four Turkish i forms (I, ı, İ, i) together, so `deck:immunology` finds "Immunology" and `deck:isi` finds "Isı" — a deliberate superset for Turkish content. Accents are kept: "cografya" does not find "Coğrafya" without `nc:`, as in Anki.
- Also supported: `tag:re:` (per tag), `tag:*` (every note, untagged included), `tag:none`, `w:` with `*`/`_` (Unicode word boundaries; formatting breaks words), `sc:` (through cloze markup), `re:` (case-insensitive unless it starts with `(?-i)`), `deck:*`, `deck:filtered`, `deck:current` (the browser's selected deck; the whole collection elsewhere), a filtered deck's name (its members, virtual or physical), a card's home deck for a card physically in a filtered deck, `preset:`, `mid:`, `did:` (the deck without children, or a filtered card's home), `dupe:<notetype>,<first field>`, `has-cd:`, `prop:cdn:`/`prop:cds:`, `prop:rated`, `prop:resched` and `resched:`. `prop:due` reads an intraday learning card's due time as whole days from the next rollover (truncated toward zero, as Anki's SQL does), so learning cards due today match `prop:due=0`/`prop:due<=0` in the browser and in filtered decks. `added:` reads the card id (its creation time, kept through import) and `edited:` the note's own modification time, as Anki does.
- Not implemented or differing: the "Ignore accents in search" preference; regexes use JavaScript syntax (inline flags other than a leading `(?-i)` are rejected); `nc:` removes combining marks only (no `ß`→`ss`); `dupe:` compares the formatting-free first field exactly rather than through a checksum; manual reschedules are read as revlog rows with ease 0 and type 4 or 5.

Invalid complete structured terms, regexes, quotes and groups throw `SearchSyntaxError`; picker tokenization remains tolerant of unfinished drafts. A half-typed search in the browser (`is:` on the way to `is:new`) keeps the last valid results and selection and says so under the field; rows stay on screen while the next result loads. Malformed card JSON no longer fails the listing or its sort columns, and id scopes bind one JSON parameter instead of one SQL variable per card. The evaluator scans collection rows and materializes matching IDs using `json_each(?)`. The scan reads card columns only: each note type is read once per search, notes once each and only when a term reads note content, the card blob only for `prop:s/d/r/cd*` and `has-cd:`, decks/presets/membership only for `deck:`, `did:` and `preset:`, and the browser's marked/state/tag filters share one pass (`lib/collectionCardSearch.test.ts` pins identical results against the full-row evaluator). Indexed/streaming evaluation for very large collections is a remaining performance gate.

Reposition takes Anki's dialog bounds (start 0–1,000,000, step 1–10,000) and opens on start 0 with the remembered Randomize and Shift choices, shows the new queue's top and bottom position as Anki's dialog does, and gives a new card gathered into a filtered deck its home position (`odue`), as `Card::set_new_position` does. Set Due Date opens on the text last applied from the same place, kept apart for the browser and the study screen as Anki's `SET_DUE_BROWSER` and `SET_DUE_REVIEWER` are, and empty before the first use (`lib/setDueDateDefaults.ts`).

**Status:** Implemented subset

**User journey regression (2026-10-21):** The browser header counts rows matching the active text search, deck and other filters, using the same result total as pagination. Web checkbox/radio controls expose explicit `aria-checked` values alongside the existing native accessibility state; the multi-flag group reports `mixed` when partially selected. Named production-browser checks and scope limits are recorded in [USER_JOURNEY_FIXES.md](USER_JOURNEY_FIXES.md). These changes do not expand the supported search grammar or claim native VoiceOver verification.

**Evidence:** In-place searchable deck scope picker with inline create-and-select, scoped tag and multi-flag filters, optional safe audio-filename projection, Notes-mode first-card and aggregate-row semantics, browser/search/table-mode/selection tests. A row out of the queue is tinted rather than faded, as Anki does it: suspended rows take a warm tint and buried rows a neutral one, the text keeps its full contrast, and a selected row still reads as selected because the selection style is applied last. Search results are authoritative identifier lists from the shared evaluator; the screen no longer re-filters a loaded page using an incomplete projection of its note fields. Partial-context library predicates still leave unavailable metadata undecided (`lib/cardSearchMatch.test.ts`).

**Next compatibility gate:** Close the search differences listed above; profile the shared evaluator on large iPhone collections. Remaining audit P3 differences: Ease/Card type/Notes-mode Deck sort details, a single "marked" rule across screens, and "Create filtered deck" still routes through the Decks tab (the filtered-deck dialog takes no initial search when opened over the browser). Notes mode shows no suspend or bury tint, and should not grow one: upstream decides row colour in `rslib/src/browser_table.rs` `get_row_color`, which in notes mode returns only Marked or Default and reads a card's queue solely in cards mode. Adding a tint there would be a divergence, not a fix

## Empty Cards maintenance

All ordinary card removals (note, deck, confirmed type conversion, Empty Cards and orphan-card repair) now share `deleteCardRows` in `lib/noteDeletion.ts`. It writes card graves and removes search rows while retaining revlog. Nonexistent IDs do not create phantom deletion records.

Keep Notes defaults to on: if every card of a note is selected, the lowest-ordinal card remains. Turning the switch off allows card-only deletion while retaining note text and revlog. Database repair recreates card 1 for readable cardless notes rather than deleting their text (`lib/maintenance.test.ts`).

**Status:** Implemented subset

**Evidence:** Canonical `/empty-cards` full-screen route; reports cards whose generated front/cloze/template is no longer valid, deletes cards without deleting notes or sibling cards, uses explicit destructive confirmation and transactional bulk deletion

**Next compatibility gate:** Add a named iPhone smoke test for VoiceOver, scan failure and destructive deletion

## `.apkg` import/export with media and scheduling

Author updates match note types by stable id; stable field/template ids distinguish a rename from a schema change. Duplicated schemas retain `originalId` and are reused across author packages. Conflicting GUID notes and all their incoming cards are skipped and logged separately. Equal imported presets are reused; an updated deck using source preset 1, or an import without presets, keeps its local preset and limit overrides. Per-deck new/review overrides, including zero, are read from legacy JSON and modern optional proto fields and written back into packages. Media-name fixups preserve the source note modification stamp so later if-newer author updates are still eligible. All media extensions are preserved as bytes, including SVG image masks; renderer CSP/sanitization and navigation restrictions continue to control execution and opening. `lib/ankiTransferSafety.test.ts`, Anki fixture imports and card-content security tests cover these paths.

Package update regressions (`lib/ankiTransferSafety.test.ts`) cover unchanged GUID matches with missing cards, schema conflicts, media repair on a duplicate import, and indexing before COMMIT. Scheduled exports and re-imports preserve negative/zero day offsets and active/inactive learning due units, including original day/timestamp due values. Progress-free imports retain source new-note order and shared sibling positions, strip remembered scheduling data while preserving opaque add-on keys, and disable pristine-original passthrough. Deck-tree package scope selects notes and retains every sibling card, including siblings in another deck (`lib/ankiTransferSafety.test.ts`).

Deck names in a package resolve to existing decks ignoring case, part by part, so `medicine::Cardio` joins an existing "Medicine" instead of creating a second tree; a deck renamed because an incompatible deck of the same name exists ("X (Imported)") takes its subdecks along. A review whose id the collection already has is skipped, as Anki skips it, rather than rekeyed to the import time. A v1-scheduler relearning card (type 2 in a learning queue) arrives as type 3, as Anki's own upgrade makes it. A template's deck override (`did` on the template) is remapped to the local deck the package's deck became, dropped when that deck did not come along, and exported only when its deck is in the package (stored as `deckOverrideId`; the editor does not use it yet). A text-import update stores the sort field without formatting, as Anki's `sfld` is. When a package's deck/note-type metadata cannot be read, the simplified importer still runs and the import summary says the note types were simplified. The pristine copy of an imported package, used only for a byte-identical re-export, is stored only when that export is possible and the package is at most 64 MiB; Check Media (Backups screen) treats a copy that can no longer be used as unused. Packages are read from Files in 6 MiB chunks rather than through one base64 string, and the limits are 400 MiB per package, 200,000 entries, 2 GiB unpacked and 100 MiB per media file, media being inflated and written one file at a time (`lib/transferRemaining.test.ts`, `lib/filesChunkedRead.test.ts`, `lib/ankiPackageArchive.test.ts`). The whole package is still held in memory while it imports.

**Package format (2026-10-25):** the export screen has Anki's "Support older Anki versions", off by default as in Anki. Off, a package stores `collection.anki21b`, every media file and the media list as zstd frames, lists the media as a `MediaEntries` protobuf with each file's size and SHA-1, and marks itself `VERSION_LATEST`; the frames are written in raw blocks, since the zip around them already deflates (`lib/ankiPackageLatest.ts`). On, it writes the legacy `collection.anki21` with a JSON media map, which is what every earlier export of this app was and what callers that do not choose still get. Both formats, as `.apkg` and `.colpkg`, were imported into Anki 26.09.3 through `scripts/anki-oracle` with the same decks, notes, cards, reviews and media (Turkish names with spaces included) in every import option, and a description's `md` flag arriving as Anki's own; the app's own importer reads both back. The small `collection.anki2` that Anki adds to tell Anki 2.0 to upgrade is not written. The export screen's defaults follow Anki's dialog (`qt/aqt/forms/exporting.ui`, `exporting.py`): scheduling on except when opened from one deck, deck presets off, media, tags and HTML on, and the deck, note type and GUID columns off.

**Status:** Implemented subset with bounded archive and SQLite validation

**Evidence:** `lib/importApkg.ankiExport.test.ts` imports one collection as Anki 26.05 exported it
in both formats: the default (`test/fixtures/anki-26.05-modern.apkg`, a zstd-compressed schema-18
collection with zstd media) and "Support older Anki versions" (`anki-26.05-legacy.apkg`). Both are
recorded, with Anki's own record of the collection, by `scripts/anki-oracle/gen_apkg.py`. Note
types, notes, decks, every preset option the app uses, cards, review history and media are checked
against that record, and the two formats against each other. The default format needs:

- its name indexes and tags table dropped from the importer's in-memory copy. Anki orders them
  with a `unicase` collation that only its own backend registers, so SQLite cannot open them and
  validation failed with "no such collation sequence: unicase" on the web and on iPhone. The import
  reads neither, and the package itself is kept byte for byte;
- its WAL-mode header marked as a rollback journal, because expo-sqlite cannot open a WAL database
  from memory ("unable to open database file" on iPhone);
- deck names read with `\x1f` between their parts, where the legacy JSON has `::`;
- presets read as proto3, which leaves out zero and false (0 new cards a day, wait for audio off),
  and whose new-card insertion order is numbered the other way round from the legacy JSON;
- 32-bit floats read as their shortest decimal, the way Anki writes them to the legacy JSON;
- the media manifest read as a zstd-compressed `MediaEntries` protobuf, entries numbered by position.

Like Anki, an import creates only the decks the package's cards use: the decks they are in, a
filtered card's home deck when progress is imported, and every deck above those. The empty Default
deck every package carries therefore stays out instead of appearing beside this app's own default
deck, and so does any other deck without cards. A Default deck that holds a card comes along with
progress; without progress its cards join this collection's own default deck. A `.colpkg` replaces
the collection with all of its decks (`lib/importApkgDecks.test.ts`, and
`lib/importApkg.ankiExport.test.ts` on the fixtures; each case was measured in Anki 26.05 through
`scripts/anki-oracle`).

Package round-trip, backup-source export, archive-security, SQLite-security and import integration
tests cover the rest; a stored snapshot can be exported without consulting or replacing the live
collection, known file size is checked before reading, and every package import creates a recovery
backup. An exported preset carries its Easy Days under Anki's `easyDaysPercentages` key, over any
values it was imported with, and also as `easyDays` for earlier builds of this app; its interday
learning burying goes under Anki's top-level `buryInterdayLearning` key the same way, whether the
preset was made here or imported (`lib/ankiPackageRoundtrip.test.ts`), and Anki 26.05 imports
both kinds with the app's value (checked through `scripts/anki-oracle`).

Anki 26.05 accepts the packages this app exports. It refuses a whole package whose deck lacks one of
the `lrnToday`, `revToday`, `newToday` and `timeToday` pairs ("decoding decks: JsonError"), so
every exported deck carries all four, zeroed: a pair counts days from its own collection's creation
and this package is created on the day it is exported. It also refuses a deck that names a preset
the package lacks ("No such deck config"), so an export without presets still carries preset 1,
which its decks then name, as Anki's own exports carry their Default preset
(`lib/exportAnkiPackage.ankiImport.test.ts`). Exports of both fixtures, with and without progress,
imported into Anki under all four combinations of its import options with every deck, card and
review (`scripts/anki-oracle/import_app_export.py`)

**Next compatibility gate:** Re-record the Anki export fixtures for each new Anki release and import
an app export into it with `scripts/anki-oracle/import_app_export.py`, and run the physical-device
large-package smoke

## `.colpkg` replacement

**Status:** Implemented with explicit destructive confirmation and a restorable pre-operation safety backup

A collection package carries what Anki's does beyond the tables: the `col.tags` registry of every tag in use, a legacy `col.conf` with `schedVer` 2 (without it Anki reads the collection as the retired v1 scheduler), the rollover hour, `nextPos` and the default current deck, every filtered deck with its terms, and the review history of deleted cards. Filtered membership is virtual here, so a filtered deck arrives empty in Anki until it is rebuilt; a card that is physically in a filtered deck stays in it. Notes created in this app still carry the app's field checksum (note/model code). Replacing the collection also clears a backup's pending catalog overlay and the queue's filtered-membership and review-allowance rows of the replaced collection (`lib/transferRemaining.test.ts`, `lib/ankiPackageRoundtrip.test.ts`).

**Evidence:** import confirmation and backup tests. Replacement is not a way out of a damaged collection, so it runs only after a backup that can itself be restored: when a damaged row would leave only a recovery copy, the import stops before reading the package, changes nothing and asks the learner to run Repair first (`lib/packageImportWorkflow.ts`, `lib/destructiveBackupSafety.test.ts`). A merge `.apkg` import may still proceed on a recovery copy.

**Next compatibility gate:** Add real-device large-package smoke

## CSV/TSV/TXT import/export

Explicit picker note-type/deck choices take precedence over global file headers; `useFileDefaults` opts a non-UI caller into header defaults. Per-row metadata columns remain supported. The initial Allow HTML choice detects tags in the first 25 preview rows unless a header or caller overrides it (`lib/ankiTransferSafety.test.ts`).

Defaults follow Anki's text importer (`rslib/src/import_export/text/csv/metadata.rs`, behaviour only; `lib/transferRemaining.test.ts`): without a `#separator:` the first of tab, pipe, semicolon, colon, comma and space that occurs in the first 8 KiB of data is the separator — so a Turkish spreadsheet row `Kalbin, akciğerin…?;Pompa, solunum` reads as semicolon-separated, and a file of colon-bearing text may need the separator picked by hand, exactly as in Anki. `#columns:` labels map fields by exact name; otherwise fields take the non-meta columns in order; the first field always gets a column; without `#tags column:` the first free column after the last mapped field is the tags column. `#if matches:` (update current / keep current / keep both), `#match scope:` (notetype / notetype + deck) and the legacy first-line `tags:` header are read and preselect the screen's choices. A row too short to reach a mapped column keeps that field on update, as Anki leaves a field it was given nothing for.

Updates preserve unmapped fields and existing tags when no tag column was supplied; an explicitly mapped empty cell clears that field or tag set. Preview and write use the same merge rules. A row updates every same-type note its first field matches, not only the first, and an update (or an unchanged re-import) generates any card a template or cloze number now produces, without touching existing siblings' scheduling; the log still counts one row (`lib/ankiDataSafety.test.ts`, checked against Anki 26.09.3 by `scripts/anki-oracle/verify_note_import_media.py`). Text exports quote `#` so comment-like GUIDs and first fields survive re-import (`lib/ankiTransferSafety.test.ts`).

**Status:** Implemented; Anki's own option set (separator with override, Allow HTML in fields, note type, deck, Existing notes, Match scope, Tag all notes, Tag updated notes, per-column field mapping) and its per-note outcome buckets. Fields are escaped exactly as Anki's importer does when HTML is off (minimal entity set plus newline → `<br>`), an unchanged match is reported as "already present" instead of being rewritten, a `#notetype column` naming an unknown type skips the row rather than filing it elsewhere, and a plain-text export with HTML excluded reduces fields to text so the `#html:false` header it writes is true. Update preview/confirmation and backup protect matching notes, and deck directives share the note-write transaction

**Evidence:** `lib/importNotes.test.ts` (escaping, buckets, tag options, note-type resolution), `lib/importLog.test.ts`, `lib/importDelimited.test.ts`, `lib/exportNotes.test.ts`, delimited preview/import/export and rollback tests

**Next compatibility gate:** Keep metadata-header fixtures; the mapping table draws at most 24 columns

## Import screen and Import Log

**Status:** Implemented

**Evidence:** `/import` is file-first like Anki's: the extension chooses the importer and the option list that follows, and every import ends on an Import Log that files each note into Anki's own buckets (added, updated, already present, first field matched, note type changed, note type missing, deck missing, empty first field) with an expandable sample per bucket. Package imports add Anki's learning-progress, deck-preset and update-notes/update-note-types choices. `lib/importLog.test.ts`, `lib/importFile.test.ts`

The Import Log is displayed only after all package/text import steps, indexing and any collection
replacement reconciliation have reached durable storage. Storage errors remain recoverable errors
on the import screen; read-only tabs cannot start the operation. `lib/webDb.test.ts` verifies that
a text import exists in the acknowledged snapshot, and `lib/collectionWrite.test.ts` verifies the
async operation/commit boundary shared by both formats.

**Next compatibility gate:** "Merge note types" is not offered: schema conflicts create a reusable `originalId` copy. Existing conflicting GUID notes are skipped and reported as conflicts; new compatible notes can use that copy. Add an iPhone smoke test for the mapping table and the log.

## iOS Files “Open in” hand-off

**Status:** Implemented

**Evidence:** document UTI config and `importFile` tests; `.zip` is accepted as a package the way Anki's own file dialog does. The handed-over file URL opens `/import` over the screen the learner was on, or over the start screen when the file launched the app, so "Tamamlandı" returns there: `app/+native-intent.tsx` stops Expo Router from also reading the URL as a screen address, which used to leave "Sayfa bulunamadı" beneath the import (`lib/nativeIntent.test.ts`). The web build takes the same files by drag and drop onto the window or, installed, through the File Handling API, and hands each to the same `/import` workflow with its real filename (`components/WebAppIntegrations.tsx`)

**Next compatibility gate:** Verify once on a physical iPhone per release

## Local automatic/manual backup and restore

The deck list's ••• "Yedek oluştur" writes a snapshot straight away and says so, as Anki's File › Create Backup does; naming a snapshot stays on the Backups screen. Settings describes the automatic policy it applies (every 30 minutes; 12 daily, 10 weekly, 9 monthly copies) rather than the old weekly one (2026-10-25).

**Status:** Implemented with 30-minute default, layered retention and strict restore validation

**Evidence:** `lib/backupSafety.test.ts`, backup-validation, backup-source export and storage round-trip tests. Settings retain chosen intervals and copy counts; the formerly forced weekly policy migrates to 30 minutes with 12 daily, 10 weekly and 9 monthly buckets. The newest 24 snapshots from today/yesterday survive rotation (Anki keeps all of them; see below); named manual and pre-restore copies rotate separately. Bad raw rows are preserved in a marked recovery-only JSON snapshot, allowing maintenance/safety backups to proceed; such a file is shared as raw JSON through the canonical export screen and is rejected for direct restore. Only the operations that are a way out of the damage run on such a copy: Repair, and restoring a chosen backup (its pre-restore copy). Reset and collection replacement require a restorable pre-operation backup and otherwise stop, unchanged, with a request to run Repair first; a manual backup that could only be a recovery copy says so instead of reporting a restorable backup, and Backups checks a file before offering to restore it (`lib/destructiveBackupSafety.test.ts`). Read errors abort without creating an empty snapshot. The snapshot is read in one synchronous pass a page of 2,000 rows at a time, validated page by page with the same rules and failure reasons as the whole-file check, and written to the file chunk by chunk (`lib/backupSnapshot.ts`), so no collection-sized string is built for a backup; restoring still reads the chosen file whole (512 MiB ceiling). An automatic backup is skipped when nothing was written through the database since the last backup of this app session (SQLite `total_changes()`); a new session always takes its first due backup. Today and yesterday keep their newest 24 snapshots (twelve hours at the 30-minute default) rather than all of them, because each is a full uncompressed JSON copy and the backup folder is part of the iPhone's own device backup; the daily/weekly/monthly buckets are unchanged. The interval and copy counts are settings without a screen yet. Backups carry catalog tags and opaque card data separately from protected note fields; the overlay is applied as soon as the pack is installed (startup, purchase or restore, `lib/bkaCatalog.ts`), never onto a card answered after the backup was taken, and an entry leaves the pending set once applied (`lib/backupRestoreSafety.test.ts`). Backups also carry the queue's `filtered_membership_v1:` and `interday_review_usage:` rows; a restore replaces those of the live collection. Settings and today's session stats are written in the restore transaction, so a restore either leaves the old collection or reports one that fully happened; clearing pre-SQLite storage afterwards is no longer able to report a committed restore as failed. Check Media on the Backups screen lists unused and missing files (Anki's rules: files starting with `_` are kept) and moves unused ones, after confirmation and a collection backup, to a trash folder from which they can be put back (`lib/mediaCheck.ts`, `lib/mediaCheck.test.ts`); the web build only reports. Catalog revlog remains in the snapshot. Pending progress/overlays are preserved when backing up before content reinstall; partially installed content clears only applied overlay entries. Progress and overlay settings commit atomically with restored tables, including rollback on a settings write error. Protected-content restore rejection happens before taking a live snapshot or calling the importer. A rejected canonical restore never invokes a second import of the live snapshot; the pre-operation safety copy remains available. Only legacy formats retain the compensating restore path. Schema-9 filtered-order values are migrated before insertion into a current database. The Kronometre's sessions and preferences are optional parts of the same version-6 format (`tables.study_sessions`, `stopwatchPrefs`), written into the chunked snapshot and checked by the same validator: a build that predates them still reads the backup, a backup without them restores without touching the sessions on the device, and a single malformed session rejects the whole file before anything changes. Sessions and preferences are written in the restore transaction (`lib/backupData.stopwatch.test.ts`, `lib/backupValidation.test.ts`). The `study_sessions` table is created outside the numbered migrations, so opening a collection with this build does not lock older builds out of it (`lib/db.migrations.test.ts`). Its later `kind`, `breakCount` and `note` columns (the session's type, number of breaks and note) are added the same way, with defaults that read an older row as "N. Tekrar" with no breaks counted and no note; a backup row may carry them or not, a row made before them restores with those defaults, a malformed one rejects the file, and an older build restoring a newer backup keeps the sessions without them. None of it is part of an `.apkg`.

**Next compatibility gate:** Verify export options, Files share destination and plaintext warning per release

## Collection/database check

Readable cardless notes are rescued by creating card 1 in the recovery deck; their fields are never deleted. `orphanNotesRecovered` reports this work while the legacy `orphanNotesDeleted` remains zero. Orphan-card removal uses the common revlog-preserving deletion primitive. Settings summary rendering must consume the recovery counter (AI-3 integration note).

**Status:** Implemented subset

**Evidence:** Database: the audit and the repair share one definition of every defect (`lib/maintenance.ts`), so "Onar ve optimize et" cannot claim a fix the read-only "Veritabanını kontrol et" does not see. The button audits first, shows the counts it found, and repairs only after the learner accepts; `lib/maintenanceWorkflow.ts` puts a safety backup on disk before any row is rewritten. The repair runs as one transaction, deletes cards no note owns and recreates the first card of readable notes with no cards left, graves what it deletes, rescues cards whose deck is gone (home deck first, otherwise "Kurtarılan Kartlar"), clears filtered-deck bookkeeping left on a card whose deck is not filtered — `odid` and `odue` to zero with `due` deliberately untouched, as `rslib/src/dbcheck.rs` `check_filtered_cards` does — clears a stale `odue` from a learning or review card that was never in a filtered deck (`fix_odue.sql`, zeroing branch only), folds a new card's runaway queue position back into the reserved million (`fix_due_new.sql`), pulls a review card scheduled past day 100000 back to today and rounds any other due into 32 bits (`fix_due_other.sql`), clamps a template ordinal into `[0, 30000]` (`fix_ordinal.sql`), and rounds an interval into `[0, 2147483647]` the way `fix_ivl.sql` does. Two of those rules needed adapting rather than porting, and `lib/maintenance.ts` says so at each: day numbers here count from the Unix epoch rather than the collection's creation day, so a review due today is around 20,700 and upstream's day-100000 threshold keeps its meaning only because it still lands centuries out; and a learning step is stored here in milliseconds where upstream stores seconds, so upstream's 32-bit clamp is skipped for a card mid-step, which it would otherwise move to 1970. It never deletes or moves a paid-catalog row, but it does repair a catalog card's scheduling state: a schedule the card cannot be studied on is the learner's problem, not the catalog's content; then REINDEX, ANALYZE and the search rebuild run with VACUUM last, and any step that fails is named instead of collapsing into one blanket error (`lib/maintenance.test.ts` against real SQLite, `lib/maintenanceWorkflow.test.ts`, `lib/noteManager.searchIndex.test.ts`). Media: a user-facing media check is not offered — it was removed from Data Management as a report nobody acted on. The one scanner it used to call still answers what a field, template or stylesheet refers to, and the `.apkg` exporter and the import rewriter both ask it (`extractMediaFilenames`, `rewriteMediaReferences`, `lib/mediaAttach.test.ts`), so re-adding the report is a screen, not an engine. It reads `[sound:…]`, `src`/`href`/`poster` quoted or not, and `url(…)`, and decodes the entities an attribute is written with. They used to be three patterns that disagreed: the audit did not read a note type's CSS or templates and so called a card background unused, the exporter did not read `<a href>` and so shipped a package without the file it referenced, and the import rewriter knew about neither and left a renamed file referenced under its old name

**Next compatibility gate:** Beyond rescuing cardless notes, regenerating every missing template card and recovering missing note types remain pending. Anki recovers notes whose note type is missing into a replacement type; this app still reports that defect without reconstructing the type. Of its card-property fixes, everything `check_card_properties` runs is implemented except `fix_mod` (an integer cast on a field this schema keeps in `updated_at`) and the FSRS `last_review_time` rebuild, which needs a revlog scan per card. `fix_low_ease` is deliberately absent: it belongs to saving deck options, not to the database check. Its tag-list rebuild has no counterpart because tags are derived from the notes rather than kept in a registry. A note whose JSON no longer parses is reported and left alone — its text can only come back from a backup. Revlog rows belonging to a deleted card are kept on purpose, so lifetime statistics do not shrink. The audit → confirm → repair flow now has a named iPhone smoke test in `docs/IOS_RELEASE_CHECKLIST.md`

## iPhone reviewer preferences and external automation

**Status:** Implemented subset

**Evidence:** tapping a deck in the deck list switches straight to study mode as AnkiMobile does, with the deck overview kept in the deck's ••• menu, and the reviewer's back button pops back to that list instead of stacking a second one, while the overview's Study Now closes the overview and opens study over the same list; persisted classic/redesigned reviewer opt-in; AnkiMobile-aligned, separately configurable question/answer 3×3 tap zones with assignable Add note action; interactive card-element pass-through; adjustable swipe sensitivity and edge-only vertical swipes; independent Flag/Tools surfaces; `lib/reviewerTouchControls.test.ts`, `lib/reviewerAddNote.test.ts`, `lib/reviewerSurface.test.ts`, storage round-trip, strict HTTPS/Shortcuts callback parsing and media-audit tests. The web build answers the same x-callback requests at `/x-callback-url?action=addnote|search&…` (a browser cannot own `tusankim:`); the query is turned back into the `tusankim://` URL and read by the same parser and route resolver (`externalAppUrlFromQuery`, `lib/externalActionRoute.ts`, `lib/externalLinking.test.ts`). On iPhone a `tusankim://x-callback-url/<action>` request is opened only by `app/_layout.tsx`; the router ignores it, so no "Sayfa bulunamadı" page is left beneath the editor or browser, and an incomplete request is ignored (`lib/nativeIntent.test.ts`)

**Toolbar smoke (2026-10-16):** On the redesigned phone reviewer, an enabled deck title remains above the remaining counts and an enabled remaining-time estimate stays visible; disabling either preference still hides it. Compact toolbar actions can wrap. The [named layout checks](ui-layout-review/README.md) cover production-web widths, picker interaction, classic/redesigned reveal/grade/undo and simulator themes/text size. Physical-iPhone gestures and VoiceOver remain release gates.

**Next compatibility gate:** Add a native Share extension before broader parity claims

## Reviewer keyboard shortcuts

**Status:** Implemented subset

**Evidence:** Anki's study keys ([manual](https://docs.ankiweb.net/studying.html)) with the defaults Space/Enter to show the answer and answer Good, 1–4 to grade, `r` replay, `-` bury, `@` suspend, `*` mark, Escape to leave study, and on a desktop keyboard Ctrl/Cmd+Z undo and Ctrl/Cmd+1–7 flags; each binding can be re-recorded in Settings > Controls > Keyboard on iPhone and web at every screen width. iPhone records from a focused native TextInput with the software keyboard suppressed; Cancel or losing focus ends recording, and a late Enter submit cannot overwrite the accepted key or bind another row. Web also supports Escape to cancel. iOS only records the key events delivered by TextInput; the QA simulator did not deliver Escape, so use the visible Cancel button there. The existing Settings Save/discard flow and reset-to-defaults apply. Modifier-only and unfinished keys are ignored, and Space aliases are normalized to the same literal value the reviewer reads. `lib/keyboardSettingsSection.test.ts` covers native capture/cancellation, switching rows, reset, web repeat/composition filtering and listener cleanup; `lib/hardwareKeyboard.test.ts` covers normalized recording results. On web a key typed with AltGr, or on a Mac with Option alone, counts as the character it types, which is how a Turkish keyboard reaches `@` (`typesCharacter`, `isModifierOnlyKey`, `lib/hardwareKeyboard.test.ts`); the reviewer hears keys ahead of a button the mouse left focused, and keys pressed while the card itself has focus are passed on to it rather than lost inside the card frame. A held key acts once (`lib/reviewerInputGuards.test.ts`)

**Next compatibility gate:** Verify binding, Save/reopen, reset and reviewer use with a physical iPhone keyboard and Dynamic Type. Anki's other study keys (`e` edit, `=` bury note, `!` suspend note, `o` options) are not bound yet

## iPhone study notifications

**Status:** Implemented

**Evidence:** AnkiMobile daily review reminder, AnkiDroid-compatible 0/10/25/50/75/100/150/200/500 due-review thresholds, default-on provisional iOS authorization, no badge, notification policy/content tests. The web build shows the same reminder, with the same threshold rule and wording, through the browser Notification API — but only while the app is open in a tab, because a page cannot schedule system notifications without a push server; it asks for permission only from the Settings toggle and says so there (`lib/studyNotifications.web.ts`, `lib/studyNotifications.web.test.ts`)

**Next compatibility gate:** Verify provisional and fully authorized delivery on a physical iPhone; vibration and LED/flash remain system-owned iOS settings

## Statistics and card info

`lib/statsAuditSafety.test.ts` covers intraday/original due projection (a filtered card without an original due is read where it is, not as day 0), the inclusive upper horizon, backlog older than a year, integer daily load, Answer Buttons counting learning, relearning and filtered answers as learning and skipping manual rows and invalid ratings, Answer Buttons and Hourly Breakdown over 30/90/365 days before the next rollover as Anki's `buttons.rs`/`hours.rs` measure them (the per-day graphs keep 31/90/365 study days including today, which matches Anki's reviews graph, so the audit's one-day-edge note is not a difference), deck scopes matched by exact case, a filtered scope bound as one parameter, inactive review/relearning intervals and seven distinct Card Counts categories, New counting only active new cards. The Added graph dates a card by its id, the creation time Anki keeps through import, so a shared deck imported today is filed under the days its author added the cards (`lib/ankiStats.test.ts`). The study streak is labelled as collection-wide. Added count fields are optional at the API boundary so existing empty/loading snapshots remain valid; the screen renders absent initial values as zero. All-history Future Due has no ten-year cap; chart bucketing remains bounded while preserving totals. These calculations follow independently derived graph behavior; the current manual describes some older graph groupings, so the source registry also names the shared-core graph references.

**Status:** Implemented subset

**Evidence:** Anki-aligned 12-month default; Today, Future Due, Reviews/Review Time, Answer Buttons, Hourly Breakdown, Review Intervals, Card Counts and Added views, and per-deck progress split by card type. Reviews, Hourly Breakdown and Added read per-day and per-hour aggregates (`lib/ankiStats.ts`) and bucket them into calendar days, weeks and months (`lib/statsSeries.ts`); Hourly Breakdown leaves filtered-deck answers out, as Anki does. A bar of the Added graph opens the card browser on the cards added on its days with the `added:N -added:M` search Anki's graph links to, in the deck those cards share or else in the screen's scope; `lib/statsSeries.test.ts` checks that the search finds exactly the cards the bar counted. Pinned chart readouts, accessible summaries, stats presentation/axis/review logger tests

**Presentation:** Each section sits on its own rounded card. The deck selector and an inline period control (week, month, 3 months, year, all; a year by default) update the screen in place; the custom date range was dropped. Today and the study streak share the top card. Every graph uses one bar chart with a caption readout, tap and slide selection and a VoiceOver adjustable action; Future Due rules off the backlog with a "Today" marker, and Answer Buttons are drawn as four plain bars with Anki's per-type "correct" share beneath. Review Intervals is drawn on a continuous axis from one day up, empty spans included, and when the period caps it, the review cards with longer intervals are counted under the chart instead of dropped silently (`lib/ankiStats.test.ts`). The header’s Info sheet keeps the definitions. The named [Statistics redesign smoke](STATS_UI_VERIFICATION.md) records visual and interaction checks against independent SQL on a seeded collection.

**Next compatibility gate:** Add Calendar, True Retention and FSRS-specific views with reference fixtures before a full-parity claim; the other graphs do not yet open the browser searches Anki's do

## AnkiWeb synchronization

**Status:** Not implemented

**Evidence:** Local-only architecture

**Next compatibility gate:** Requires a documented protocol/backend, conflict model, encryption and recovery plan

## Profiles

**Status:** Not implemented

**Evidence:** Single local collection; no inert profile toggle is exposed

**Next compatibility gate:** Design isolation, migration, backup and recovery before UI

## Shared-deck marketplace

**Status:** Product-specific catalog only

**Evidence:** Purchased catalog notes use the normal editor save path: all text/HTML fields, formatting, attachments, cloze deletions and tags are editable; the content-protection banner is removed. Trial content remains read-only with its separate tag-only write path. Existing card IDs, scheduling and review history survive field edits, and cloze edits add missing ordinals while retaining empty siblings for Empty Cards (`lib/catalogEditing.test.ts`). The editor's clear-fields and formatting controls are available after unlock (`lib/catalogEditorMenu.test.ts`). Locally edited fields are marked on the note; a full-to-full bundled package refresh preserves those fields, tags and generated cards while refreshing untouched notes (`lib/bkaCatalog.install.test.ts`). GUID, note type, catalog ownership, deck placement, note/deck deletion, duplication and import/export restrictions remain product-specific and are enforced in the data layer; this field-editing change does not remove them. Tags and flags remain learner metadata on both tiers, including mixed personal/catalog selections (`lib/catalogProtection.test.ts`, `lib/noteManager.catalogTags.test.ts`).

Trial scheduling writes are permitted only on an existing card with unchanged identity/content metadata; new cards and ordinal/ownership changes stay blocked. A trial may materialize its installed cards for study and retain answer/revlog progress without granting field editing. Learner tags and flags stay independent of content access; a generic trial note save still fails unless it actually changes tags (`lib/ai2CatalogStudy.test.ts`).

**Named iPhone smoke — purchased catalog editing:** After unlocking the full catalog, open a note from the reviewer and browser. Verify the protection banner is absent; edit text, apply bold, attach an image/audio clip, add/remove one cloze deletion, save immediately, then force-quit/relaunch and review offline. Confirm the edited content and retained sibling's review state survive. On a trial install, verify fields remain read-only and tags still save. Run the Media/editor and Purchase/catalog rows of `IOS_RELEASE_CHECKLIST.md`; physical-device execution remains required before release.

**Bundled past exams (Çıkmış TUS Denemeleri):** A build that carries the past-exam pack offers its exams in the deck list (the local build: 54 exams, 11,604 questions, 2000–2026). The pack is not in git: ÖSYM holds the copyright on the questions and forbids redistribution without its written permission. `npm run build:past-exams` writes it under `assets/catalog/` with a loader that `metro.config.js` resolves `tus-past-exam-pack` to; without it the module is empty and the deck list offers nothing (`lib/pastExamAsset.ts`). The installer's tests use a small pack in the same format. Installing them is additive and repeatable: one deck per exam under `Çıkmış TUS Denemeleri`, newest first, sharing a preset with unlimited daily limits; one note per question in booklet order, identified by a stable guid so a second run only restores what was deleted and leaves studied cards untouched; images stored before one transaction that rolls back whole (`lib/pastExams.test.ts`). Unlike the paid catalog these rows carry no pack marker — they edit, export, back up and delete like the learner's own. The questions use the "TUS Sorusu" note type (`lib/tusQuestionCard.ts`): an ordinary Anki note type, so Anki shows the options and marks the key on the answer side. Answering by tapping an option, and striking options out with a double tap or long press, is this app's reviewer, not card JavaScript (Anki runs template scripts; this reviewer never does, `lib/cardContentSecurity.ts`): trusted reviewer code binds the options (`lib/tusQuestionBridge.ts`), the answer side marks the choice, and the grade matching the result is suggested while the choice of grade stays the learner's. The deck overview's Doğru/Yanlış/Boş counts read each question's latest answer from the review log.

**Next compatibility gate:** Do not present it as AnkiWeb shared decks. Ship a build with the pack only after ÖSYM grants written permission to redistribute its questions and figures; the explanations from the TUSBuddy reconstruction need their own permission.

## Image Occlusion note authoring

**Status:** Not implemented

**Evidence:** —

**Next compatibility gate:** Add a native/offline editor and package fixtures
