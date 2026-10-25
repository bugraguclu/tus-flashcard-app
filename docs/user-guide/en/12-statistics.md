---
id: statistics
title: Statistics
summary: Choosing a deck and period, the Today card, the study streak, and what every chart on the Statistics screen shows.
order: 12
web_path: /en/help/statistics
app_help: help?article=statistics
app_screens:
  - "Statistics — app/stats.tsx"
  - "About statistics (Info sheet) — components/stats/StatsHelpSheet.tsx"
  - "Time range picker — components/stats/StatsRangePicker.tsx"
  - "Study streak week strip — components/WeekStreakStrip.tsx"
  - "Reviews, Hourly Breakdown, Added and Decks sections — components/stats/"
verified_against: master c6108e6 (2026-10-25)
---

# Statistics

The **Statistics** screen shows how much you have studied, how many reviews lie ahead and where
your cards stand right now. To open it, tap **Stats** in the bottom bar of the **Decks** screen, or
**Deck Statistics** on a deck's overview. **Info** at the top right opens short explanations of the
charts.

> **In the web version:** In a wide browser window, the sidebar next to the study screen also has a
> **Stats** button; it opens the screen on the deck you are studying.

> **Different from Anki:** Statistics includes a subset of Anki's graphs. There is no calendar
> heatmap, no True Retention table, no card ease graph and none of the FSRS graphs (stability,
> difficulty, retrievability). Only the **Added** chart takes you to the Card Browser. The
> **Today** card, the **Study streak** and the **Decks** rows are TusAnkiM's own. To see which days
> you studied, use the [Study Calendar](13-stopwatch-and-calendar.md#study-calendar) instead of a
> heatmap.

<a id="scope-and-period"></a>
## Choosing a deck and period
<!-- In the app: Statistics › Info › "Deck and period" section (components/stats/StatsHelpSheet.tsx:12-15); the sheet's new "Learn more" link → this article -->

Two selectors sit at the top of the screen:

- **Deck selector** (**Whole Collection** or the deck's name): When you pick a deck, the whole
  screen shows that deck and its subdecks. For a filtered deck, the cards currently in it are
  counted. Changing the deck keeps the period you chose.
- **Time range** (default **Last Year**): **Last Week**, **Last Month**, **Last 3 Months**,
  **Last Year** or **All Time**. For your own range, pick **Start** and **End** under
  **Custom Date Range** and tap **Use This Range**.

Opened from a deck's overview, the screen starts on that deck; opened from the bottom bar of the
Decks screen, it starts on the whole collection.

The period does not affect every section in the same way:

| Section | Follows the deck? | Follows the period? |
| --- | --- | --- |
| Today | Yes | No, always today |
| Study streak | No, always the whole collection | No |
| Future Due | Yes | Looks ahead as far as the period |
| Reviews, Answer Buttons, Hourly Breakdown, Added | Yes | Yes |
| Review Intervals | Yes | Only the chart's upper limit |
| Card Counts, Decks | Yes | No |

Days change at the **Start of next day** hour, not at midnight (default 04:00;
**Settings › Reviewing › Scheduling**). See [Study day](02-key-concepts.md#study-day).

<a id="today"></a>
## Today
<!-- In the app: Statistics › Info › new "Today" section → this section -->

The **Today** card sums up the answers you gave this study day. It follows the deck selector and
ignores the period.

- **Reviews:** Every answer you gave today: new, learning and review cards, plus answers in
  filtered decks. An answer you undo is taken off the count.
- **Accuracy:** The share of today's answers where you pressed something other than **Again**.
  Shows "—" until you answer.
- **Study time:** The time you spent on answers today. However long you stay on a card, an answer
  counts for at most the **Maximum answer time** (default 60 seconds; **Deck Options › Timers**).
- **New Cards:** The number of cards you answered for the first time today.

Time measured with the **Stopwatch** is not added to this **Study time**. The total of card study
and stopwatch sessions is the ring on the Stopwatch screen; see
[Daily goal and total time](13-stopwatch-and-calendar.md#daily-goal).

<a id="streak"></a>
## Study streak
<!-- In the app: Statistics › Info › new "Study streak" section → this section -->

The **Study streak** shows how many days in a row you have studied. The card says
**Whole collection**: the streak is counted for your whole collection, whatever deck is selected.

- A day counts when you **answered at least one card** or **saved a stopwatch session** that day.
  A stopwatch session belongs to the day it started.
- If you have not studied yet today, the streak counts back from yesterday, so it does not look
  broken until the day is over.
- **Longest:** Your longest streak so far.
- The week strip shows Monday to Sunday. Days you studied are filled orange; today has an orange
  outline until you study. Use the arrows or swipe the strip to see earlier weeks.
- Tapping the card's title or the day count opens the **Stopwatch**.

A session you add by hand on the Stopwatch also counts for its day, even a past one. A stopwatch
that is still running only counts once you finish and save it. Your streak also appears as a small
flame in the study screen's header; it is dimmed until you study that day.

> **In the web version:** Hover over a day in the week strip to see whether you studied that day.

<a id="future-due"></a>
## Future Due
<!-- In the app: Statistics › Info › "Future Due" section (StatsHelpSheet.tsx:16-19) → this section -->

Shows how many cards fall due on the days ahead. It assumes you learn no new cards and forget none,
so real numbers end up a little higher.

- **From today** shows cards due today and later. **With backlog** (the default) adds overdue
  cards, to the left of the dashed **Today** line.
- Bars are split into **Young** and **Mature** cards. A card's interval is the number of days
  between its last review and the next one; under 21 days it is young, 21 days or more mature.
- The grey **Cumulative** line adds up every card due up to that bar.
- The chart looks as far ahead as the period: the coming week for **Last Week**, about a year for
  **Last Year**, and up to the furthest due card for **All Time**. Over long periods each bar
  covers one or more weeks.
- New and suspended cards are not counted, nor are buried cards due today or earlier.

| Figure | Meaning |
| --- | --- |
| **Total** | The cards in the chart. |
| **Daily load** | An estimate of how many reviews come up per day on average. Cards with short intervals raise it. |
| **Tomorrow** | Cards due tomorrow. |
| **Backlog** | Overdue cards; shown only with **With backlog**. |

<a id="reviews"></a>
## Reviews
<!-- In the app: Statistics › Info › "Reviews and answers" section (StatsHelpSheet.tsx:20-23) → this section -->

Shows the answers you gave in the period. The **Answers** / **Time** switch at the top changes
between the number of answers and the time spent on them.

- Bars are days for **Last Week** and **Last Month**, weeks for **Last 3 Months** and months for
  **Last Year**.
- Colours show the kind of answer: **Mature** and **Young** (review cards, split at a 21-day
  interval), **Relearning**, **Learning** and **Filtered** (answers in a filtered deck or Custom
  Study). See [Filtered decks and Custom Study](11-filtered-decks.md).
- Select a bar to see its value and the **Running total** above the chart.

The figures under the chart:

- **Days studied:** Days with at least one answer / days in the period.
- **Daily average:** The average over every day of the period.
- **On days studied:** The average over the days you studied only. Hidden if you studied every
  day of the period.
- **Per answer:** The average seconds per answer, with the cards you answer per minute below it.

Example: if you studied on 20 days of **Last Month** (31 days) and gave 1,240 answers,
**Days studied** shows `20 / 31` (65%), **Daily average** 40 and **On days studied** 62.

<a id="answer-buttons"></a>
## Answer Buttons
<!-- In the app: Statistics › Info › new "Answer Buttons" section → this section -->

Shows how often you pressed **Again**, **Hard**, **Good** and **Easy** in the period. Each bar is
split into **Learning** (learning, relearning and filtered-deck answers), **Young** and **Mature**.

- The total for each button is printed under the bars.
- The three figures at the bottom (**Correct on learning cards**, **Correct on young cards**,
  **Correct on mature cards**) give the share of answers of that kind that were not **Again**. The
  mature figure is a rough sign of how well you keep long-interval cards.
- With **Last Month** selected, this chart counts the last 30 days (as Anki does).

<a id="hourly"></a>
## Hourly Breakdown
<!-- In the app: Statistics › Info › "Hourly Breakdown" section (StatsHelpSheet.tsx:24-27) → this section -->

Spreads your answers over the hours of the day (00–23, your device's clock). Answers in filtered
decks are left out (as Anki does). With **Last Month** selected, the last 30 days are counted.

- The **Share answered correctly** line underneath is the share of answers that were not
  **Again** in each hour. So that differences show, its scale starts just below the lowest hour
  rather than at 0%; the two labels on the left are its bottom and top.
- Tap an hour to mark it on both the bars and the line.
- **Busiest hour** is the hour with the most answers. **Strongest hour** is the one with the best
  share correct; an hour only competes with at least 10 answers and at least 3% of all your
  answers. When no hour qualifies, it says **Not enough data**.

<a id="intervals"></a>
## Review Intervals
<!-- In the app: Statistics › Info › "Review Intervals" section (StatsHelpSheet.tsx:28-31, to be updated) → this section -->

Shows the current intervals of your review and relearning cards. The bars are labelled with day
counts.

- The period only sets the chart's upper limit: with **Last Year**, cards with intervals over
  365 days are not drawn; **All Time** shows them all.
- The grey line (**At or below**) gives the share of cards whose interval is that long or shorter.
- **Average interval** and **Longest interval** count all your review cards, whatever the period.

To see one card's interval and review history, use the **Card Info** screen; see
[Card Browser and search](10-browser-and-search.md#card-info).

<a id="card-counts"></a>
## Card Counts
<!-- In the app: Statistics › Info › new "Card Counts" section → this section -->

Shows where your cards stand **now**; the period does not change it.

| Row | Which cards? |
| --- | --- |
| **Mature** | Review cards with an interval of 21 days or more |
| **Young** | Review cards with an interval under 21 days |
| **Learning** | Cards in their first learning steps |
| **Relearning** | Forgotten cards being learned again |
| **Unseen** | New cards you have never studied |
| **Suspended** | Cards you suspended, at whatever stage |
| **Buried** | Buried cards, at whatever stage |

Suspended and buried cards are only counted in their own rows. At the bottom are **Total cards**,
**Total notes** and **Cards per note**. For card states, see
[Card states](02-key-concepts.md#card-states).

<a id="added"></a>
## Added
<!-- In the app: Statistics › Info › new "Added" section → this section -->

Shows how many cards were created in the period. The figures under it are the **Total** and the
**Daily average** over the days of the period.

- A card's date is the day it was created. Imported cards keep their original creation date: a
  shared deck you import today spreads over the days its author added the cards.
- Tap a filled bar to open the **Card Browser** on the cards added on those days; the search box
  shows a search starting with `added:`. If the cards share a deck, the browser opens on that deck,
  otherwise on the deck selected in Statistics. Going back keeps your deck and period.
- To read a bar without opening it, slide your finger sideways across the chart.

For search syntax, see [Card Browser and search](10-browser-and-search.md).

<a id="deck-progress"></a>
## Decks
<!-- In the app: Statistics › under the "Decks" / "Subdecks" heading at the bottom, new short hint (components/stats/DeckProgressSection.tsx:26) → this section -->

At the bottom of the screen you see your top-level decks (**Decks**) with the whole collection
selected, or the chosen deck's subdecks (**Subdecks**). Filtered decks are not listed.

- The percentage next to a deck is the share of its cards studied at least once. It tells you how
  much of the deck you have opened up, not how mature it is.
- The bar is split into **Mature**, **Young**, **Learning** and new cards, with the counts below.
- Tap a deck to show the whole screen for that deck and jump back to the top.

<a id="chart-tips"></a>
## Using the charts
<!-- In the app: Statistics › Info › "Using charts" section (StatsHelpSheet.tsx:32-35) → this section -->

- **Future Due**, **Answer Buttons** and **Review Intervals:** Tap a bar to open a small box with
  the exact numbers. Tap the same bar again to close it.
- **Reviews**, **Hourly Breakdown** and **Added:** Tap a bar and the line above the chart shows its
  value. Slide your finger sideways to move between bars; the page holds still meanwhile and the
  iPhone gives a light tap on each bar. Dragging up or down scrolls the page.
- **VoiceOver:** On these three charts, swipe up or down to step through the bars; on **Added**,
  double-tap the selected bar to open its cards.
- If a chart is empty, pick another deck or a longer period.

> **In the web version:** You can also select bars with a mouse click.

## Related topics

- [Stopwatch and study calendar](13-stopwatch-and-calendar.md)
- [Key concepts](02-key-concepts.md)
- [Card Browser and search](10-browser-and-search.md)
- [Filtered decks and Custom Study](11-filtered-decks.md)
- [Deck options](06-deck-options.md)
