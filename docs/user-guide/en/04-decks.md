---
id: decks
title: Decks
summary: The deck list and what its numbers mean; creating decks and subdecks, moving, deleting, the deck menu, the overview and deck shortcuts.
order: 4
web_path: /en/help/decks
app_help: help?article=decks
app_screens:
  - "Decks tab — app/(tabs)/decks.tsx"
  - "Deck rows and columns — components/decks/DeckListTable.tsx"
  - "Overview — app/deck-overview.tsx"
  - "Deck picker — components/DeckPickerModal.tsx"
  - "Sidebar (wide web window only) — components/Sidebar.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Decks

The app always opens on the **Decks** screen. Here you see all your decks and how many cards you
can study today, and you start studying by tapping a deck. Creating, renaming, moving and
deleting decks also happens here.

<a id="deck-list"></a>
## The deck list
<!-- In the app: Decks › ⓘ in the column header (new, components/decks/DeckListTable.tsx:22) → help.decks.sheet "Learn more" → this section -->

From top to bottom:

- **Header:** the **Decks** title, the **↻** button that recounts the numbers, and the **⋮**
  (More options) button at the top right.
- **Column headers:** **DECK**, **New**, **Learn**, **Review**.
- **Deck rows.** Each row, from left to right:
  - an arrow to show or hide subdecks (a small dot if the deck has none),
  - the deck name,
  - three numbers (see [What the numbers mean](#deck-counts)),
  - the **⠿** move handle,
  - the **•••** deck menu.
- **＋ button** at the bottom right: adds a deck, a filtered deck or a card.
- **Bottom bar:** **Card Browser**, **Stats**, **Settings**.

Which subdecks are shown or hidden is remembered, so the list looks the same next time. Filtered
decks appear in blue italics with a **⧉** mark on the left.

If the **TUS Kartları** pack is not installed, a locked row with a dashed outline sits at the top
of the list: **TUS Kartları**, "9,575 cards · 12 courses · 106 subdecks" and **Unlock free**.
Tapping it opens the pack screen. See [TUS card pack](17-tus-card-pack.md).

On first launch the list also contains a deck named **Varsayılan** (Turkish for "Default"). Cards
you add without choosing a deck go there.

<a id="deck-counts"></a>
## What the numbers mean
<!-- In the app: help.decks.sheet (ⓘ in the Decks column header and in the Overview counts card) "Learn more" → this section -->

| Column | Shows |
| --- | --- |
| **New** | **All** cards in the deck you have never seen. |
| **Learn** | Learning and relearning cards due now or within a few minutes, plus learning cards due today whose step is a day or longer. |
| **Review** | Review cards due today or overdue, up to what is left of today's review limit. |

- A parent deck's row includes its subdecks.
- Suspended and buried cards are not counted.
- A card gathered into a filtered deck is taken out of its own deck's count and shown on the
  filtered deck's row instead.
- The numbers are recalculated each time the screen opens. If a learning card falls due while
  the list is open, tap **↻**.
- "A few minutes" is the **Learn ahead limit** in **Settings** (20 minutes by default).

> **Different from Anki:** TusAnkiM has no daily limit for new cards. The **New** column therefore
> shows every new card in the deck; for the TUS Kartları pack it can be in the thousands. The
> **Review** column is capped by the daily review limit as in Anki.
> See [Deck options](06-deck-options.md#daily-limits).

<a id="open-and-study"></a>
## Opening a deck and studying

Tap a deck name: the study screen opens on that deck. Tapping a parent deck also brings in the
cards of its subdecks. Use the back button or swipe from the left edge of the screen to return to
the list; the subdecks you had open and your place in the list are kept.

To see the deck's description, today's numbers and buried cards first, open
**••• › Overview** (see [Overview](#deck-overview)).

> **Different from Anki:** In Anki on the desktop, clicking a deck first shows its overview. In
> TusAnkiM, as in AnkiMobile, studying starts as soon as you tap.

For the study screen itself, see [Studying](05-studying.md).

<a id="create-deck"></a>
## Creating a deck

1. Tap the **＋** button at the bottom right.
2. Choose **Create deck**.
3. Type the name in the **Name** field and tap **Create**.

- A name with `::` creates a subdeck: `Pharmacology::Antibiotics` opens under **Pharmacology**.
  Parent decks that do not exist yet are created too.
- If a deck with the same name already exists (upper/lower case is ignored), no new deck is
  created; the existing one is used.
- A new deck is added at the end of its siblings and starts on the default preset. For other
  limits and steps, see [Deck options](06-deck-options.md#presets).

You can also create a deck from the deck pickers that open while adding, importing or moving
cards (see [Deck picker](#deck-picker)).

<a id="subdecks"></a>
## Subdecks

You can put a deck under another deck in three ways:

- by typing `::` in its name (when creating or renaming it),
- with **••• › Create subdeck**,
- by dragging its **⠿** handle onto the middle of another deck (see [Moving](#rename-and-move)).

Studying a parent deck includes the cards of its subdecks. A new subdeck does not take over its
parent's preset; it starts on the default preset.

Filtered decks cannot be subdecks and cannot have subdecks. You cannot put your own decks under
the decks of the TUS Kartları pack.

<a id="add-menu"></a>
## The ＋ menu

The **＋** at the bottom right opens three options. Tap an empty part of the screen to close it.

- **Create filtered deck:** gathers the cards matching a search into a temporary deck.
  See [Creating a filtered deck](11-filtered-decks.md#create-filtered-deck).
- **Create deck:** see [Creating a deck](#create-deck).
- **Add note:** opens the add-card screen. The card goes into the deck you studied last; if there
  is none (or it is a TUS Kartları deck), into **Varsayılan**. You can change the deck on that
  screen. See [Adding and editing cards](08-adding-and-editing.md).

<a id="more-menu"></a>
## More options (⋮)

The **⋮** button at the top right holds actions for the whole collection:

- **Empty Cards:** finds and cleans up cards whose template no longer shows anything.
  See [Empty Cards](15-backups-and-maintenance.md#empty-cards).
- **Import deck:** brings in `.apkg`, `.colpkg` and text files.
  See [Import and export](14-import-export.md).
- **Export:** saves decks or the whole collection as a file.
- **Create Backup** and **Restore from Backup:** both open the **Backups** screen, where you
  name and create a backup or restore one. See [Backups and maintenance](15-backups-and-maintenance.md).
- **Help:** opens this guide.
  <!-- Proposed entry point: in-app/01-decks.md › help.decks.more.help. Remove this item if it is not implemented. -->

<a id="deck-menu"></a>
## The deck menu (•••)

The **•••** at the right of each row opens a menu for that deck. Its title shows the deck's full
path (for example "Pharmacology › Antibiotics"). Which items appear depends on the kind of deck:

| Item | What it does | Shown for |
| --- | --- | --- |
| **Overview** | Opens the deck's summary screen. | All decks |
| **Add** | Opens the add-card screen for this deck. | All except filtered decks |
| **Browse cards** | Opens **Card Browser** on this deck and its subdecks. | All decks |
| **Rename deck** | See [Renaming](#rename-and-move). | All except TUS Kartları |
| **Create subdeck** | Adds a deck under this one. | Your own regular decks |
| **Deck options** | Limits, steps, preset. See [Deck options](06-deck-options.md). | All except filtered decks |
| **Custom study** | See [Custom Study](11-filtered-decks.md#custom-study). | All except filtered decks |
| **Export deck** | Opens the export screen with this deck. | Your own regular decks |
| **Filtered deck options**, **Rebuild**, **Empty deck** | See [Filtered decks](11-filtered-decks.md#rebuild-and-empty). | Filtered decks only |
| **Create shortcut** | See [Deck shortcut](#deck-shortcut). | All decks |
| **Edit description** | See [Deck description](#deck-description). | All except TUS Kartları |
| **Delete deck** | See [Deleting a deck](#delete-deck). | All except TUS Kartları |

The decks of the TUS Kartları pack are protected: they cannot be renamed, moved, deleted or
exported.

<a id="rename-and-move"></a>
## Renaming and moving

**Renaming:** choose **••• › Rename deck**, change the **New name** field and tap **Rename**.
Only the deck's own name changes; its parent and subdecks stay as they are. Typing `::` in the new
name moves the deck one level deeper where it is. If a deck with that name already exists in the
same place, the name is refused with a message saying so.

**Moving:** to put a deck under another parent or at the top level, use its **⠿** handle:

1. Touch the row's **⠿** handle and drag without lifting your finger.
2. Choose where to drop:
   - on a row's **top edge**: the deck goes above it,
   - on its **bottom edge**: below it,
   - on its **middle**: it becomes that deck's subdeck.
3. Hold for a moment over the middle of a collapsed parent to open it and reach deeper decks.
4. To bring a subdeck to the top level, drop it on the **↑ Drop at top level** strip that appears
   above the list.

While you drag, the screen says what will happen, for example "Anatomy will become a subdeck of
Pathology". The list scrolls by itself near the top or bottom edge. The deck moves together with
its subdecks. If the destination already has a deck with the same name, " (1)" is added to the
moved deck's name.

Filtered decks and TUS Kartları decks cannot be dragged; their handles are dimmed. A move has no
undo button: if you dropped a deck in the wrong place, drag it again.

> **Different from Anki:** Anki on the desktop always sorts decks alphabetically. In TusAnkiM you
> can drag decks on the same level into any order you like; new decks are added at the end.

> **In the web version:** Dragging also works with the mouse. Hovering over the handle shows the
> drop rules as a tooltip.

<a id="delete-deck"></a>
## Deleting a deck

1. Choose **••• › Delete deck**.
2. Read the warning and tap **OK**.
3. The **Deck deleted** window says how many cards were deleted. If you change your mind, tap
   **Undo** right away; after **Done** the deletion can no longer be undone.

What is deleted: the deck, all its subdecks and the cards in them; notes left without any card are
deleted too. Notes that still have a sibling card in another deck are kept. Your review history
is not deleted.

- Deleting a filtered deck does not delete your cards; they go back to their own decks.
  See [Deleting a filtered deck](11-filtered-decks.md#delete-filtered-deck).
- The **Varsayılan** deck cannot be removed completely: its cards and subdecks are deleted, and
  the deck stays, empty, under the name **Default**.
- TUS Kartları decks cannot be deleted. To remove the pack, see
  [TUS card pack](17-tus-card-pack.md).

> **Warning:** No automatic backup is made before a deletion. Before deleting a large deck, make
> a backup with **⋮ › Create Backup**. See [Backups and maintenance](15-backups-and-maintenance.md).

<a id="deck-overview"></a>
## Overview
<!-- In the app: Decks › ••• › Overview (app/(tabs)/decks.tsx:1443) and the ⓘ in the Overview counts card (new, app/deck-overview.tsx:219) → this section -->

**••• › Overview** opens the deck's summary screen. It also opens after you create a filtered deck
or a Custom Study session, and when you choose "Go to this deck" on a session in the Study
Calendar or the Stopwatch.

From top to bottom:

- The deck name and, for a subdeck, its full path; the **DECK DESCRIPTION** if there is one.
- Today's **New**, **Learn** and **Review** numbers, calculated with the deck's own limits.
- If cards are buried, **💤 Unbury … cards now**. If some were buried by you and others because of
  a sibling, you are asked which ones to bring back. Buried cards normally come back on their own
  on the next study day (see [Key concepts](02-key-concepts.md#study-day)).
- **Study Now · … cards** (or **Open Study Screen** when nothing is ready). After studying, the
  back button takes you to the deck list.
- The **Custom Study**, **Deck Options** and **Deck Statistics** buttons.

On this screen the **•••** at the top right opens **Deck Options** directly. The overview of a
filtered deck shows its saved search and the **Rebuild**, **Empty** and **Filtered Deck Options**
buttons instead; see [Rebuilding and emptying](11-filtered-decks.md#rebuild-and-empty).

<a id="deck-description"></a>
## Deck description

With **••• › Edit description** you can attach a note to a deck, for example the source it was
made from. The description appears as plain text in the **DECK DESCRIPTION** box of the
**Overview**. Clear the field and save to remove the box.

Decks from Anki often have a formatted (HTML) description. The Overview turns it into readable
plain text: line breaks and bullet points are kept, other formatting is not shown. In the edit
field you see the description's HTML code.

<a id="deck-shortcut"></a>
## Deck shortcut
<!-- In the app: Decks › ••• › Create shortcut (app/(tabs)/decks.tsx:1486) → this section; 18-shortcuts-and-automation.md links here -->

To open a deck you study often with a single tap:

1. Choose **••• › Create shortcut**.
2. The iPhone's add-shortcut window opens with the deck's name. Confirm it.
3. The **Shortcut added** message appears. The shortcut is now in the **Shortcuts** app.

Running the shortcut opens TusAnkiM straight on that deck's study screen. If you close the window
instead, nothing changes. To run the shortcut with Siri or from the Home Screen, see
[Shortcuts and automation](18-shortcuts-and-automation.md).

> **In the web version:** **Create shortcut** copies a link that opens the deck to the clipboard.
> You can save it as a bookmark.

<a id="deck-picker"></a>
## Deck picker

Wherever you need to choose a deck (study screen, adding cards, **Card Browser**, Statistics,
import, Deck Options, filtered decks), the same window opens:

- The deck you are working on is at the top and opened; the other decks keep their order from the
  deck list.
- The **magnifier** searches. The search matches the beginning of words, ignores upper/lower case
  and accents, and looks at the deck's full path: typing `tus anatomi` finds
  "TUS Kartları › Anatomi".
- **＋** creates a new deck. It is created and selected, and you stay on the screen you were on. If
  a deck with that name exists, that deck is selected. Type `::` in the name for a subdeck.
- Some pickers start with an **All decks** or **Whole Collection** row.

<a id="navigation"></a>
## Getting around the app

- The app always opens on **Decks**. From other screens, go back with the back button at the top
  left or by swiping from the left edge of the screen.
- **Card Browser** in the bottom bar opens the whole collection. To look at one deck only, use
  **••• › Browse cards**. See [Card Browser and search](10-browser-and-search.md).
- **Stats** opens statistics for the whole collection; for one deck use
  **Overview › Deck Statistics**. The **Stopwatch** opens from the daily streak card on the
  Statistics screen, and the **Study Calendar** from the Stopwatch. See [Statistics](12-statistics.md)
  and [Stopwatch and study calendar](13-stopwatch-and-calendar.md).
- **Note types** open from the note type picker on the add-card screen, with
  **Manage note types…**. See [Note types and card templates](09-note-types.md).

> **In the web version:** If the window is at least 768 pixels wide, a permanent sidebar appears to
> the left of the study screen. **TusAnkiM** at the top returns to Decks. In the middle is the
> tree of the deck you are studying (badges show total card counts), or **All Subjects** and the
> subjects when no deck is selected. At the bottom are **Card Browser**, **Stats**, **Stopwatch**,
> **Study Calendar**, **Decks** and **Settings**. The iPhone app has no sidebar.

## Related topics

- [Studying](05-studying.md)
- [Deck options](06-deck-options.md)
- [Filtered decks and Custom Study](11-filtered-decks.md)
- [TUS card pack](17-tus-card-pack.md)
- [Import and export](14-import-export.md)
- [Shortcuts and automation](18-shortcuts-and-automation.md)
