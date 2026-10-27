---
id: filtered-decks
title: Filtered decks and Custom Study
summary: Gathering the cards that match a search into a temporary deck, gather order, preview mode, rebuilding, and the Custom Study options.
order: 11
web_path: /en/help/filtered-decks
app_help: help?article=filtered-decks
app_screens:
  - "Filtered deck form (create and Filtered deck options) — app/(tabs)/decks.tsx (renderFilterModal)"
  - "Filtered Deck Options (from the Overview) — components/FilteredDeckOptionsModal.tsx"
  - "Overview of a filtered deck — app/deck-overview.tsx"
  - "Custom Study — components/CustomStudyModal.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Filtered decks and Custom Study

A filtered deck temporarily gathers the cards from your other decks that match a search, for
example "cards I forgot this past week". **Custom Study** offers the most common filters for one
deck as ready-made options. Neither deletes or moves your cards.

<a id="what-are-filtered-decks"></a>
## What is a filtered deck?
<!-- In the app: the ? button of the filtered deck form (app/(tabs)/decks.tsx:1720) and of Filtered Deck Options (components/FilteredDeckOptionsModal.tsx:220) → "Learn more" link of that help → this section -->

- **Cards stay where they are.** Each card remains tied to its own deck. While it is in a
  filtered deck, it does not show up in its own deck's study session or numbers.
- **The contents are fixed.** Cards are gathered once, when the deck is built. No new cards are
  added while you study; cards you finish leave the deck and go back to their own decks. To gather
  again, use **Rebuild**.
- **Daily limits do not apply.** You can study as many cards as the deck holds.
- **Some cards cannot be gathered:** suspended or buried cards, and cards already in another
  filtered deck.

In the deck list, filtered decks appear in blue italics with a **⧉** mark. They cannot be
subdecks, cannot have subdecks and cannot be dragged.

> **Different from Anki:** Anki temporarily moves the cards it gathers into the filtered deck. In
> TusAnkiM the cards stay in their own decks; the filtered deck only keeps a list of the cards it
> holds. Filtered decks are not exported; their cards are exported in their own decks.

<a id="create-filtered-deck"></a>
## Creating a filtered deck

You can start from two places:

- **Decks › ＋ › Create filtered deck**,
- **Card Browser › ••• › Create filtered deck**: the search currently typed in Card Browser is
  filled in for you. See [Card Browser and search](10-browser-and-search.md).

In the form that opens:

1. **Deck name:** the default name looks like "Filtered Deck 14:30"; change it if you like. The
   name cannot contain `::`.
2. **Filter 1:** set the deck, search, card limit and order (next sections).
3. Turn on **Filter 2** if you need it.
4. Under **Study behavior**, choose whether to reschedule.
5. Tap **Build** at the top right.

The deck is gathered and its **Overview** opens; start with **Study Now**.

In a new form the search is pre-filled with the due cards of the deck you studied last (for
example `deck:"Pathology" is:due`). If no card matches, a **No matching cards** message appears;
change the search or turn on **Create/update even if empty**. No deck is built while the search
field is empty. If a deck with the same name exists, " (1)" is added to the new deck's name.

<a id="search-and-limit"></a>
## Search and card limit

- **Deck:** limits the search to one deck. The deck you pick is written into the search as a
  `deck:` term; **All decks** removes that term.
