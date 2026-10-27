---
id: concepts
title: Key concepts
summary: Spaced repetition, notes, cards, decks, note types, card states and the answer buttons in brief.
order: 2
web_path: /en/help/key-concepts
app_help: help?article=concepts
app_screens:
  - "Help center — app/help.tsx (new)"
  - "First-run introduction — help.firstRun.* (see in-app/01-decks.md)"
verified_against: master c6108e6 (2026-10-25)
---

# Key concepts

This page explains the words you will meet all over the app. If you have used Anki, most of them
will be familiar; the places where TusAnkiM differs are pointed out.

<a id="spaced-repetition"></a>
## How spaced repetition works

Trying to recall something just before you forget it makes it stick far better than rereading it
every day. TusAnkiM estimates that moment for every card:

1. You see the question on the card and try to answer it in your head.
2. You reveal the answer with **Show Answer** and tap a button to say how well you remembered.
3. Cards you remember well come back after longer and longer gaps (a few days, a few weeks, a few
   months). Cards you forgot come back soon.

This way most of your time goes to the cards you actually struggle with. For the best results,
study a little every day: reviews you skip carry over to the next day and the load grows.

<a id="notes-and-cards"></a>
## Notes, fields and cards

- A **note** is the piece of information itself. You write it in **fields**; for example, the
  question in the **Front** field and the answer in the **Back** field.
- A **card** is what you see of a note while studying. One note can produce one or more cards:
  - A basic note produces one card (front → back).
  - A "reversed" note produces two cards (front → back and back → front).
  - A cloze (fill-in-the-blank) note produces one card for each cloze number.
- Cards made from the same note are called **siblings**. When you edit a note, all of its siblings
  are updated together.

Because of this, you write a piece of information once and can test it from as many directions as
you like.

<a id="note-types"></a>
## Note type

A **note type** sets which fields a note has, and which cards are made from those fields and how
they look. You can start with the built-in types that come with the app, or create your own. See
[Note types and card templates](09-note-types.md).

<a id="decks"></a>
## Decks and subdecks

- A **deck** is a group of cards you want to study together; for example, "Pharmacology".
- Decks can be nested. A deck whose name contains `::` is a subdeck:
  `Pharmacology::Autonomic nervous system` appears under the "Pharmacology" deck.
- When you study a parent deck, the cards in its subdecks come too.
- Every card is in exactly one deck. Sibling cards from the same note can be in different decks.

See [Decks](04-decks.md).

<a id="collection"></a>
## Collection

Your **collection** is everything on your device put together: decks, notes, cards, note types,
review history and settings. Backups and `.colpkg` exports cover the whole collection.

<a id="tags-flags-marks"></a>
## Tags, flags and marks

- A **tag** is a free-form label you give to notes; for example, `high-yield` or `mock-exam-3`.
  Tags can also be nested with `::`: `pharmacology::antibiotics`. Use tags to group cards without
  moving them to another deck.
- A **flag** is a colored marker you put on a single card (red, orange, green, blue…). Flags
  suit personal lists such as "look at this later" or "ask my teacher".
- A **mark** (star) is a quick way to highlight a note; behind the scenes it is stored as the
  `marked` tag.

<a id="card-states"></a>
## Card states

| State | What it means |
| --- | --- |
| **New** | A card you have never seen. |
| **Learning** | A card you have just seen, repeated in short steps (for example, 1 minute, 10 minutes). |
| **Review** | A card that has finished learning and comes due after days or weeks. |
| **Relearning** | A card you forgot during review that is being studied again in short steps. |
| **Suspended** | A card that is never shown until you turn it back on. |
| **Buried** | A card set aside for today only; it comes back by itself the next day. |

The numbers in the deck list are split by these states: the new, learning and review cards you can
study today.

> **Two words for one in Turkish:** In English, **Review** is a card state (a card you already
> learned that is now due) and **Again** is the answer button you tap when you could not remember.
> In the Turkish interface both are called "Tekrar", so keep this in mind if you switch the app's
> language or read Turkish help.

<a id="answer-buttons"></a>
## Answer buttons

After you see the answer, you tap one of four buttons. Each button shows when the card will come
back if you choose it (for example, 10m, 3d, 1.5mo).

| Button | When to tap it |
| --- | --- |
| **Again** | You could not remember, or remembered wrongly. The card comes back soon. |
| **Hard** | You remembered, but it was a real struggle. The interval grows a little. |
| **Good** | You remembered correctly after some thought. This is the button you will tap most often. |
| **Easy** | It took no effort at all. The interval grows more. |

Be honest: counting a card you were unsure of as **Good** brings it back too late. **Hard** does
not mean "I forgot"; if you forgot, tap **Again**.

<a id="scheduler"></a>
## The scheduler: classic and FSRS

The **scheduler** works out when a card comes back. The app offers two options:

- **Classic scheduler:** Every card has an ease factor; the interval grows by this factor after
  each successful review.
- **FSRS:** Estimates from your review history how difficult each card is and how firmly it sits
  in your memory, then picks an interval based on the recall rate you aim for.

You choose in the deck settings. See [Deck options](06-deck-options.md) and [FSRS](07-fsrs.md).

<a id="presets"></a>
## Presets

Daily limits, learning steps and scheduler options are not set on each deck one by one, but
through a **preset**. All decks that use the same preset follow the same rules; if you want
different rules for a deck, you give it a new preset. See
[Deck options](06-deck-options.md#presets).

<a id="study-day"></a>
## The study day

In the app the day changes not at midnight but at the **Start of next day** hour (**04:00** by
default). If you study at 01:00, it still counts as "today". Daily limits, the return of buried
cards and "today" in the statistics all follow this hour. You can change it under
**Settings › Reviewing**.

<a id="leeches-and-siblings"></a>
## Leeches and burying siblings

- If you forget a card many times, the app marks it as a **Leech**. This usually means the card
  needs to be rewritten. See [Deck options](06-deck-options.md#lapses).
- If sibling cards from the same note come one after another on the same day, one can give away
  the other's answer. So, depending on your settings, when one sibling is shown the others can be
  **buried** until the next day.

<a id="filtered-decks"></a>
## Filtered decks

A **filtered deck** is a special deck that temporarily gathers the cards matching a search; for
example, "cards I forgot in the last 7 days" or "cards tagged pharmacology that are flagged".
The cards go back to their own decks when you finish studying or empty the deck.
See [Filtered decks and Custom Study](11-filtered-decks.md).

> **Different from Anki:** TusAnkiM has no daily limit for new cards; you can open as many new
> cards as you want to study. The daily limit for review cards works as it does in Anki.
> See [Deck options](06-deck-options.md#daily-limits).

## Related topics

- [Quick start](03-quick-start.md)
- [Studying](05-studying.md)
- [Glossary](21-glossary.md)
