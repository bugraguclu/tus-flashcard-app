---
id: browser
title: Card Browser and search
summary: Find, filter and bulk-edit cards in the Card Browser; the search terms; and the Card Info screen.
order: 10
web_path: /en/help/card-browser-and-search
app_help: help?article=browser
app_screens:
  - "Card Browser — app/browser.tsx (pieces in components/browser/)"
  - "Card Info — app/card-info.tsx (from the study screen's ⋮ menu)"
verified_against: master c6108e6 (2026-10-25)
---

# Card Browser and search

The **Card Browser** is where you list, search and change your cards in bulk. You can move cards to
another deck, tag them, flag them, suspend them or delete them. In the Turkish interface the screen
is called **Kartlarım**.

<a id="open-browser"></a>
## Opening the Card Browser

- **Card Browser** in the bottom bar of the **Decks** tab: opens the whole collection.
- **•••** on a deck row › **Browse cards**: opens that deck and its subdecks.
- Tapping a bar of the **Added** chart in **Statistics**: opens the cards added on those days, with
  the search box already filled in.
- A shortcut can open the Card Browser with a search through a
  `tusankim://x-callback-url/search?query=…` link. See
  [Shortcuts and automation](18-shortcuts-and-automation.md).

To leave, tap the back button at the top left or swipe right from the left edge of the screen.

> **In the web version:** In a wide window (768 pixels or more) a sidebar appears to the left of the
> study screen; its **Card Browser** button opens the screen on the deck you are studying. iPhone
> has no sidebar.

<a id="browser-layout"></a>
## Screen layout
<!-- In the app: ⓘ to the right of the Card Browser title (new, app/browser.tsx:893) → help.browser.sheet → "Learn more" this section -->

1. **Deck selector and count:** Shows whose cards you see (**Whole Collection** or a deck name) and
   how many cards are listed. Next to it are **＋ New Card** and **⋮**.
2. **Search box:** The list narrows as you type. **✕** clears the search, **?** opens search terms.
3. **Filter chips:** **All**, **Marked** and any filters currently on.
4. **List:** Each row shows the card's question, its deck and a state label (**Learn** or
   **Review**; new cards have none). A star means the note is marked, a coloured flag shows the
   card's flag and a pause symbol means the card is suspended. Rows of suspended and buried cards
   have a different background colour.

- Tap a row to expand it: the answer, **Interval**, **Ease**, **Due** and a **Suspend** button
  appear.
