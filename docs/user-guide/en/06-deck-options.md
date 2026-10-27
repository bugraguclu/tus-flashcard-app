---
id: deck-options
title: Deck options
summary: Review limit, learning steps, forgotten cards, card order, burying, audio, timers and presets.
order: 6
web_path: /en/help/deck-options
app_help: help?article=deck-options
app_screens:
  - "Deck Options — app/deck-options.tsx"
  - "Setting guide sheets (the ? buttons on each card) — components/deck-options/SettingControls.tsx, components/deck-options/deckOptionsCopy.ts"
  - "Preset picker, name dialog and ••• menu — components/deck-options/PresetModals.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Deck options

Deck options decide how a deck is studied: how many review cards you get per day at most, the
delays at which you learn new cards, what happens to cards you forget and the order in which cards
appear. The FSRS settings live on this screen too; they have their own page: [FSRS](07-fsrs.md).

<a id="open-deck-options"></a>
## Opening deck options

- On the **Decks** tab, tap **•••** on the deck's row, then **Deck options**.
- On the deck's overview screen, tap **•••** at the top right or the **Deck Options** button.
- While studying, tap the gear icon in the top bar or **Deck options** in the **⋮** menu. This opens
  the deck of the card on screen; if you are studying a parent deck, that may be the subdeck the
  card is in.
- When the day's review limit is reached, the study screen shows **Increase Review Limit**, which
  opens this screen with the review limit field selected.

The deck's full name appears under the title. Use the **Deck** box at the top to switch to another
deck without leaving the screen. Filtered decks do not have this screen; they have **Filtered Deck
Options** instead. See [Filtered decks and Custom Study](11-filtered-decks.md).

The **?** button in each settings card's title opens a short **SETTING GUIDE**. Close it with
**Got it** or by pulling the sheet down. On wide screens (iPad, web) the cards are laid out in two
columns.

<a id="presets"></a>
## Presets
<!-- In the app: Deck Options › new ? button next to the Preset row (app/deck-options.tsx:1103-1120); the sheet's "Learn more" link → this section. Key concepts (02-key-concepts.md#presets) links here. -->

Settings are not stored on each deck one by one but in a named **preset**. The **Preset** row shows
the preset's name and how many decks use it (for example **12 decks**). A change you save applies
to every deck that uses that preset.

Some values belong to the deck, not the preset: the **This deck** and **Today only** review limits,
the deck's own desired retention, and the **Deck Description**. **Limits start from top** and the
FSRS switch apply to the whole collection.

To move the deck to another preset, tap the **Preset** row and pick a preset from the list. The
screen shows the new preset's values; the deck switches to it when you tap **Save**.

The commands in the **•••** menu:

| Command | What it does | When it takes effect |
| --- | --- | --- |
| **Add Preset** | Creates a new preset with the default values; you choose its name. This deck switches to it. | Immediately |
| **Create a Separate Preset for This Deck** | Copies the saved state of the selected preset as "‹deck name› options" and gives it to this deck only. | Immediately |
| **Rename preset** | Changes the preset's name. | Immediately |
| **Restore Defaults** | Returns the preset's study settings, FSRS values included, to the defaults. Affects every deck using the preset; the preset's name and the decks' own limits and descriptions are kept. | When you confirm |
| **Delete** | Deletes the preset; decks using it go back to the default preset. If you leave without saving, the preset stays. | When you tap **Save** |
| **Save and Apply to All Subdecks** | Saves, then moves all subdecks to this preset (see below). | Immediately |

If you have unsaved changes, **Add Preset** and **Create a Separate Preset for This Deck** ask
first; if you confirm, those changes are discarded. The default preset (named **TUS Kartları** in a
new collection) cannot be deleted. Decks you create use this preset, not their parent deck's.

**Save and Apply to All Subdecks** saves without asking. Then every subdeck, at any level, switches
to this preset and the review-limit tab you have selected is applied to them as well: on the **This
deck** or **Today only** tab this deck's values are copied, on the **Preset** tab the subdecks' own
limits are removed. Filtered decks are not affected. At the end you see how many subdecks were
moved to the preset.

**Example:** Pharmacology and Pathology share a preset. To change Pathology's learning steps and
leave Pharmacology as it is, open Pathology's options, tap **••• › Create a Separate Preset for This
Deck**, change the steps and tap **Save**.

<a id="daily-limits"></a>
## Daily limits
<!-- In the app: Deck Options › ? button of the Daily Limits card (app/deck-options.tsx:1146; button components/deck-options/SettingControls.tsx:38-51); the guide's "Learn more" link → this section. The study screen's "Increase Review Limit" button (app/(tabs)/index.tsx:3297-3306) opens this screen. -->

