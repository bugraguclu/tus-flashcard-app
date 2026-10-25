---
id: fsrs
title: FSRS
summary: Turning on the FSRS scheduler, desired retention, optimizing the parameters and rescheduling cards.
order: 7
web_path: /en/help/fsrs
app_help: help?article=fsrs
app_screens:
  - "Deck Options › FSRS card — app/deck-options.tsx (FSRS card, lines 1236-1354)"
  - "FSRS setting guide (the FSRS card's ? button) — components/deck-options/deckOptionsCopy.ts"
  - "Card Info (memory values) — app/card-info.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# FSRS

FSRS is the second scheduler that calculates when your cards come back. It estimates from your
review history how well you remember each card and sets the interval according to the retention you
choose. Its settings are in the **FSRS** card on the **Deck Options** screen.
See [Deck options](06-deck-options.md#fsrs).

<a id="what-is-fsrs"></a>
## What is FSRS?
<!-- In the app: Deck Options › ? button of the FSRS card (app/deck-options.tsx:1236; button components/deck-options/SettingControls.tsx:38-51); the guide's "Learn more" link → this section -->

With the classic scheduler every card has an ease multiplier, and the interval grows by that
multiplier after each successful review. FSRS keeps two numbers for each card instead:

- **Stability:** the number of days until your chance of recalling the card falls to 90%. It grows
  as you recall the card successfully.
- **Difficulty:** how hard the card is for you (1–10). It rises on cards you often forget.

From these two numbers FSRS calculates your current chance of recalling the card
(**Retrievability**). It schedules the next review for the day this chance falls to your **Desired
retention**. You can see a card's values on the **Card Info** screen; see
[Card Browser and search](10-browser-and-search.md#card-info).

Learning and relearning steps work the same with FSRS on; FSRS only chooses the day-scale
intervals.

<a id="turn-on-fsrs"></a>
## Turning FSRS on and off

1. Open the **Deck Options** screen of any deck.
2. In the **FSRS** card, turn on **Use the FSRS scheduler**.
3. Tap **Save**.

The switch applies to **the whole collection**: turning it on in one deck turns it on for every
deck. Desired retention and the parameters belong to the preset; each preset uses its own values.

When you save, each card's memory state is calculated from its review history. The cards' due dates
do not change; the new values are used from your next answer on. To recalculate the existing due
dates as well, see [Rescheduling cards](#reschedule).

With FSRS on, **Graduating interval**, **Easy interval**, **Minimum interval** and the ease
multipliers in the **Advanced** card are hidden; their saved values are not deleted. Keep your
learning steps shorter than a day: the app shows advice for steps of a day or longer, because
choosing the day-scale interval is FSRS's job.

To **turn it off**, turn the same switch off and tap **Save**. Cards go back to the classic
scheduler, their due dates stay where they are, and the cards' FSRS memory information is removed.
If you turn it on again, the information is calculated again from the review history. If **Review
sort order** is a retrievability order, it becomes **Relative overdueness** when FSRS is turned off.

> **Note:** Turning the switch on or off affects the cards of the whole collection. You may want to
> make a backup before a big change. See [Backups and maintenance](15-backups-and-maintenance.md).

<a id="desired-retention"></a>
## Desired retention

**Desired retention** (default **0.90**) is your target chance of still remembering a card when it
comes back. You can enter a value from 0.70 to 0.99.

- A **higher value** brings cards back more often: you forget less, but your daily reviews rise
  quickly. The app shows advice above 0.95.
- A **lower value** means fewer reviews, and noticeably more forgetting. Advice appears below 0.80.

There are two tabs above the field: **Preset** is the preset's shared value; **This deck** gives
this deck a value of its own. If **This deck** is empty, the preset's value applies. This field has
no **Today only** tab.

When you change the value and save, the target stored on the affected decks' cards is updated. New
intervals are calculated with this target from the next answer on.

**Example:** If you are thinking of raising a deck's target from 0.90 to 0.95 shortly before the
exam, expect your daily reviews to rise noticeably. You can try it on a single deck first with the
**This deck** tab.

<a id="optimize"></a>
## Optimizing the parameters
<!-- In the app: Deck Options › FSRS › "Optimize parameters" button (app/deck-options.tsx:1304-1321) and the "FSRS parameters" field (app/deck-options.tsx:1323-1332) -->

FSRS describes how memory works with a list of 21 **parameters**. At first it uses default values
tuned on many learners. **Optimize parameters** recalculates these numbers from your own review
history.

1. In the **FSRS** card, tap **Optimize parameters**. While it runs, the button shows the progress
   (**Optimizing… 40% (stop)**). Tap the button again to stop.
2. The result appears in a dialog:
   - **Parameters updated:** the new parameters predict your history better than the old ones. The
     dialog shows the old and new prediction error (log loss); smaller is better.
   - **Parameters already optimal:** the current parameters are better; nothing was changed.
   - **No reviews to train on:** the cards in this preset have no reviews that can be used yet.
3. Tap **Save** to apply the result. If you leave without saving, the new parameters are not used.

Optimizing uses the history of the unsuspended cards in every deck that uses this preset. With very
little history the result stays close to the default parameters; run it again as your reviews add
up. The date of the last optimization is shown under the **FSRS parameters** field, and a month
later the app suggests optimizing again.

You can paste 17, 19 or 21 numbers from elsewhere into the **FSRS parameters** field, separated by
commas or spaces. Empty the field to return to the defaults. Numbers outside the allowed bounds are
brought to the bound when you save.

<a id="reschedule"></a>
## Rescheduling cards

The **Reschedule cards on change** switch makes your next **Save** recalculate the existing due
dates too. It starts off every time the screen opens and applies only to that save.

- **While off**, new settings affect only your future answers.
- **While on**, saving recalculates the due dates of review cards in the decks whose parameters or
  desired retention (and, when it is on, Easy Days) change in this save. The new due date counts
  from the card's last review and is spread evenly across days; Easy Days are respected.
- Suspended cards, new cards and cards in learning are not rescheduled.
- Turning on only the switch and saving without other changes does nothing.

For each rescheduled card, a row of type **Manual** is added to its review history on the **Card
Info** screen. This cannot be undone automatically; it is a good idea to make a backup before a
change that affects many cards.

<a id="memory-state"></a>
## How the memory state is calculated

- When you turn FSRS on, or change the parameters or the target and save, the cards' memory states
  are recalculated from the review history. While you study they are updated after each answer.
- A new card's memory state starts with your first answer.
- For older cards with incomplete history (for example cards imported without their history), the
  state is estimated from their interval and ease factor. **Historical retention** (default 0.90;
  0.50–1.00) is the assumption of how much you remembered in the past for this estimate.
- **Ignore reviews before** (YYYY-MM-DD, empty by default): reviews before this date are not taken
  into account. This helps, for example, when you started studying the cards from scratch after a
  long break. A date after today is changed to today; leave the field empty to use the whole
  history.
- Changing these two fields on their own does not recalculate the cards right away; optimizing
  uses them at once, and the cards are affected at the next recalculation.
- When you move a card to another deck with FSRS on, its memory state is recalculated with the
  target deck's settings.

<a id="when-to-use"></a>
## When to use FSRS

Both schedulers study your cards with spaced repetition; which one you choose is up to you.

- FSRS is handy if you want to manage your workload with a single number (**Desired retention**).
- As your review history grows, optimizing tunes the parameters to you. If you are just starting,
  you can begin with the default parameters and optimize after a few weeks.
- If you are happy with the classic scheduler, you do not have to switch. You can try FSRS and turn
  it off again; your due dates stay where they are.
- The switch affects the whole collection; you cannot study one deck with FSRS and another with the
  classic scheduler. Use the **This deck** tab to give decks different targets.

<a id="differences"></a>
## What differs from Anki

> **Different from Anki:**
> - There is no simulator that helps you choose a desired retention, and Statistics has no
>   FSRS-specific retention charts.
> - You optimize presets one at a time; there is no command that optimizes them all at once.
> - FSRS does not change the daily limit for new cards: TusAnkiM has no daily limit for new cards.
>   See [Deck options](06-deck-options.md#daily-limits).
> - The calculations are tested against a specific Anki version; very small numerical differences
>   are still possible.

In decks you bring from Anki, the parameters, the desired and historical retention and the
**Ignore reviews before** date are kept; 17- or 19-number parameter lists from older FSRS versions
are converted to 21 numbers. See [Using TusAnkiM with Anki](19-using-with-anki.md).

## Related topics

- [Deck options](06-deck-options.md)
- [Key concepts](02-key-concepts.md#scheduler)
- [Card Browser and search](10-browser-and-search.md)
- [Backups and maintenance](15-backups-and-maintenance.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