- The pencil opens the card in the editor. See [Adding and editing cards](08-adding-and-editing.md).
- Touching and holding a row starts selecting. See [Selecting cards](#selecting).
- Pull the list down to refresh it; more cards load as you scroll.

<a id="deck-and-filters"></a>
## Deck and filters

Tap the deck selector and pick a deck; the list updates in place and keeps your search and
filters. Subdecks are always included. **Whole Collection** shows every card; **＋** in the selector
creates a new deck. The count is what the deck, the filters and the search find together.

Filters are in the **⋮** menu:

| Menu item | Shows |
| --- | --- |
| **Filter marked** | Cards of marked (starred) notes. The **Marked** chip does the same. |
| **Filter suspended** | Suspended cards. |
| **Filter by tag** | Notes carrying **any** of the tags you pick; child tags are included. Only tags in the selected deck are listed. |
| **Filter by flag** | Cards with any of the flags you tick in the list that opens. **No flag** is an option too; tick nothing and the list is empty. |

Each active filter becomes a chip under the search box; its **×** removes that filter. **All**
removes every filter but leaves the search and the deck alone.

> **Note:** The deck selector and a `deck:` term you type apply together. With a deck selected, a
> `deck:` search for another deck finds nothing; choose **Whole Collection** first.

<a id="cards-and-notes"></a>
## Cards and notes view

In **⋮ › Options › View**, choose **Cards** or **Notes**.

- **Cards:** Every card is a row; a note with a reverse card makes two rows.
- **Notes:** Every note is one row. The row shows the note's first card and its note type, and the
  count counts notes. Every action in this view applies to **all cards** of the note. Flag and
  suspend markers are not shown on the rows.

The same window has **Show answer preview**, which adds a short piece of the answer to each row,
and **Scheduling details**, which turns the "Last: … · Next: …" line on or off. Your choices are
remembered. The text size of the rows is set in **Settings** under **Card browser › Font scaling**.

<a id="sorting-and-columns"></a>
## Sorting and columns

Tap **⋮ › Change display order**, choose **Ascending** or **Descending** and a sort key. Your choice
is remembered.

| Key | Sorts by |
| --- | --- |
| **Sort Field** | The note's sort field (the first field for most note types), alphabetically |
| **Card Type** | Which card of the note it is (Card 1, Card 2…); **Card Count** in the Notes view |
| **Due** | New cards first (by position), then learning, then review cards (by due day); **Earliest Due** in the Notes view |
| **Deck** | Deck name |
| **Created** / **Modified** | When the note was added / when the card last changed |
| **Interval**, **Ease**, **Lapses**, **Reviews** | That value of the card; average or total in the Notes view |

The row layout is fixed; columns cannot be added or removed. Only the two optional lines in
**Options** can be added.

<a id="selecting"></a>
## Selecting cards and bulk actions
<!-- In the app: "Learn more" at the bottom of the selection bar's "More" sheet (new, components/browser/BrowserMenus.tsx:224) → this section -->

1. Touch and hold a row; selecting starts and the row is selected.
2. Tap other rows to add or remove them. To select everything, use **⋮ › Select all**.
3. Pick an action in the bar at the bottom: **Deck**, **Suspend**, **Flag** or **More**.
4. When you are done, close the selection with **×** at the left of the bar.

Because the list loads as you scroll, a long list shows **Select loaded (N)** in the menu: only rows
loaded so far are selected. To select all of them, scroll to the end of the list first.

**More** holds **Toggle suspend**, **Toggle bury**, **Change note type**, **Change deck**,
**Reposition**, **Set due date**, **Edit tags**, **Grade now**, **Reset cards…**, **Preview**,
**Export cards** and **Delete notes**; each is described below.

- Actions that switch something on or off (suspend, bury, flag) look at **the card you tapped last**:
  if that card is suspended, the whole selection is unsuspended, otherwise all are suspended.
- Cards from the built-in TUS card pack cannot be moved to another deck, cannot change note type
  and cannot be exported or deleted; the app says so with a **Catalog Protected** message. See
  [TUS card pack](17-tus-card-pack.md).

<a id="undo"></a>
### Undo

| Action | How to undo |
| --- | --- |
| **Delete notes** | **Undo** in the message after deleting |
| **Change note type** | **Undo** in the message after the change |
| **Change deck** | **⋮ › Undo Update Deck** before leaving the screen (last move) |
| **Reposition** | **Undo** when you open the dialog again (last reposition) |

Correct suspend, bury, flag and tag changes by doing the opposite action. **Set due date**,
**Reset cards** and **Grade now** cannot be undone.

> **Different from Anki:** The Card Browser has no general undo command; only the actions above can
> be undone. Desktop Anki's column chooser, find and replace, finding duplicates and saved searches
> are not available. You open Card Info from the study screen.

<a id="change-deck"></a>
## Changing the deck

1. Select the cards and tap **Deck** in the bar (or **More › Change deck**).
2. Pick the target in **Deck for Selected Cards**. The box at the top filters decks, and **＋**
   creates a new deck and selects it right away.

The cards move without a confirmation; their due dates and intervals stay the same. Filtered decks
and the TUS card pack's decks are not offered as targets. If you use FSRS, the memory state of the
moved cards is recalculated with the new deck's settings.

<a id="change-note-type"></a>
## Changing the note type

Select the cards, tap **More › Change note type** and pick the new note type. Fields and cards are
matched by name first, then by order; if cards without a counterpart would be removed, the app asks
first and offers **Undo** afterwards. Details:
[Note types and card templates](09-note-types.md#change-note-type).

<a id="tags"></a>
## Editing tags

1. Select the cards and tap **More › Edit tags**.
2. In **Tags for Selected Notes**, the ticked tags are the ones **all** selected notes share.
3. A tag you tick is added to every selected note; a tag you untick is removed from all of them.
   Tags only some notes have appear unticked and are not changed.
4. For a new tag tap **＋** (separate several tags with spaces), then **Confirm**.

Tags belong to the note: changing a card's tags affects every card of that note.

<a id="flags-and-marks"></a>
## Flags and marks

Select the cards, tap **Flag** in the bar and pick a colour; **No flag** removes the flag. If you
pick the flag the card you tapped last already has, the flag is removed from the whole selection.
Flag names cannot be changed.

| Search | Flag | Search | Flag |
| --- | --- | --- | --- |
| `flag:0` | No flag | `flag:4` | Blue flag |
| `flag:1` | Red flag | `flag:5` | Pink flag |
| `flag:2` | Orange flag | `flag:6` | Turquoise flag |
| `flag:3` | Green flag | `flag:7` | Purple flag |

A **mark** (star) is the note's `marked` tag. The Card Browser has no mark button: mark the note on
the study screen with **⋮ › Mark note**, or add the `marked` tag with **Edit tags**. Find marked
notes with the **Marked** chip or the search `tag:marked`.

<a id="suspend-and-bury"></a>
## Suspending and burying

- **Suspend:** **Suspend** in the bar, **More › Toggle suspend**, or the **Suspend** button of an
  expanded row. A suspended card never comes up in study until you tap **Unsuspend**.
- **Bury:** **More › Toggle bury**. A buried card is set aside for that day only and returns by
  itself on the next study day. Suspended cards are not buried.

<a id="reposition"></a>
## Changing the order of new cards

Every new card has a **position** number. When the deck options' **Display Order** card uses a
position order (for example **Ascending position**), new cards come in that order. See
[Deck options](06-deck-options.md).

1. Select new cards and tap **More › Reposition**.
2. Type a **Start position** and a **Step**: the first note gets the start number, each next note
   one step more. Tick **Randomize order** if you like.
3. With **Shift position of existing cards** ticked, the other new cards at or after the start move
   back by the number of selected cards × the step, so numbers do not collide. The box is ticked
   every time the dialog opens; untick it if you do not want the shift.
4. Tap **Apply**.

- Only new cards are affected; if the selection has none, a **No new cards** message appears.
  Cards of the same note share one position.
- Cards are numbered in list order; if you selected them one by one, the card you tapped last
  goes first. For a specific order, sort the list first and select with **⋮ › Select all**.
- **Start position** and **Step** start at 1 each time; **Randomize order** is remembered.

<a id="set-due-date"></a>
## Setting the due date

1. Select the cards and tap **More › Set due date**.
2. Type a number of days and tap **Apply**:
   - `0` means today, `1` tomorrow, `5` five days from now.
   - `3-7` gives each card a random day between 3 and 7, spreading the load.
   - A trailing `!` (`7!`) also sets the card's interval to that many days. With FSRS on, `!` has no
     effect; the interval follows the time from your last review of the card to the new due day.

Negative numbers and spaces are not accepted; a wrong entry shows **Invalid due date**. The cards
become **review cards** due on that day, new cards included. A new card's old position is kept, so
a reset can put it back. The change is written to the review history as a **Manual** row and
cannot be undone.

<a id="forget-and-reset"></a>
## Resetting cards

**More › Reset cards…** makes the selected cards **New** again (Anki calls this "Reset Card",
formerly "Forget").

- **Restore original position where possible** (on by default): the card returns to the position it
  had before it was first studied; if that is unknown, it goes to the end of the new cards.
- **Reset repetition and lapse counts** (off by default): also sets those counts to zero.

When you tap **Reset**, the interval, ease and FSRS memory state are cleared, and cards in a
filtered deck return to their own deck. The review history is kept. Your choices are remembered
for next time. This cannot be undone.

<a id="grade-now"></a>
## Grade now

**More › Grade now** treats the selected cards as if you had answered them on the study screen: the
moment you tap **Again**, **Hard**, **Good** or **Easy**, every card is scheduled. These answers
count as real reviews in Statistics and cannot be undone.

<a id="preview-and-export"></a>
## Preview and export

- **More › Preview** shows the cards as they look when you study. Switch sides with **Answer** /
  **Question**, move with **Previous** / **Next**, and swipe down to close.
- **More › Export cards** (**Export notes** in the Notes view) opens the selection on the
  **Export** screen. See [Import and export](14-import-export.md).

<a id="delete-notes"></a>
## Deleting notes

1. Select the cards and tap **More › Delete notes**.
2. In the confirmation, tap **Delete Notes**.

Deleting works on **notes**: the note of each selected card is deleted together with its sibling
cards, even ones you did not select. **Undo** in the **Deleted** message that follows brings
everything back; once you close it with **Done**, there is no undo. The review history is kept.

<a id="create-filtered-deck"></a>
## Creating a filtered deck from a search

**⋮ › Create filtered deck** combines the deck selection, the filters and the search into one
search, switches to the **Decks** tab and opens the filtered deck screen with that search. See
[Filtered decks and Custom Study](11-filtered-decks.md).

<a id="search-basics"></a>
## Search basics

- Plain words are searched in the **text of the note's fields** (question, answer and any other
  field). Part of a word matches too: `heart` also finds "hearts". Upper and lower case do not
  matter.
- Tags, deck names and topics are not searched by plain words; use `tag:` and `deck:` for those.
- With several words, a card must contain all of them. To find words side by side, use quotes:
  `"beta blocker"`.
- While a search is incomplete (for example you typed `is:` and nothing more), **Search is not valid
  yet; showing the last valid results.** appears under the box and the list stays as it was.
- **?** opens common terms; tapping one adds it to your search. For terms that need a value, such as
  `deck:`, tap the box and type the value.
- If formatting runs through the middle of a word (only some letters bold, say), the word is found
  only in the note's sort field.

<a id="search-syntax"></a>
## Search terms
<!-- In the app: Card Browser › ? in the search box (app/browser.tsx:978-986) → "How search works" (components/browser/BrowserDialogs.tsx:376) → "Learn more" (new) this section -->

| Term | Meaning | Example |
| --- | --- | --- |
| `deck:name` | The deck and its subdecks; quote names with spaces, write subdecks with `::` | `deck:"Pharmacology::Autonomic"` |
| `deck:current` | The deck chosen in the deck selector | `deck:current is:due` |
| `deck:filtered` | Cards that are in a filtered deck | `-deck:filtered` |
| `tag:name` | The tag and its child tags | `tag:pharmacology` |
| `tag:none` | Notes without tags | `tag:none` |
| `note:name` | Note type (by its stored name, see below) | `note:Basic` |
| `card:n` | Which card of the note it is | `card:2` |
| `preset:name` | The deck's options preset | `preset:"TUS Kartları"` |
| `is:new` / `is:learn` / `is:review` | New / learning (relearning included) / review cards | `is:learn` |
| `is:due` | Cards due today or overdue | `is:due` |
| `is:suspended` / `is:buried` | Suspended / buried cards | `-is:suspended` |
| `flag:n` | Flag number (0 no flag, 1–7) | `flag:1` |
| `added:n` | Cards added in the last n days | `added:7` |
| `edited:n` | Notes edited in the last n days | `edited:3` |
| `rated:n` | Cards answered in the last n days | `rated:1` |
| `rated:n:b` | Answered with button b (1 **Again**, 2 **Hard**, 3 **Good**, 4 **Easy**) | `rated:7:1` |
| `introduced:n` | Cards first studied in the last n days | `introduced:7` |
| `resched:n` | Cards whose due date was changed by hand in the last n days | `resched:1` |
| `prop:ivl` | Interval (days) | `prop:ivl>=21` |
| `prop:due` | Days until due (0 today, negative overdue) | `prop:due<=3` |
| `prop:reps` / `prop:lapses` | Number of reviews / lapses | `prop:lapses>=5` |
| `prop:ease` | Ease (2.5 = 250%; new cards count as 0) | `prop:ease<2` |
| `prop:pos` | Position of a new card | `prop:pos<=100` |
| `prop:s` / `prop:d` / `prop:r` | FSRS stability (days) / difficulty (0–1) / retrievability (0–1) | `prop:r<0.8` |
| `nc:word` | Ignores accents and Turkish letter differences | `nc:bobrek` |
| `w:word` | Whole word only | `w:mass` |
| `*` / `_` | Any run of characters / one character | `hypo*emia` |
| `field:text` | The whole field; add `*` for a part | `front:*heart*` |
| `field:` | An empty field | `back:` |
| `re:pattern` | Regular expression (quote it if it has spaces) | `"re:\d+ mg"` |
| `nid:` / `cid:` | Note / card number (shown in Card Info) | `cid:1712345678901` |

- `prop:` terms use `=`, `!=`, `<`, `<=`, `>`, `>=`. Use a dot for decimals: `prop:d>0.7`, not `0,7`.
- Days count by study day: `rated:1` means today. See [Key concepts](02-key-concepts.md#study-day).
- Percentages in Card Info become 0–1 in FSRS terms: **Difficulty** 70% → `prop:d>0.7`.
- `is:relearn`, `is:buried-manually`, `is:buried-sibling` and `sc:` (searches through cloze markup)
  work too. Advanced terms such as `mid:`, `did:`, `dupe:` and `has-cd:` need numbers the app does
  not show, so most people will not need them.

<a id="search-combining"></a>
## Combining terms

| Write | Means | Example |
| --- | --- | --- |
| space | All of them | `deck:Pharmacology is:due` |
| `or` | Any of them | `tag:antibiotic or tag:antiviral` |
| `-` | Exclude | `-is:suspended` |
| `( )` | Group | `deck:Pharmacology (flag:1 or flag:2)` |
| `"…"` | A value or phrase with spaces | `"deck:TUS Kartları"` |
| `\` | Makes the next character plain text | `2\:1` |

A colon in your text starts a field search: `2:1` searches a field called "2", and quotes do not
change that; write ratios as `2\:1`. A misspelled term name (`dekc:`) is also read as a field name
and finds nothing, without a warning.

<a id="search-turkish"></a>
## Turkish letters
<!-- In the app: Card Browser no-results tip help.browser.noResultsTip (new, app/browser.tsx:1050-1053) → this section -->

- Case does not matter, and the four forms of i (I, ı, İ, i) count as the same letter: `isi` finds
  "Isı" and "İSİ".
- **ç, ğ, ö, ş, ü** must be typed as they are in the card: `cografya` does not find "Coğrafya". To
  ignore the difference, put `nc:` before the word: `nc:cografya`. In a field search:
  `front:nc:*cografya*`. The same goes for accents in other languages (`nc:resume` finds "résumé").
- The **Filter decks** box in the deck selector works differently: it ignores these letters on its
  own and matches the beginnings of words.

<a id="search-stored-names"></a>
## Note type, field and card names

The Turkish interface translates the names of the built-in note types; search uses the stored
(English) names. In the English interface you see those names directly:

| Turkish screen | In search |
| --- | --- |
| Temel | `note:Basic` |
| Temel (ve ters kart) | `note:"Basic (and reversed card)"` |
| Boşluklu | `note:Cloze` |
| **Ön** / **Arka** field | `front:` / `back:` |
| **Metin** field | `text:` |
| Kart 1, Kart 2 | `card:1`, `card:2` |

Note types and fields you created are searched by the names you see in the editor. The topic name
shown in the Card Browser (for example "General") cannot be searched.

<a id="search-differences"></a>
## How search differs from Anki

> **Different from Anki:**
> - Case is ignored in every term for every alphabet, and the four forms of i count as one; Anki
>   folds only Latin letters in plain text.
> - There is no "ignore accents in search" setting; use `nc:`.
> - `nc:` removes accent marks only; letters such as `ß` do not count as `ss`.
> - Regular expressions follow JavaScript syntax; of the inline flags, only a leading `(?-i)`
>   (case-sensitive) is accepted.
> - `dupe:` compares the first field, without formatting, exactly.
> - `deck:current` means the deck in the Card Browser's deck selector, and the whole collection
>   elsewhere.
> - The note type and field names shown in the Turkish interface are not searchable; use the stored
>   names.

<a id="card-info"></a>
## Card Info
<!-- In the app: Study screen › ⋮ (Card and note options) or Tools › Card info (components/CardOptionsMenu.tsx:360-362); the screen's ⓘ (new, app/card-info.tsx:207) → help.cardInfo.sheet → this section -->

Card Info shows every detail of the card on screen while you study. On the study screen tap **⋮**
at the top (or the gear **Tools** button, depending on your settings) and choose **Card info**. It
does not open from the Card Browser. To close it, swipe down or tap **Back**.

| Section | Shows |
| --- | --- |
| **General Information** | **Deck**, **Note type**, **Created** (day the note was added), **Modified** (day the card last changed), **Card ID** and **Note ID** (`cid:`, `nid:` in search) |
| **Tags & Flag** | The note's tags and the card's flag (**No flag**) |
| **Scheduling** | **Card state** (New, Learn, Review, Relearn), **Queue** (where it waits now: suspended, buried, or the same as its state), **Due**, **Interval**, **Ease** (only with FSRS off), **Reviews**, **Lapses** |
| **FSRS Memory State** | See below |
| **Technical Information** | **First review**, **Last review**, **Average time** and **Total time** (real answers only), **Card template** (#2 = the note's second card) |
| **Review History** | Every entry, oldest first: **Date**, **Answer**, **Interval**, **Ease**, **Time**, **Type** |

**FSRS Memory State** appears when the card has a saved FSRS state, or when FSRS is on and the card
is not new. Without a saved state the values are calculated from the review history; opening the
screen does not change the card.

- **Stability:** About how many days until your chance of recalling the card drops to 90%.
- **Difficulty:** 0–100%; a high value means the card is hard for you.
- **Retrievability:** Your chance of recalling the card right now.
- **Desired retention:** The recall rate aimed at for this card (0.90 = 90%); shown when the card
  has one saved.

In **Review History**, the **Type** column reads **Learn**, **Review**, **Relearn**, **Filtered** or
**Manual**. **Manual** rows record due-date changes and resets; their **Answer** column shows `0`
and they do not count as answers. For answers given with FSRS, the **Ease** column shows a value
based on the card's difficulty at that moment. The number in the heading counts all of these rows.

If the note is tagged as a **Leech**, a **What is a Leech?** box appears at the top. See
[Key concepts](02-key-concepts.md#leeches-and-siblings) and [FSRS](07-fsrs.md).

## Related topics

- [Adding and editing cards](08-adding-and-editing.md)
- [Note types and card templates](09-note-types.md)
- [Filtered decks and Custom Study](11-filtered-decks.md)
- [Studying](05-studying.md)
- [FSRS](07-fsrs.md)