> **Different from Anki:** TusAnkiM has no daily limit for new cards; this is a deliberate product
> decision. You can open as many new cards as you want to study. The new-card limit of a deck that
> came from Anki is not applied; it is only kept for export. The daily limit for review cards works
> as in Anki.

**Maximum reviews/day** (default 200) sets the most review cards shown in one study day. Learning
cards whose next step falls on a later day also count toward this limit. When the limit is reached
the remaining cards are not deleted; they come the next day. The study screen says how many reviews
are waiting and shows the **Increase Review Limit** button.

The limit has three tabs:

- **Preset:** The shared value of every deck that uses the preset.
- **This deck:** A permanent value for this deck only. Leave it empty to use the preset's value.
- **Today only:** A value for today only. It is removed automatically at the next study day, at
  the **Start of next day** time. See [Key concepts](02-key-concepts.md#study-day).

The tab you are on when you save matters: saving on the **Preset** tab removes this deck's own and
today-only values; saving on the **This deck** tab removes the today-only value. The screen opens on
the tab that is in effect; when you open it from the study screen it opens on **This deck**.

**Example:** 320 reviews have piled up in Pathology today and you want to finish them all. Enter 320
on the **Today only** tab and tap **Save**; tomorrow the preset's value applies again. You can also
do this with **Custom Study › Increase today’s review card limit**.

<a id="limits-from-top"></a>
### Subdecks and "Limits start from top"

A card counts toward the limit of its own deck and of the parent decks you are studying. When you
study a parent deck, its limit caps all its subdecks together; each subdeck's own limit applies
too.

**Limits start from top** (off by default, applies to all presets):

- **Off:** when you open a subdeck directly, only the limits of that subdeck and its own subdecks
  apply.
- **On:** the parent decks' limits apply as well, and the counts in the deck list reflect this.

**Example:** Pharmacology has a limit of 100, Pharmacology::Antibiotics a limit of 80, and today you
did 50 reviews in Pharmacology's other subdecks. With the switch off, opening Antibiotics directly
can give you 80 reviews; with it on, at most 50.

<a id="new-cards"></a>
## New cards
<!-- In the app: Deck Options › ? button of the New Cards card (app/deck-options.tsx:1168); "Learn more" → this section -->

- **Learning steps** (default `1m 10m`): the delays at which a new card is shown before it
  graduates. Separate the steps with spaces; the units are `s` (seconds), `m` (minutes), `h`
  (hours), `d` (days), and a bare number means minutes: `1m 10m`, `10m 1h`, `30s 5m 1d`. Leave the
  field empty for no learning steps.
- While studying, the **Again** button sends the card back to the first step and **Good** moves it
  to the next. **Good** on the last step graduates the card; **Easy** skips the remaining steps.
- **Graduating interval (days)** (default 1): the card's first review interval when you press
  **Good** on the last step.
- **Easy interval (days)** (default 4): the interval given when you press **Easy** on a learning
  card. Keep it longer than the graduating interval.
- **Insertion order:** **Sequential** (default) or **Random**.

When you change the steps, cards in learning do not start over; they continue from the step that
matches what they have already passed. With FSRS on, the two interval fields are hidden and FSRS
chooses the first interval.

> **Different from Anki:** In Anki, **Insertion order** changes the position numbers of new cards.
> TusAnkiM does not touch position numbers. With **Random** selected and **New card gather order**
> set to **Deck**, new cards come in a shuffled order each day; the order stays the same within the
> day.

<a id="lapses"></a>
## Lapses
<!-- In the app: Deck Options › ? button of the Lapses card (app/deck-options.tsx:1199); "Learn more" → this section. Key concepts (02-key-concepts.md#leeches-and-siblings) links here. -->

Pressing the **Again** button on a card you had already learned counts as a **lapse**.

- **Relearning steps** (default `10m`): the forgotten card is shown again at short delays. Leave
  the field empty and the card skips relearning and gets its new interval right away.
- **Minimum interval (days)** (default 1): the shortest interval a card can get once relearning
  ends. How much of the old interval the new one keeps is set in the **Advanced** card. Hidden while
  FSRS is on.
- **Leech threshold (lapses)** (default 8): when a card reaches this many lapses it is marked as a
  **Leech**, then again every half of this number (for 8: at the 12th, 16th … lapse). The tag
  `leech` is added to its note.
- **Leech action:** **Tag Only** (default) or **Tag and Suspend**. A suspended card does not come up
  in study until you unsuspend it.

Find these cards in the **Card Browser** by searching `tag:leech`. Shortening such a card, splitting
it in two or rewriting it often helps more than seeing it more often. See
[Card Browser and search](10-browser-and-search.md).

<a id="fsrs"></a>
## FSRS
<!-- In the app: Deck Options › FSRS card (app/deck-options.tsx:1236). The card's ? guide "Learn more" goes to the FSRS article: help?article=fsrs&section=what-is-fsrs -->

The **Use the FSRS scheduler** switch in the **FSRS** card lets FSRS calculate the intervals instead
of the classic scheduler. The switch applies to the whole collection; the values under it belong to
this preset. With FSRS on, **Graduating interval**, **Easy interval**, **Minimum interval** and the
multipliers in the **Advanced** card are hidden; their saved values are kept. Details:
[FSRS](07-fsrs.md).

<a id="display-order"></a>
## Display order
<!-- In the app: Deck Options › ? button of the Display Order card (app/deck-options.tsx:1356); "Learn more" → this section -->

The app first **gathers** which new cards come today, then **sorts** the cards. These options do
not change when cards are due; they only decide the order in which they come today.

- **New card gather order:** **Deck** (default; in the deck list's order, subdeck by subdeck),
  **Deck, then random notes**, **Ascending position** (first added first), **Descending position**
  (last added first), **Random notes**, **Random cards**. The random options keep the same shuffle
  for the whole day.
- **New card sort order:** the order of the gathered cards. The default, **Card type, then order
  gathered**, puts for example front → back cards before reverse cards.
- **New/review order:** **Mix with reviews** (default), **Show before reviews** or **Show after
  reviews**.
- **Interday learning/review order:** the same three options, for learning cards whose next step
  falls on a later day.
- **Review sort order:** which due review comes first. The default is **Due date, then random**.
  With FSRS on, difficulty orders replace the ease orders and **Ascending retrievability** /
  **Descending retrievability** appear. If you turn FSRS off, a retrievability order becomes
  **Relative overdueness**.

When you study a parent deck, the cards of all its subdecks come in the order set in the parent
deck's preset.

> **Different from Anki:** Because new cards have no daily limit, two options work differently.
> **Mix with reviews** alternates one review and one new card. With **Show before reviews**, each
> study day's first 200 new cards come before the reviews; then the reviews come, followed by the
> remaining new cards. This way your reviews get their turn every day.

<a id="burying"></a>
## Burying
<!-- In the app: Deck Options › ? button of the Burying card (app/deck-options.tsx:1425); "Learn more" → this section -->

Cards made from the same note are **siblings** (see [Key concepts](02-key-concepts.md#notes-and-cards)).
With burying on, when one sibling is shown, the other siblings of the selected kinds are hidden until
the next study day, so one cannot give away the other's answer.

- **Bury new siblings**, **Bury review siblings** and **Bury interday learning siblings** are
  independent of each other; all three are off by default.
- A card in learning is not buried because of a new or review sibling.
- A buried card is not deleted or suspended; it comes back by itself the next day. To bring it back
  now, use **💤 Unbury N cards now** on the deck's overview screen. See [Decks](04-decks.md).

<a id="audio"></a>
## Audio
<!-- In the app: Deck Options › ? button of the Audio card (app/deck-options.tsx:1435); "Learn more" → this section -->

- **Automatically play audio** (default on): audio on a card side starts when that side opens.
  **Settings › Reviewing › Advanced › Automatically play audio** must be on as well.
- **Audio playback speed** (default **1.0x**): the speed of the audio on this preset's cards,
  from **0.75x** to **2.0x**.
- **Skip question when replaying answer** (default off): when you replay audio on the answer side,
  the question side's audio is not played. It does not affect autoplay.

Audio, timer and Auto Advance settings are read from the preset of the deck the card is in.

<a id="timers"></a>
## Timers
<!-- In the app: Deck Options › ? button of the Timers card (app/deck-options.tsx:1459); "Learn more" → this section -->

- **Maximum answer time** (default 60 sec): at most this much time is recorded in the statistics for
  one answer; the on-screen timer stops here too. With values above ten minutes, a break you take
  can be counted as study time.
- **Show on-screen timer** (default off): shows the time spent on the card while you study.
- **Stop on-screen timer on answer** (default off): freezes only the visible timer; the time
  recorded for statistics runs until you press an answer button.

<a id="auto-advance"></a>
## Auto Advance
<!-- In the app: Deck Options › ? button of the Auto Advance card (app/deck-options.tsx:1470); "Learn more" → this section -->

Auto Advance reveals the answer when the time you set runs out and then performs the action you
chose. It runs only while **Settings › New study screen › Answer buttons › Auto advance** is on; the
times come from this card. If both times are 0, nothing happens.

- **Question display time** and **Answer display time** (seconds, default 0): `0` turns that stage
  off; you can enter decimals such as `2.5`.
- **Question action:** **Show answer** (default) or **Show reminder only**.
- **Answer action:** **Bury card** (default), **Answer Again**, **Answer Hard**, **Answer Good** or
  **Show reminder only**.
- **Wait for audio** (default on): nothing happens until the audio on that side has finished.

The timer pauses while a menu or the drawing area is open or the app is in the background. Automatic
answers are saved in the review history like any other answer.

**Example:** Show the question for 8 and the answer for 5 seconds and choose **Show reminder only**
for both actions: the app never answers for you, it only reminds you that the time is up.

<a id="easy-days"></a>
## Easy Days
<!-- In the app: Deck Options › ? button of the Easy Days card (app/deck-options.tsx:1523); "Learn more" → this section -->

There is a button for each day of the week (**Mon** … **Sun**). Each tap cycles **Normal** →
**Reduced** → **None**. On Reduced and None days, the due dates of newly calculated intervals are
shifted slightly to nearby days. It works with the classic scheduler and with FSRS.

- Existing due dates stay where they are; the change applies to intervals calculated from now on.
  With FSRS on you can also move existing due dates with **Reschedule cards on change**.
- Keep at least one day **Normal**.
- Lowering every day to the same level does not reduce the total workload; it only changes how it
  is spread.

**Example:** If you sit mock exams on Saturdays, set **Sat** to **Reduced**; part of the reviews
that would fall on that day move to the neighbouring days.

<a id="advanced"></a>
## Advanced
<!-- In the app: Deck Options › ? button of the Advanced card (app/deck-options.tsx:1549); "Learn more" → this section -->

- **Maximum interval (days)** (default 36500): no review interval is longer than this. Values under
  180 days bring back even cards you know well quite often.

The following are shown only while FSRS is off; with FSRS on, a short explanation takes their place:

| Setting | Default | Range | What it does |
| --- | --- | --- | --- |
| **Starting ease** | 2.50 | 1.31–5.00 | The first ease multiplier of a card that graduates. |
| **Easy bonus** | 1.30 | 1.00–5.00 | The extra multiplier an **Easy** answer adds to the interval. |
| **Hard interval multiplier** | 1.20 | 0.50–1.30 | The multiplier for the interval after **Hard**. |
| **Interval modifier** | 1.00 | 0.50–2.00 | A general multiplier applied to all review intervals. |
| **New interval (%) after lapse** | 0 | 0–100 | How much of a forgotten card's old interval it keeps; at 0 the card restarts from the minimum interval. |

If a deck you brought from Anki has a value outside these ranges, it stays as it is until you change
it. If you are not sure what a value does, keep the defaults.

<a id="deck-description"></a>
## Deck description

This field belongs to the deck. The note you write appears on the deck's overview screen under
**DECK DESCRIPTION**, and on the study screen as two lines when no card is shown. It is saved with
**Save**. You can also change it from **••• › Edit description** on the **Decks** tab.

<a id="saving"></a>
## Saving

- Changes take effect when you tap **Save**. The button is at the top, next to the **Deck** box; the
  first row of the **•••** menu does the same. When there is nothing to save, the button reads
  **Saved**.
- The status line under the **Preset** row tells you what is going on: **There are unsaved
  changes.**, **N fields need attention.** or the result of the save.
- An invalid value (for example outside the allowed range) is shown in red under its field and
  cannot be saved until you fix it. Advice boxes do not block saving (see below).
- If you try to leave without saving, or to switch to another deck or preset, the app asks first.
  **OK** discards the changes, **Cancel** keeps you on the screen.
- Saved settings take effect at once in the deck list and on the study screen. With FSRS on, some
  saves take a moment because the cards' memory states are recalculated.

Some preset commands take effect without waiting for **Save**; see [Presets](#presets).

<a id="warnings"></a>
## Advice boxes

A coloured box appears under some fields. These are suggestions; they never block saving:

| Advice | When it appears |
| --- | --- |
| Your final learning step is longer than the graduating interval | With the classic scheduler, when the last step is longer than the graduating interval. |
| The Easy interval is shorter than the graduating interval | When **Easy** would bring the card back sooner than **Good**. |
| Steps of a day or more are not recommended with FSRS | With FSRS on, when the last learning or relearning step is 1 day or longer. |
| Your final relearning step is longer than the minimum interval | With the classic scheduler, when **Minimum interval** changes nothing for those cards. |
| Random insertion | When **Insertion order** is **Random** (information). |
| A low / high target | When desired retention is below 0.80 or above 0.95. |
| These parameters were last optimized over a month ago | When the last optimization was more than 30 days ago (information). |
| Times above ten minutes | When **Maximum answer time** is longer than 600 seconds. |
| Keep at least one day Normal | When no Easy Day is left **Normal**. |
| This change only affects intervals calculated from now on | When you change Easy Days (information). |
| A short maximum interval | When **Maximum interval** is under 180 days; red under 50. |

## Related topics

- [Key concepts](02-key-concepts.md)
- [Decks](04-decks.md)
- [Studying](05-studying.md)
- [FSRS](07-fsrs.md)
- [Card Browser and search](10-browser-and-search.md)
- [Filtered decks and Custom Study](11-filtered-decks.md)
- [Settings](16-settings.md)
