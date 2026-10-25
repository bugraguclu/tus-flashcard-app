---
id: studying
title: Studying
summary: Studying cards, answer buttons, counts, undo, the card menu, whiteboard, shortcuts, Timebox and the finished screen.
order: 5
web_path: /en/help/studying
app_help: help?article=studying
app_screens:
  - "Study screen, classic and new layout — app/(tabs)/index.tsx"
  - "Status readouts — components/reviewer/ReviewerStatusItems.tsx"
  - "Card and note options menu (⋮) — components/CardOptionsMenu.tsx"
  - "Flag color menu — components/ReviewerFlagMenu.tsx"
  - "Select Deck picker — components/DeckPickerModal.tsx"
  - "Whiteboard — components/WhiteboardOverlay.tsx"
  - "Card view: typed answers, audio, links — components/CardWebView.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Studying

On the study screen you see your cards one at a time, reveal the answer and say how well you
remembered it. The app uses each answer to work out when the card comes back. To open the screen,
tap a deck's name in the **Decks** list.

<a id="open-study"></a>
## Starting a study session
<!-- In the app: Study screen › ⋮ menu › "About the study screen" (new) info sheet, "Learn more" link → this article -->

- Tap a deck's name in the **Decks** list; study starts in that deck straight away. If you pick a
  parent deck, the cards of its subdecks come too.
- **Study Now** on the deck's **Overview** screen (deck **•••** menu) goes to the same place.
- A shortcut made with **Create shortcut** in the deck menu opens the deck directly.
  See [Shortcuts and automation](18-shortcuts-and-automation.md).

To leave, tap **‹** at the top left or swipe right from the left edge of the screen. Wherever you
started from, both take you back to the **Decks** list.

> **In the web version:** In a window at least 768 pixels wide, a sidebar appears to the left of the
> study screen, where you can switch between subjects, topics and decks. iPhone has no sidebar.

<a id="change-deck"></a>
### Switching to another deck

Tap the deck name (the area with ▾) in the top bar; the **Select Deck** picker opens.

- Tap a deck to keep studying with that deck; the screen stays open and only the cards change.
- **All Decks** studies all your decks together; the title then reads **Cards for Today**.
- Use 🔍 to filter decks and **＋** to create a new one; a new deck is selected at once.

Switching decks resets the card on screen, the undo history and any whiteboard drawing.

<a id="screen-layouts"></a>
## Classic and new study screen

From top to bottom the screen shows the top bar (**‹**, deck name, status readouts, **↶** undo,
**⚑** flag, **⚙** deck settings, **⋮** card menu), the card's subject and topic, the card itself,
and at the bottom **Show Answer** and the answer buttons.

There are two layouts. **Classic** is the default; turn on the new one with
**Settings › New study screen › Use new study screen**. Cards, buttons and menus are the same in
both. The differences:

| Feature | Classic (default) | New |
| --- | --- | --- |
| Top bar | Always at the top, with a large deck name | Top or bottom, set by **Toolbar position** |
| Remaining counts | Centred below the buttons: `new + learning + review` | In the top bar, under the deck name |
| Daily streak (🔥) | Next to the deck name | In the subject line above the card |
| When you press **Again** | A short vibration | A vibration and a red **×** at the bottom left |

The other options under **Settings › New study screen** (frame style, counts, deck title, remaining
time, hiding the toolbar, answer buttons, auto advance) apply to both layouts. With **Show toolbar**
off, the **‹**, **↶**, **⚑**, **⚙** and **⋮** buttons are hidden too; you then reach the menus with
the floating Tools button or a swipe. See [Settings](16-settings.md).

<a id="show-answer"></a>
## Seeing the question and revealing the answer

1. Read the question and try to recall the answer.
2. Tap **Show Answer**. Tapping the card or pressing the space bar also reveals it.
3. If the card is taller than the screen, the view scrolls to where the answer starts.
4. Say how well you remembered it with an answer button.

- Taps that arrive just after the answer appears (200 ms by default) are ignored, so a double tap
  does not grade the card by accident. The time is set in
  **Settings › Accessibility › Double tap time interval**.
- If **Show answer long-press time** is above 0, the button works with a press and hold instead of a tap.
- Tapping a link inside a card first asks **Open external link?**. Hint fields open when you tap them.

