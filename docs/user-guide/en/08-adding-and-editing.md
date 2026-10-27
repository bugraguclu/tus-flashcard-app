---
id: editing
title: Adding and editing cards
summary: The Add note screen, fields, formatting, cloze deletions, images, audio, drawings, tags and saving.
order: 8
web_path: /en/help/adding-and-editing
app_help: help?article=editing
app_screens:
  - "Add note / Edit Card — app/editor.tsx"
  - "Formatting toolbar — components/editor/EditorFormattingToolbar.tsx"
  - "••• menu — components/editor/EditorOverflowMenu.tsx"
  - "Preview — components/editor/EditorPreviewModal.tsx"
  - "Add Attachment — components/MediaAttachButton.tsx"
  - "Record Audio — components/AudioRecordModal.tsx"
  - "Edit Photo / Drawing — components/PhotoEditorModal.tsx"
  - "Tags — components/TagPickerModal.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Adding and editing cards

You write your cards on the **Add note** screen. You write a note, and the app makes one or more
cards from it depending on its note type (see [Key concepts](02-key-concepts.md#notes-and-cards)).
The same screen opens as **Edit Card** when you change an existing note.

<a id="open-editor"></a>
## Opening the screen
<!-- In the app: ••• menu › Help row (new, components/editor/EditorOverflowMenu.tsx after :111), the info sheet's "Learn more" link → this section -->

To add a new note:

- On the **Decks** tab, tap the round **＋** button at the bottom right › **Add note**.
- A deck's **•••** button › **Add**: the note goes straight into that deck.
- In the **Card Browser**, tap **＋ New Note** (or **＋ New Card**).
- While studying, tap **⋮** at the top or **Tools** › **Add note**.

To edit an existing note, tap the pencil on its row in the **Card Browser**, or choose **⋮** ›
**Edit note** while studying.

The screen opens full screen; leave it with the back arrow at the top left. If you have unsaved
changes, you are asked **Discard Changes?**. An empty new note never asks.

<a id="note-type-and-deck"></a>
## Note type and deck

Two rows sit at the top of the screen:

- **Type:** The note's type (for example **Basic** or **Cloze**). Tap to change it. **Manage note
  types…** at the bottom of the list takes you to the [Note Types](09-note-types.md#note-types-list)
  screen. The app remembers the type you last used for each deck.
- **Deck:** The deck the cards go to. Tapping it opens the deck tree; you can search, or tap **＋**
  to create a deck and select it at once. Filtered decks and TUS card pack decks are not listed.

Which deck does the screen start with? The deck whose menu you came from; otherwise, depending on
**Settings › General › Editing › Deck for new cards**, either the deck you are studying
(**Current deck**) or the deck named `Varsayılan` (**Default**).

You cannot change the type of an existing note here; see
[Changing the note type](09-note-types.md#change-note-type). If you change the deck while editing,
**only the card you opened** moves; the note's other cards stay in their decks.

<a id="fields"></a>
## Fields

You see one box per field of the note type: **Front** and **Back** for **Basic**. A box grows as you
type; a long field scrolls inside itself after a certain height. To scroll the page, drag over the
field names or the space between fields. The 📌 next to a field name is [pinning](#sticky-fields)
and the 📎 is [attachments](#images).

To save, you must fill in enough fields to make at least one card. Which field makes which card
depends on the type; for example, **Basic (optional reversed card)** only makes the reverse card if
you type something (such as `y`) in **Add Reverse**. Details:
[Built-in note types](09-note-types.md#stock-types).

> **Different from Anki:** Anki refuses a note whose first field is empty. TusAnkiM saves the note
> whenever any template makes a card; for example, a reversed note with only **Back** filled in
> makes just the reverse card.

<a id="formatting"></a>
## Formatting

The toolbar at the bottom has three tabs:

- **Home:** **Undo** and **Redo**, bold, italic, underline, strikethrough, subscript and
  superscript, font and font size, colour, change case, clear formatting and alignment.
- **Styles:** Normal text, three heading levels, quote, code block, lists, indent and line spacing.
- **Insert:** Table, link, callout, horizontal line, MathJax, **HTML source** and your own buttons.
  **＋** creates a button that wraps the selected text in HTML of your choice; ready-made presets and
  **Help** are in that window. Press and hold one of your buttons to edit or delete it.

While the keyboard is up, **Done** appears to the right of the tabs. On a card, only links that start
with `https://` open. **HTML source** opens the source of the field you last tapped; the source is
stored exactly as you write it. A ◈ sign in a field marks something the editor cannot show but keeps
(for example an imported script or SVG).

With a hardware keyboard, using Cmd (or Ctrl): B bold, I italic, U underline, Z undo, Shift+Z redo,
Shift+7 and Shift+8 lists, L/E/R/J alignment, Alt+1…3 headings. Shift+F3 changes case.

> **Different from Anki:** The MathJax button inserts `\( … \)` markers, but TusAnkiM does not render
> formulas yet; the card shows the source text (Anki renders it after export). For an Image Occlusion note,
> choose the Image Occlusion type and draw masks over a picture; colours come from a short palette rather than a colour picker. Scripts (JavaScript), SVG, MathML and form elements in fields and templates are
> neither run nor shown on cards. Shortcuts follow word processors rather than Anki, and there is no
> cloze shortcut.

<a id="cloze"></a>
## Cloze deletions
<!-- In the app: ⓘ next to the Text field name on a cloze type (new, app/editor.tsx:1213-1234), the info sheet's "Learn more" link → this section -->

A cloze card hides part of a sentence and asks you to recall it.

1. Choose **Cloze** in the **Type:** row.
2. Write your sentence in the **Text** field and select the part to hide.
3. Tap **[…]** at the start of the **Home** tab. The selection becomes `{{c1::…}}`.
4. The next tap gives `c2`, then `c3`. Each number makes its own card. Press and hold the button to
   reuse the same number; deletions with the same number are hidden together on one card.

You can also type a deletion yourself: with `{{c1::atropine::anticholinergic}}` the question shows
the hint `[anticholinergic]` in place of the hidden part. The **Back Extra** field holds extra
information shown on the answer side. **[…]** appears only on cloze note types and only while the
toolbar is shown. If you save without any deletion, you are asked **No Cloze Deletion**; if you
confirm, the note is saved with one card.

<a id="images"></a>
## Images, video and files

The 📎 next to a field name opens **Add Attachment**. The attachment goes where the cursor is in that
field.

- **Choose Photo** / **Take Photo:** then choose **Insert as is** (full resolution) or **Crop & edit**
  ([Editing a photo](#photo-editor)).
- **Draw on Blank Canvas:** opens a [drawing page](#drawing-page).
- **Record Audio** and **Attach Audio Clip:** see [Recording audio](#audio-recording).
- **Attach Video Clip:** on iPhone, choose from **Gallery** or **Files**.
- **Attach File:** the file is stored with the note and exported, but it cannot be opened from the
  card.

If the app asks for permission, use **Open Settings** to allow photo library, camera or microphone
access in iPhone Settings. You can paste an image from the clipboard into a field; it is saved as a
JPEG, or as a PNG when **Settings › General › Editing › Paste clipboard images as PNG** is on. Images
copied from a web page together with text are not downloaded and appear blank; save the image and
attach it instead.

<a id="audio-recording"></a>
## Recording audio

1. Tap 📎 › **Record Audio** and press the microphone.
2. Speak; the timer shows the length.
3. Tap the stop button. The recording is added to the field right away.

There is no step to listen or re-record before it is added. If you do not like it, delete the player
from the field and record again. **Cancel** or a tap outside the window closes it without adding
anything. The speed button next to a player in a field is only for listening; it is not saved with
the note. How audio plays while you study: [Studying](05-studying.md#audio-and-tts).

<a id="photo-editor"></a>
## Editing a photo
<!-- In the app: ⓘ next to the Edit Photo / Drawing title (new, components/PhotoEditorModal.tsx:1185-1188), the info sheet's "Learn more" link → this section -->

**Crop & edit** opens a full-screen editor. The line under the title tells you how to use the tool in
hand.

- **Pen**, **Highlighter**, **Arrow**, **Rectangle**, **Ellipse:** draw with your finger.
- **Cover:** draws a solid box over the area you drag across. The box is burned into the image; it
  does not open or close while you study.
- **Text:** tap the page, type, tap **Done**. Drag a label to move it, pull a corner to resize it,
  turn it by the knob, double-tap to edit it. Two fingers resize and turn it too.
- **Eraser:** **Partial** rubs out pen strokes only where you touch, and removes shapes and labels
  whole. **Whole** removes everything you touch in one go.
- **Crop:** drag the corners or pick a ratio, then tap **Crop**. **Rotate** turns the image a quarter
  turn clockwise.

Drop an object you are moving on **Drag here to delete** to delete it. ↶ and ↷ undo and redo; 🗑
clears all edits (this can be undone too). **Done** adds the image to the field. **Cancel** asks
before discarding changes.

<a id="drawing-page"></a>
## Drawing on a blank page

📎 › **Draw on Blank Canvas** opens the drawing page straight away, on the paper your last drawing
used. Draw with a finger; the bar at the bottom has **Pen**, a see-through **Highlighter**, an
**Eraser** that rubs out what it passes over, **Text** and **More**. Below them sit the colours and
three sizes; each tool keeps its own colour and size. ↶ and ↷ above the page undo and redo, and 🗑
clears the page (that can be undone too).

With **Text** chosen, tap the page, type and tap **Add**. Drag a label to move it and tap it to
change it; the colours and sizes below restyle the selected label, and the 🗑 on its corner removes
it. **More** holds **Arrow**, **Rectangle**, **Ellipse**, **Cover** (a solid box that hides an area)
and **Add Picture** from the library. Drag on the page to draw a shape. A picture is moved by
dragging, resized with the three sizes below and removed with the 🗑 on its corner; the eraser leaves
pictures alone.

Tap the page line under the title (for example **Plain · White · Landscape**) to change the
**Paper** (Plain, Grid, Lined, Dotted), **Page colour** (White, Cream, Dark) and **Shape**
(Landscape, Square, Portrait). The drawing stays on the page; a new shape fits it in without
stretching. Your choice is remembered for the next drawing. **Add** puts the drawing in the field as
a PNG; an empty page cannot be added. **Cancel** asks before throwing a drawing away. To crop or
turn a photo, add it with **Choose Photo** and pick **Crop & edit**.

<a id="tags"></a>
## Tags

Tap the **Tags:** row. Tick tags in the list, filter them with the search box, or tap **＋** to type
new ones; separate several tags with spaces. Use `::` for a sub-tag: `pharmacology::antibiotics`
appears as **pharmacology › antibiotics**. The tag `marked` stars (marks) the note. **Confirm**
applies your choice to the note; tags are stored when the note is saved and carry over to the next
note with **Add another**.

<a id="sticky-fields"></a>
## Pinned fields

If you write a run of similar notes (for example a field where you always name the same source), tap
the 📌 next to the field. A pinned field is not cleared after saving, and it comes back with its last
value even after you restart the app; images and audio in it are kept too. Pinning only works when
adding notes and is stored for that field of the note type, so it applies to every new note of that
type. On the editing screen the 📌 is dimmed and disabled.

<a id="duplicates"></a>
## Duplicate note warning

If the first field matches the first field of another note of the same type, **Duplicate first field
found** appears under the field together with that note's deck. The warning does not stop you from
saving. To find the existing note, search for the text in the [Card Browser](10-browser-and-search.md).

<a id="preview"></a>
## Preview

The eye button at the top shows the note as it will look on a card. Switch between **Question** and
**Answer**. The preview shows only the note's first card (not the reverse card or a `c2` deletion)
and has no type-in box.

<a id="save-and-undo"></a>
## Saving and undo

Tap the check mark at the top right. For a new note, the message **Note saved; N cards created.**
offers two choices:

- **Add another:** the screen stays open. Pinned fields, deck, type and tags are kept; the other
  fields are cleared.
- **Done:** the screen closes.

When you edit a note, the change applies to all of its cards and you see **Card updated.**. If a
field you filled in now needs a new card, the card is added; cards whose fields became empty are not
deleted. Remove them with **Decks › ••• › Empty Cards**
(see [Backups and maintenance](15-backups-and-maintenance.md#empty-cards)).

While typing, **Undo** and **Redo** undo changes in the field. A saved note cannot be undone; but
after **Delete note**, **Undo** in the window that follows brings the note and its cards back. That
window is the only chance; once you tap **Done**, it cannot be undone.

<a id="editor-menu"></a>
## The ••• menu

- **Clear fields:** empties every field, pinned ones included. It cannot be undone.
- **Delete note:** shown only while editing; deletes the note and every card made from it. Review
  history is kept.
- **Font size:** only the size of text on this screen; it does not change how cards look. Some
  imported note types use their own field size.
- **Capitalize sentences**, **Show toolbar**, **Scroll toolbar:** preferences saved at once. Hiding
  the toolbar also hides **[…]** and **Undo**. With scrolling off, the toolbar wraps onto several
  rows.

<a id="catalog-notes"></a>
## Notes from the TUS card pack

You cannot move notes of the TUS card pack to another deck, change their type or delete them. If the
pack is not fully installed, only their tags can be changed; the fields are read-only. Details:
[TUS card pack](17-tus-card-pack.md#editing).

## Related topics

- [Note types and card templates](09-note-types.md)
- [Card Browser and search](10-browser-and-search.md)
- [Studying](05-studying.md)
- [Key concepts](02-key-concepts.md)
