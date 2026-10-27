---
id: note-types
title: Note types and card templates
summary: Built-in note types, fields, card templates, template syntax, styling and changing a note's type.
order: 9
web_path: /en/help/note-types
app_help: help?article=note-types
app_screens:
  - "Note Types — app/note-types.tsx"
  - "Edit Note Type — app/note-type.tsx"
  - "Note type picker — components/NoteTypePickerModal.tsx"
  - "Change Note Type (Card Browser) — components/browser/BrowserDialogs.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Note types and card templates

A **note type** decides which fields a note has and which cards are made from those fields, and how
they look (see [Key concepts](02-key-concepts.md#note-types)). You manage note types on the
**Note Types** screen.

<a id="note-types-list"></a>
## The Note Types screen
<!-- In the app: ⓘ to the right of the Note Types title (new, app/_layout.tsx:765-776 headerRight), the info sheet's "Learn more" link → this section -->

To open it, tap the **Type:** row on the Add note screen and choose **Manage note types…**. To go
straight to the editor of the selected type, tap the **Cards:** row on the same screen.

Each row shows the type's name, its number of fields and templates, and its kind (standard or cloze).
Tap a row to open **Edit Note Type**. **+ New Note Type** creates a copy of **Basic** named
**New Note Type** and opens it for editing. On iPhone, swipe the screen down to close it.

<a id="stock-types"></a>
## Built-in note types

| Type | Fields | Cards it makes |
| --- | --- | --- |
| **Basic** | Front, Back | 1 card: front → back |
| **Basic (and reversed card)** | Front, Back | 2 cards: front → back and back → front |
| **Basic (optional reversed card)** | Front, Back, Add Reverse | Front → back; the reverse card too when **Add Reverse** is filled in |
| **Basic (type in the answer)** | Front, Back | 1 card; while studying you answer by typing **Back** |
| **Cloze** | Text, Back Extra | 1 card per cloze number (`c1`, `c2`…) |

In the Turkish interface field names appear translated. Templates always use the real field names:
`Front`, `Back`, `Text`, `Back Extra`, `Add Reverse`. The note type editor shows these real names.

<a id="fields"></a>
## Fields

The **FIELDS** section lists each field's name, ↑ ↓ to reorder it and ✕ to delete it.

- **Renaming:** type the name and leave the box or press Return. Every reference in the templates
  moves to the new name. The change is stored with **Save**.
- **Adding, moving, deleting:** **+ Add Field**, ↑ ↓ and ✕ apply **at once**: every note of this type
  is updated immediately. **Close** does not reverse it and there is no undo. Deleting a field also
  deletes its content in every note; you are asked to confirm first.
- **Rules:** a name cannot start with `#`, `^` or `/`, and cannot contain `:`, `{`, `}` or `"`. Two
  fields cannot share a name (ignoring upper and lower case). Every type keeps at least one field.
- **Cloze types:** fields cannot be added, moved or deleted; their names can be changed.

To keep a field's last value for every new note, use the 📌 on the Add note screen (see
[Pinned fields](08-adding-and-editing.md#sticky-fields)).

<a id="card-types"></a>
## Card types

Each **card type** (template) of a note type makes its own card from a note. When there is more than
one template, buttons such as `1: Card 1` and `2: Card 2` appear under **CARD TYPES**; pick the one
to edit. A template makes a card when its front shows at least one filled-in field. Cloze types have
a single template; the cloze numbers in the text decide how many cards there are.

<a id="templates"></a>
## Front and back templates
<!-- In the app: ⓘ to the right of the Edit Note Type title (new, app/_layout.tsx:777-785 headerRight), the info sheet's "Learn more" link → this section -->

**FRONT TEMPLATE** defines the question side of the card and **BACK TEMPLATE** the answer side. Both
are HTML with placeholders in curly braces. **PREVIEW** shows your change at once with sample text.
The templates of **Basic** are:

```
Front: {{Front}}
Back:  {{FrontSide}}
       <hr id=answer>
       {{Back}}
```

`{{FrontSide}}` repeats the question side above the answer. `<hr id=answer>` is the line between the
two sides; when the answer opens, the page scrolls to it. Template changes affect **every note** of
this type and are stored with **Save**.

<a id="field-replacements"></a>
## Field replacements
<!-- In the app: "Template syntax" link under the FRONT TEMPLATE label (new, app/note-type.tsx:250) → this section -->

`{{Field name}}` inserts the field's content. The app also fills in a few special fields itself:

| Write | Shows |
| --- | --- |
| `{{Tags}}` | The note's tags |
| `{{Deck}}`, `{{Subdeck}}` | The deck's full name, the lowest deck's name |
| `{{Type}}`, `{{Card}}` | The note type's name, the card type's name |
| `{{CardFlag}}` | The card's flag (`flag0`…`flag7`); useful for styling |
| `{{CardID}}` | The card's number |

You can put a filter in front of a field:

- `{{text:Front}}` drops HTML formatting and shows plain text.
- `{{hint:Back}}` hides the field behind a link that opens when tapped.
- `{{furigana:Front}}`, `{{kana:Front}}`, `{{kanji:Front}}` handle `word[reading]` notation.
- `{{nc:Front}}` removes accent marks.

An unknown filter (for example one that belongs to an Anki add-on) is ignored and the field is shown
as it is.

<a id="conditionals"></a>
## Conditional sections

- The part between `{{#Field}} … {{/Field}}` is shown only when the field is filled in.
- `{{^Field}} … {{/Field}}` is shown only when the field is empty.

A field holding only spaces and line breaks counts as empty. The second template of **Basic
(optional reversed card)** works this way: `{{#Add Reverse}}{{Back}}{{/Add Reverse}}`. With **Add
Reverse** empty, no filled field is left on the front, so no reverse card is made. On cloze types,
`{{#c1}} … {{/c1}}` is shown only on the card for cloze number 1.

<a id="cloze-templates"></a>
## Cloze templates

The Cloze type's templates are `{{cloze:Text}}` (front) and `{{cloze:Text}}<br>{{Back Extra}}`
(back). The `cloze:` filter hides the deletion with that card's number as `[...]` (or its hint) on
the question side and reveals it on the answer side. `{{cloze-only:Text}}` shows only the hidden
parts. A type can use `cloze:` on more than one field; cards are made from the numbers in all of
them. Change the look of the hidden part with the `.cloze` class in the styling.

<a id="typed-answer"></a>
## Typing the answer

Add `{{type:Back}}` to the front and a text box appears while you study; the same `{{type:Back}}` on
the back shows what you typed compared with the correct answer. **Basic (type in the answer)** is an
example. Other forms:

- `{{type:cloze:Text}}` asks you to type the hidden part of a cloze card.
- `{{type:nc:Back}}` ignores accent marks in the comparison.

A card has one text box. How it looks while studying and the related settings:
[Studying](05-studying.md#typed-answer).

<a id="tts"></a>
## Text to speech (TTS)

`{{tts en_US:Front}}` reads the field aloud without printing it on the card. Write the language code
like `tr_TR` or `en_US`; `{{tts en_US speed=1.2:Back}}` sets the speed and `voices=` lists the voices
you prefer, in order. To read several fields and fixed text together, write
`[anki:tts lang=en_US]{{Front}} — {{Back}}[/anki:tts]`. Speech uses the voices installed on your
iPhone. How it works while studying: [Studying](05-studying.md#audio-and-tts).

<a id="styling"></a>
## Styling (CSS)

The **STYLING (CSS)** box applies to every card of this type. Useful classes:

- `.card`: the whole card; put the font, size, colour and background here.
- `.card1`, `.card2`: only that card type.
- `.nightMode`: while the app uses the dark theme. Example: `.nightMode .cloze { color: lightblue; }`
- `.iphone`: while the card is shown on an iPhone.

You can also write a `<style>` block inside a template. For security, files loaded from the internet
(`@import`, remote `url(...)`) are removed; files such as background images must come from the
collection's media.

<a id="validation"></a>
## Checks when saving

If something is wrong, **Save** does not save the type and shows **Cannot Save Note Type** with one
line per problem. For example:

- **More than one field is named “Back”.**
- A template uses a field the type does not have.
- `{{#Field}}` or `{{^Field}}` opened but never closed with `{{/Field}}`, or a `{{/Field}}` without an
  opening.
- A front that uses no field (that template can never make a card).
- A cloze type whose front has no `{{cloze:...}}`.

Fix the mistake and tap **Save** again. If you leave without saving, you are asked **Discard
Changes?**.

<a id="change-note-type"></a>
## Changing a note's type

You do not change an existing note's type on the Add note screen. You do it in the **Card Browser**
(for selecting, see [Card Browser and search](10-browser-and-search.md)):

1. Press and hold a row to start selecting, and select the notes to change.
2. Tap **More** at the bottom, then **Change note type**.
3. Choose the new type.

Fields are matched first by name, then by position; templates the same way. Cards with a match in the
new type keep their study history and scheduling. If some cards have no match, **Remove Cards?** tells
you how many will be removed; their review history is kept. Converting into a cloze type keeps every
card. The window shown when it finishes offers **Undo** once. Notes from the TUS card pack cannot
change type.

<a id="not-supported"></a>
## Not available in this version

- Adding, deleting or renaming card types (templates).
- Deleting a note type or copying a type of your choice; a new type always starts from **Basic**, so a
  new cloze type cannot be created.
- Changing the sort field or field options (font, size, right-to-left, description). The font, size
  and right-to-left settings of imported types are used on the Add note screen.
- A different deck set on a template (deck override): new cards go to the deck you choose.

> **Different from Anki:** Scripts (JavaScript) in templates are not run, for security; such cards may
> look plain. MathJax formulas are not rendered; the source text is shown. Image Occlusion notes
> cannot be created. Filters that belong to add-ons are ignored.

## Related topics

- [Adding and editing cards](08-adding-and-editing.md)
- [Card Browser and search](10-browser-and-search.md)
- [Studying](05-studying.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