> **In the web version:** The view does not scroll to the answer by itself.

<a id="answer-buttons"></a>
## Answer buttons

When the answer is showing, four buttons appear: **Again**, **Hard**, **Good**, **Easy**. For when
to press which, see [Key concepts](02-key-concepts.md#answer-buttons).

- Above each button you see when the card will come back with that choice: `1m`, `10m`, `1d`,
  `1.5mo`. A time with a leading `<` (`<10m`) means the card may come back before that time is up
  (see [While learning cards are waiting](#learn-ahead)).
- **Show next review time above answer buttons** off hides the times. **Hide Hard and Easy buttons**
  leaves only **Again** and **Good**; scheduling does not change.
- To make the buttons bigger, use **Settings › Accessibility › Answer button size** (100–175%) and
  **Show large answer buttons in two rows**.
- With **Show answer buttons** off you answer with tap zones or swipes; it can only be turned off
  while one of them is on.

In a filtered deck set up as a preview, the card shows **PREVIEW** and your answers do not change
its scheduling. The buttons show how soon the card returns, and the button marked **(end)** takes
it out of the preview. See [Filtered decks and Custom Study](11-filtered-decks.md).

<a id="counts"></a>
## Counts, time and streak

The three coloured numbers show what is left in this session: from left to right **new**,
**learning** and **review**. The underlined number is the group the card on screen came from.

- **New:** every card in the chosen deck that you have not seen yet.
- **Learning:** cards in a learning or relearning step today.
- **Review:** cards that are due and fit within the deck's daily review limit.

> **Different from Anki:** There is no daily limit for new cards, so the new count can be large.
> See [Deck options](06-deck-options.md#new-cards).

These readouts can appear next to the counts:

- A time such as **0:07**: time spent on this card, when **Show on-screen timer** is on for the deck.
  See [Deck options](06-deck-options.md#timers).
- **~12 min:** with **Show remaining time** on, an estimate of the time left at your recent pace.
  Hidden until there are enough answers to estimate from.
- **Time is up:** the auto advance reminder (see [Auto advance](#auto-advance)).
- **🔥 and a number:** how many days in a row you have studied. Faded means you have not studied
  yet today. Study logged in the Stopwatch also counts the day towards the streak.

<a id="undo-redo"></a>
## Undo and redo

If you pressed the wrong button, tap **↶** in the top bar. The card comes back on its question
side; your answer is removed from the review history and the counts return to what they were.

- Undo also steps back, in order, through bury, suspend, mark, flag, tag edits, **Set due date** and
  **Reset card** done while studying. The ⋮ menu says what will be undone, for example
  **Undo: Bury card**.
- **Redo** in the ⋮ menu reapplies what you undid. Doing anything new clears redo.
- You can go back up to 30 steps. The history is cleared when you switch decks, when a new study day
  starts and when you leave study for **Decks**.
- If the card was rescheduled somewhere else in the meantime (for example in the **Card Browser**),
  **Cannot undo** appears and the history is cleared.
- Deleting a note has its own undo (see [Editing while you study](#edit-during-review)).

> **Different from Anki:** The undo history belongs to the study screen only; it does not cover
> the whole collection.

<a id="card-actions"></a>
## The card menu (⋮)

**⋮** in the top bar opens a menu from the right. Tap outside it to close it.

| Item | What it does |
| --- | --- |
| **Undo: …** / **Redo: …** | Takes back or reapplies the last action. |
| **Enable whiteboard** | Lets you draw over the card ([Whiteboard](#whiteboard)). |
| **Edit note**, **Add note**, **Edit tags** | [Editing while you study](#edit-during-review) |
| **Bury card**, **Suspend card** | If the note has other cards, **Bury ›** and **Suspend ›** open a submenu ([Burying and suspending](#bury-and-suspend)). |
| **Delete note** | Deletes the note with all its cards. |
| **Mark note** | Stars the note ([Flags and marks](#flags-and-marks)). |
| **Reschedule ›** | **Set due date…** and **Reset card…** |
| **Replay audio**, **Enable text to speech** | [Audio and text to speech](#audio-and-tts) |
| **Deck options** | Opens the options of the deck the card on screen belongs to; when you study a parent deck this can be a subdeck. |
| **Card info** | Shows the card's scheduling and history ([Card info](10-browser-and-search.md#card-info)). |

With **Settings › Controls › On-screen control › Show the floating Tools button** on, the same menu
also opens from the ⚙ button next to **Show Answer**.

<a id="flags-and-marks"></a>
## Flags and marks

- **Flag:** **⚑** in the top bar opens the **Flag color** menu: **Red flag**, **Orange flag**,
  **Green flag**, **Blue flag**, **Pink flag**, **Turquoise flag**, **Purple flag** or **No flag**.
  A flag goes on this card only; the button and the top corner of the card take its colour.
- **Mark:** ⋮ › **Mark note** stars the note (the `marked` tag); ★ appears in the card's corner.
  **Unmark note** removes it.
- You can find flagged or marked cards in the **Card Browser**.
  See [Card Browser and search](10-browser-and-search.md).

> **In the web version:** `Ctrl+1` … `Ctrl+7` (`Cmd` on a Mac) sets or clears that flag.

<a id="bury-and-suspend"></a>
## Burying and suspending

- **Bury card** puts the card aside for today; it comes back by itself when the next study day
  starts (4:00 by default). **Bury note** buries every card of the note.
- **Suspend card** takes the card out of study until you bring it back. **Suspend note** applies to
  every card of the note.
- To get buried cards back without waiting, use **Unbury … now** on the finished screen
  ([The finished screen](#finished)).
- To bring a suspended card back, find it in the **Card Browser** with `is:suspended` and tap
  **Unsuspend**.
- Neither asks for confirmation; both can be undone with **↶**.

Depending on your deck options, answering a card can also bury the other cards of the same note
until the next day. See [Deck options](06-deck-options.md#burying).

<a id="leeches"></a>
## Leeches

When you forget a card as many times as the deck's **Leech threshold (lapses)** (8 by default), its
note gets the `leech` tag. If **Leech action** is **Tag and Suspend**, the card is also suspended
and leaves study. If you keep forgetting it, this repeats every half threshold (for 8: at the 12th
and 16th lapse).

Find these cards in the **Card Browser** with `tag:leech`. The card's **Card info** screen shows
**What is a Leech?** with suggestions. Shortening the card or splitting it into one fact per card
usually helps. For the setting, see [Deck options](06-deck-options.md#lapses).

> **Different from Anki:** The study screen shows no notice when a card becomes a leech.

<a id="edit-during-review"></a>
## Editing while you study

- **Edit note:** Opens the note in the full-screen editor (**Edit Card**). When you save and come
  back, the card shows your correction; the change applies to every card of the note.
  See [Adding and editing cards](08-adding-and-editing.md).
- **Add note:** Adds a note without leaving study. The deck you are studying is preselected; in a
  filtered deck, the card's own deck is.
- **Edit tags:** Type the tags separated by spaces and tap **Save**. Tags apply to every card of the
  note; a revealed answer stays revealed.
- **Set due date…:** Type how many days until the card comes back: `0` today, `1` tomorrow, `3-7` a
  random day in that range. Add `!` (`3-7!`) to also set the card's interval to that value.
  Negative numbers and spaces are not accepted; with an invalid value **Save** stays dimmed.
- **Reset card…:** Makes the card **New** again; its review history is kept. Choose
  **Restore original position where possible** (on by default) and
  **Reset repetition and lapse counts** (off by default), then tap **Reset**. Your last choice is
  remembered.
- **Delete note:** Asks for confirmation. In the **Note Deleted** dialog that follows, **Undo** brings
  the note back; once you tap **Done**, the deletion is final. Notes from the TUS card pack do not
  have this item.

<a id="audio-and-tts"></a>
## Audio and text to speech

- A card's audio plays by itself when that side appears. For this, both
  **Settings › Reviewing › Advanced › Automatically play audio** and **Automatically play audio** in
  the deck's **Audio** options must be on (both are on by default). When the answer opens, only the
  answer side's audio plays.
- **Replay audio** (⋮ menu or `R`): on the question side it plays the question's audio. On the answer
  side it plays the question, then the answer; with **Skip question when replaying answer** on for
  the deck, only the answer. See [Deck options](06-deck-options.md#audio).
- Each audio player on a card has a speed button (`1x`); each tap moves through 0.75x, 1x, 1.25x,
  1.5x and 2x. The starting speed comes from the deck's **Audio playback speed**.
- **Interrupt audio when answering** (on by default) stops audio when you reveal the answer or move
  to the next card. Audio also stops when you leave the study screen or the app goes to the background.
- **Enable text to speech:** Reads the card's visible text aloud; once the answer opens it reads only
  the answer part. The choice is remembered on this device. Reading uses a voice in the app's
  language. For a card in another language, put a speech tag such as `{{tts en_US:Front}}` in the
  template; these tags also play automatically when **Enable text to speech** is off.

When a side has both audio files and text to speech, they play one after the other, not on top of
each other.

<a id="typed-answer"></a>
## Typing the answer

If the card's template has a typed-answer field (`{{type:Field}}`), a **Type your answer…** box
appears on the question side. The box and **Show Answer** sit just above the keyboard.

1. Type your answer.
2. Press **Done** on the keyboard or tap **Show Answer**.
3. On the answer side, what you typed is compared with the correct answer:
   - All green: you typed it correctly.
   - Your line on top, `↓`, the correct answer below: green matches, red is wrong or extra, grey is
     missing. Missing parts are shown as `-` in your line.
   - Only the correct answer: you typed nothing.
4. You still grade the card yourself: look at the comparison and press the right answer button.

Upper and lower case and accented letters count. If the template uses `{{type:nc:Field}}`, accents
are ignored. The options are under **Settings › General › Editing**: **Focus type-in-answer** opens
the keyboard by itself, **Type answer into the card** places the box inside the card, and
**Never type answers** hides the box altogether.

<a id="whiteboard"></a>
## Whiteboard

To sketch or take notes over a card, tap ⋮ › **Enable whiteboard**. A toolbar opens above the card:
✎ **Pen**, ▱ **Eraser** (removes each stroke it touches in full), **Color palette** (six colours),
**Change stroke width** (thin, medium, thick), **Undo** and **Redo** for the last drawing step,
× **Clear whiteboard** (asks first; **Undo** brings it back) and ✓ **Finish drawing**.

- ✓ closes drawing mode; the drawing stays on the card and the card can be tapped and scrolled again.
- A drawing belongs to its card. It is erased when you answer the card. If the card comes back
  unanswered (for example after the waiting screen), the drawing comes back too.
- While drawing mode is on, tap zones, swipes and auto advance do not work.
- In drawing mode the ⋮ menu adds **Undo stroke**, **Save whiteboard**, **Enable stylus** and
  **Disable whiteboard**. **Save whiteboard** saves the drawing as a PNG image in the app's media
  folder; the image is not added to the note. **Disable whiteboard** erases the drawing on this card.
- Whether the whiteboard is on, and the pen colour (separately for the light and dark theme), are
  remembered for each deck on this device.

<a id="tap-zones-and-swipes"></a>
## Tap zones and swipes

**Tap zones** are on by default; the card is divided into nine zones (3×3):

- On the question side, tapping anywhere on the card reveals the answer.
- On the answer side, the left column answers **Again** and the right column **Good**; the centre
  column does nothing.
- Links, audio players, text boxes and selected text keep their own taps.

**Swipe gestures** are off by default. Once on, swiping left opens the ⋮ menu and swiping right
returns to **Decks**; up and down do nothing. Horizontal swipes work anywhere on the card. Up and
down swipes only count when they start at the left or right edge of the screen, so you can still
scroll a long card.

An answering gesture on the question side first reveals the answer; the same gesture on the answer
side grades it. That way an answer you have not seen is never graded by accident.

You change the zones, directions and sensitivity under **Settings › Controls › Taps and swipes**; the
**?** button in that heading opens a detailed help page. See [Settings](16-settings.md).

<a id="keyboard-shortcuts"></a>
## Keyboard shortcuts

With a keyboard connected to your iPhone, and in the web version, these keys work:

| Key | Action |
| --- | --- |
| Space or Enter | Show the answer; with the answer showing, **Good** |
| `1` `2` `3` `4` | **Again**, **Hard**, **Good**, **Easy** (with the answer showing; also while Hard and Easy are hidden) |
| `R` | Replay audio |
| `-` | Bury card |
| `@` | Suspend card |
| `*` | Mark / unmark note |
| `Z` or `U` | Undo |
| Esc | Back to Decks |

You can change the first nine keys under **Settings › Controls › Keyboard**. `Z` and `U` cannot be
changed; if you assign one of them to another action, that key stops undoing. Shortcuts do not work
while a menu is open or while you type in a text box; a key held down counts once.

> **In the web version:** `Ctrl+Z` (`Cmd+Z` on a Mac) also undoes, and `Ctrl+1` … `Ctrl+7` sets a flag.

> **Different from Anki:** Anki's `E` (edit note), `=` (bury note), `!` (suspend note) and `O`
> (options) keys are not bound; use the ⋮ menu instead. There is no key for redo.

<a id="timebox"></a>
## Timebox

Set a time under **Settings › Reviewing › Scheduling › Timebox time limit** (for example 20 mins;
0 means off, the default). When the time is up, the next answer you give opens the **Timebox**
dialog, which tells you how many cards you studied in that time:

- **Continue** starts a new block.
- **Finish** takes you to the **Decks** list.

The time runs on the clock, even while the app is in the background. Switching decks or changing
the limit starts the block again.

<a id="auto-advance"></a>
## Auto advance

Auto advance reveals the answer by itself after a set time and then carries out the action you
chose. It needs two things together:

1. **Settings › New study screen › Answer buttons › Auto advance** must be on (off by default; it
   applies to both layouts).
2. In the card's deck, **Question display time** or **Answer display time** in the **Auto Advance**
   options must be above 0 (0, that is off, by default).

When the answer time runs out, the default action is **Bury card**; you can choose to answer
**Again**, **Hard** or **Good**, or to show only the **Time is up** reminder. Automatic answers are
normal answers and can be undone. The timer pauses while a menu or dialog is open, while another
screen is in front, while the app is in the background and while the whiteboard is on.
See [Deck options](06-deck-options.md#auto-advance).

<a id="learn-ahead"></a>
## While learning cards are waiting
<!-- In the app: Study screen › waiting state › ⓘ next to the "That’s All for Now!" title (new, app/(tabs)/index.tsx:3167) → info sheet; "Learn more" → this section -->

When the ready cards are done but some cards are still in a learning step, the
**That’s All for Now!** screen appears with a large countdown. When it reaches zero, the next card
comes up by itself.

- **Learn ahead limit** (**Settings › Reviewing › Scheduling**, 20 mins by default): when nothing
  else is left, learning cards due within this time are shown without waiting. The countdown runs
  until the next card enters that window.
- **⚡ Study Now:** brings in every learning card in this deck whose step has not finished yet. Each
  card comes once; after you answer it, it returns on its own schedule.
- **Learn-ahead settings** opens Settings; the limit is in the **Reviewing** section.

Filtered decks do not learn ahead; their learning cards come when they are due.

<a id="finished"></a>
## The finished screen (Congratulations)
<!-- In the app: Study screen › finished state › ⓘ next to the "Congratulations!" title (new, app/(tabs)/index.tsx:3260) → info sheet; "Learn more" → this section -->

When there are no more cards to show today, the **Congratulations!** screen opens. Since there is
no limit on new cards, it appears once the deck's new cards are done as well.

- If cards are due tomorrow, the large counter shows the time left until the next study day
  (4:00 by default).
- **Today's review limit was reached** means review cards are still waiting;
  **Increase Review Limit** opens that field in the deck options
  ([Deck options](06-deck-options.md#daily-limits)).
- **🎯 Custom Study** sets up an extra session and starts it on the same screen
  ([Custom Study](11-filtered-decks.md#custom-study)).
- **💤 Unbury … now** brings back the cards buried today straight away.
- When a filtered deck is finished, **🔄 Rebuild** gathers it again with its saved rules. An emptied
  filtered deck shows **This Filtered Deck Is Empty**.
- A deck with no cards at all shows **This Deck is Empty** and **Add Card**.

The **Today N cards were reviewed** line at the bottom counts the answers you gave today across all
decks; several answers to the same card count separately.

## Related topics

- [Key concepts](02-key-concepts.md)
- [Decks](04-decks.md)
- [Deck options](06-deck-options.md)
- [Filtered decks and Custom Study](11-filtered-decks.md)
- [Settings](16-settings.md)