- **Search:** written in the same search language as **Card Browser**. Details:
  [Search syntax](10-browser-and-search.md#search-syntax). A few examples:

  | Search | Cards gathered |
  | --- | --- |
  | `deck:"Pharmacology" is:due` | Due cards in Pharmacology |
  | `rated:7:1` | Cards you answered with **Again** in the last 7 days |
  | `flag:1` | Cards with a red flag |
  | `tag:high-yield is:new` | New cards with this tag |
  | `prop:lapses>=3` | Cards you have forgotten at least 3 times |

- The **⌕** button shows how many cards the search matches and the terms you can use.
- **Card limit:** the most cards the deck will take (1–99,999). It is 100 for a new deck and 20
  for the second filter. If you type 0, 100 is used. The order decides which cards fit the limit.
- **Show any excluded cards:** explains why cards that match the search could not be gathered.

<a id="order"></a>
## Cards selected by

**Cards selected by** decides both which cards fit the limit and the order you study them in. A
new deck starts with **Random**.

| Option | Cards that come first |
| --- | --- |
| **Oldest seen first** | Cards you have not reviewed for the longest time; never-seen cards first of all |
| **Random** | Shuffled |
| **Increasing intervals** | Shortest interval |
| **Decreasing intervals** | Longest interval |
| **Most lapses** | Cards you have forgotten most often |
| **Order added** | Notes added earliest |
| **Order due** | Cards that fell due earliest, i.e. waited longest |
| **Latest added first** | Notes added most recently |
| **Ascending retrievability** | Lowest chance of recall according to FSRS |
| **Descending retrievability** | Highest chance of recall according to FSRS |
| **Relative overdueness** | Most overdue relative to their interval |

The two **retrievability** orders are only meaningful with FSRS on; with FSRS off they give the
cards in a fixed, shuffled order. **Overview › Filtered Deck Options** lists these two only while
FSRS is on; a deck you save there with FSRS off switches to **Random**. See [FSRS](07-fsrs.md).

<a id="second-filter"></a>
## Second filter

Turn on **Enable second filter** to add a second group of cards to the same deck, with its own
search, limit and order. The second group does not count cards the first one already took.

Example: to add a few new cards to the due Pathology cards,

- **Filter 1:** `deck:"Pathology" is:due`, limit 100, **Order due**,
- **Filter 2:** `deck:"Pathology" is:new`, limit 20, **Order added**.

The second filter starts with a limit of 20 and **Order due**. Turning the switch off and saving
removes the second filter.

<a id="reschedule"></a>
## Reschedule cards (preview)

With **Reschedule cards** on (the default), your answers count like normal study and change the
card's next date. A card you answer leaves the deck once it has finished its learning steps and
goes back to its own deck with its new date.

With it off, the deck works in **preview** mode, and the Overview shows a **Preview** label:

- Your answers do not change the card's schedule.
- **Again** brings the card back after 1 minute, **Hard** after 10 minutes; **Good** and **Easy**
  remove it from the session.
- You can change these times in **Overview › Filtered Deck Options › Preview delays (seconds)**:
  seconds for Again, Hard and Good, separated by spaces (`60 600 0`). 0 removes the card from the
  session; **Easy** always removes it. The field appears only while rescheduling is off.

Preview is handy close to an exam, to go over cards without disturbing your schedule.

<a id="rebuild-and-empty"></a>
## Rebuilding and emptying
<!-- In the app: Decks › ••• › Rebuild / Empty deck (app/(tabs)/decks.tsx:1480-1481), Overview › Rebuild / Empty (app/deck-overview.tsx:283-291) → this section -->

**Rebuild** sends the deck's cards back to their own decks, runs the search again and fills the
deck with the current matches. Which cards you had finished in the previous gathering is
forgotten; your answers stay on the cards. There is no confirmation. If no card matches, the deck
stays empty.

You find it at:

- **Decks › ••• › Rebuild**,
- **Overview › ↻ Rebuild**,
- the **Congratulations!** screen shown when you finish the deck (see [Studying](05-studying.md)).

**Empty deck** (**Empty** on the Overview) asks for confirmation, sends the cards back to their
own decks and keeps the deck and its search. An emptied deck shows **Deck is empty — rebuild it**
on the Overview and **This Filtered Deck Is Empty** on the study screen; in both places **Rebuild**
fills it again. The Overview's **Empty** button works only while cards are ready to study;
**Decks › ••• › Empty deck** always works.

**Changing the settings:** **Decks › ••• › Filtered deck options** or **Overview › Filtered Deck
Options**. Saving rebuilds the deck with the new settings. The button is called **Rebuild** in the
first and **Save and Rebuild** in the second. Preview delays are only in the Overview's form.

<a id="delete-filtered-deck"></a>
## Deleting a filtered deck

Choose **Decks › ••• › Delete deck** and tap **OK**. The deck is removed; your cards are not
deleted and go back to their own decks. In the window that follows, **Undo** brings the deck back
with the same cards.

To change only its name, use **••• › Rename deck** or the **Deck name** field in the form.

<a id="custom-study"></a>
## Custom Study
<!-- In the app: "Learn more" in the bottom note of the Custom Study sheet (new, components/CustomStudyModal.tsx:647) → this section -->

**Custom Study** sets up ready-made filtered sessions for a deck, or raises today's review limit.
To open it:

- **Decks › ••• › Custom study**,
- **Overview › Custom Study**,
- on the study screen, when the deck is finished: **Congratulations!** › **🎯 Custom Study**.

Filtered decks have no Custom Study.

1. Select one of the options.
2. Set the number with **−** / **+** or by typing it.
3. Tap **OK** (for the tag option, **Choose Tags**).

The session options create a filtered deck called **Custom Study Session** (when the app is in
Turkish: **Özel Çalışma Oturumu**). Each new Custom Study run sets up this deck's contents and
settings from scratch. To keep a session, rename it first.

Once the session is built, its **Overview** opens if you came from Decks or from an Overview; if
you came from the study screen, the session starts right there. If no card matches, the message
**No cards matched the criteria you provided.** appears and the window stays open.

> **Different from Anki:** Custom Study has no "increase today's new card limit" option, because
> new cards have no daily limit in TusAnkiM. See [Deck options](06-deck-options.md#daily-limits).

<a id="custom-study-options"></a>
## Custom Study options

| Option | Number | What it does | Changes the schedule? |
| --- | --- | --- | --- |
| **Increase today’s review card limit** | cards, −99,999…99,999 | Builds no session; adds to this deck's review limit for today. A negative value lowers it. | — |
| **Review forgotten cards** | days, 1–30 | Cards you answered with **Again** in the last N days, shuffled | No (preview) |
| **Review ahead** | days, 1–99,999 | Cards that fall due within the next N days, in due order | Yes |
| **Preview new cards** | days, 1–99,999 | New cards added in the last N days, in the order added | No (preview) |
| **Study by card state or tag** | cards, 1–99,999 (100) | One of the four kinds below, optionally with tags | Depends on the kind |

**Raising the review limit:** the **Available review cards** line shows how many reviews are due
today in the deck and its subdecks. The amount you add counts for today only and resets at the
**Start of next day** hour. Parent decks' limits go up too only if
**Deck options › Limits start from top** is on. Next time the window opens with the last increase
you used.

The kinds of **Study by card state or tag**:

- **New cards only** — in the order added; changes the schedule.
- **Due cards only** — in due order; changes the schedule.
- **All review cards in random order** — every card you have seen before; changes the schedule.
- **All cards in random order (don’t reschedule)** — preview.

If the deck has tags, **Choose Tags** opens **Selective Study**:

- To require certain tags, tick the box first, then pick from
  **Require one or more of these tags:**. If the box is not ticked, the choices in that list are
  not used.
- Cards with a tag from **Select tags to exclude:** are left out.
- You can select at most 100 tags. Your choices are remembered for next time.

If the deck has no tags, this step is skipped and the session is built straight away. If the deck
has no cards at all, **OK** is not available for the session options.

Example: on the evening before an exam, **Pathology › ••• › Custom study › Review ahead › 3 days**
lets you study the next three days' cards today.

## Related topics

- [Decks](04-decks.md)
- [Studying](05-studying.md)
- [Deck options](06-deck-options.md)
- [Card Browser and search](10-browser-and-search.md)
- [Key concepts](02-key-concepts.md#filtered-decks)
