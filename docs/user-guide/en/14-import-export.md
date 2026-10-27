---
id: import-export
title: Import and export
summary: Importing Anki packages and CSV/TSV/TXT files, exporting decks and the whole collection, and moving your collection to a new device.
order: 14
web_path: /en/help/import-export
app_help: help?article=import-export
app_screens:
  - "Import deck — app/import.tsx"
  - "Import Log — components/ImportLogView.tsx"
  - "Export — app/export.tsx, components/DeckExportSelector.tsx"
  - "File hand-off (Share › TusAnkiM) — app/_layout.tsx; web: components/WebAppIntegrations.tsx"
  - "Settings › Data Management › Import and export — app/settings.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Import and export

This article explains how to bring cards made elsewhere into TusAnkiM (import) and how to save
your own decks to a file (export). TusAnkiM works with Anki's `.apkg` and `.colpkg` packages and
with CSV/TSV/TXT text files. There is no automatic syncing between devices, so you also use these
files when you move from one device to another.

<a id="import"></a>
## Importing
<!-- In the app: ⓘ in the Import deck screen header (new, app/import.tsx:643-647) → help.import.sheet → "Learn more" → this section -->

The **Import deck** screen imports every supported file type. To open it:

- On the **Decks** screen, tap **•••** at the top right › **Import deck**
- **Settings › Data Management › Import decks and data**
- Or send the file to TusAnkiM from another app (see [below](#open-from-files)).

1. Tap **Choose File** and pick the file.
2. The app recognises the file type from its extension and shows the options for that type. To
   pick a different file, tap **Change**.
3. Review the options and tap the **Import deck** button at the bottom.
4. When the import finishes, the **Import Log** opens. **Done** takes you back to the previous screen.

| File | What happens |
| --- | --- |
| `.apkg` | Deck package: decks, note types, media and, optionally, study history are **added** to your collection. Packages renamed to `.zip` open the same way. |
| `.colpkg` | Collection package: **replaces** your whole collection. |
| `.csv`, `.tsv`, `.txt` | Text file: every line becomes a note. |

Any other file shows the **Unknown file format** alert. Large packages can take a while; keep the
app open while the indicator in the button is spinning. A safety backup is made automatically
before every package import
(see [Backups and maintenance](15-backups-and-maintenance.md#backup-safety)).

<a id="open-from-files"></a>
## Opening a file from Files, Mail or AirDrop
<!-- In the app: file hand-off app/_layout.tsx:596-620; iOS document types app.json:25-75; web drag and drop components/WebAppIntegrations.tsx:58-116 -->

On iPhone you can send an `.apkg`, `.colpkg`, `.csv`, `.tsv` or `.txt` file straight to
TusAnkiM: in the **Files** app, touch and hold the file (the same works for a Mail attachment or a
file received with AirDrop), tap **Share** and choose **TusAnkiM** from the list. The **Import
deck** screen opens with the file already chosen. Open a package with a `.zip` extension from
inside the app with **Choose File**.

> **In the web version:** Drag the file onto the browser window; **Drop to import** appears. If you
> installed the app on your computer, you can also open supported files with your file manager's
> **Open with** menu.

<a id="import-apkg"></a>
## Deck packages (.apkg)
<!-- In the app: Import deck › IMPORT OPTIONS (.apkg) app/import.tsx:878-915 -->

Shared decks, and decks exported from Anki or from TusAnkiM, come in this format. The package is
added to your collection; none of your own cards are deleted. The options:

- **Import any learning progress** (on): cards arrive with the package's due dates, intervals and
  review history. When off, cards arrive as new cards and are placed after your existing new cards;
  flags, the `marked` and `leech` tags and the package's review history are left out. Turn it off
  if you want to study a deck someone shared with you from scratch.
- **Import any deck presets** (on): brings the package's [presets](02-key-concepts.md#presets).
  If you already have a preset with the same settings, that one is used. When off, new decks use
  the default preset; the presets of decks you already have do not change.
- **UPDATES › Update notes** and **Update note types**: choose what happens when a note or note type
  in the package is already in your collection. **If newer** (the default): it is updated only if
  the package's version was changed after yours. **Always**: the package's version is always
  written. **Never**: your version stays as it is.

| Item in the package | What happens |
| --- | --- |
| A note you don't have | Added with its cards, in the package's deck structure. Missing parent decks are created. |
| A note you also have | Its fields and tags are updated according to **Update notes**. The study state of your existing cards never changes, whatever you choose; cards that are new in the package are added. |
| A note you also have, but whose note type changed | Not updated; it appears in the log under **Note type changed**. |
| A deck with the same name as one of yours | The cards are added to your deck (upper/lower case does not matter). |
| A note type with the same name but a different structure | The package's type arrives as a separate copy, with `(Imported)` added to its name. |
| A media file | Copied. If you have a file with the same name but different content, the package's file is added under a new name and the notes are linked to it. |

> **Different from Anki:** There is no option to merge note types. A note type whose fields or card
> templates changed is not merged with yours; it is added as a separate copy, and your notes stay
> unchanged.

<a id="import-colpkg"></a>
## Collection packages (.colpkg)
<!-- In the app: Import deck › .colpkg warning app/import.tsx:916-923; Replace Collection? confirmation app/import.tsx:449-458 -->

A collection package replaces your whole [collection](02-key-concepts.md#collection): decks,
notes, cards, note types, presets and review history become what is in the package. As in Anki, the
collection also brings its own **Next day starts at**, learn ahead limit, timebox, FSRS switch and
daily-limit rules. The media files on this device, your other app settings, your Stopwatch records
and your backups stay as they are.

1. Choose the file. Instead of options you see a warning.
2. Tap **Import deck** and confirm **Replace Collection?** with **OK**.
3. A safety backup is made before anything changes. If you change your mind, restore that backup
   from the **Backups** screen (see [Restoring a backup](15-backups-and-maintenance.md#restore)).

If your collection contains unreadable rows, the import stops before it starts and the
**Repair First** alert appears. Run **Repair and optimize** and try again
(see [Repair and optimize](15-backups-and-maintenance.md#repair)).

<a id="import-text"></a>
## Text files (CSV, TSV, TXT)
<!-- In the app: Import deck › text file options app/import.tsx:708-876 -->

In a text file every line is a note and every column is a field. You can prepare the file in
Excel, Numbers or Google Sheets:

- Save the file as **UTF-8** so that accented and Turkish characters come out right (in Excel,
  the **CSV UTF-8** format).
- Column titles in the first line, such as "Question, Answer", are imported as a note too. Delete
  that line or put `#` at its start; lines starting with `#` are not notes.
- In `.tsv` files columns are separated by tabs. For `.csv` and `.txt` files the app guesses the
  separator.

You can preset the options by putting lines that start with `#` at the top of the file:

| Line | What it does |
| --- | --- |
| `#separator:tab` | Sets the separator: `tab`, `comma`, `semicolon`, `pipe`, `colon`, `space`, or the character itself. |
| `#html:true` | Fields are read as HTML (bold text, images and so on). |
| `#deck:Pharmacology` | If you have a deck with this name, it is preselected in the **Deck** row. |
| `#notetype:Basic` | If you have a note type with this name, it is preselected. |
| `#tags:mock-exam-1` | Adds a tag to every note. |
| `#tags column:3` | Reads tags from column 3. |
| `#deck column:4`, `#notetype column:5` | Reads each line's deck or note type from that column. Missing decks are created. |
| `#guid column:1` | Reads each note's unique identifier from that column; importing again updates the same note. |
| `#columns:…` | Names the columns; a column whose name matches a field's name is mapped to that field. |
| `#if matches:keep current`, `#match scope:notetype + deck` | Preset the **Existing notes** and **Match scope** choices. |

An example file (the columns are separated by tabs):

```
#separator:tab
#html:false
#tags column:3
Mechanism of action of atropine?	Muscarinic receptor antagonist	pharmacology
```

<a id="import-options"></a>
## Text import options
<!-- In the app: IMPORT OPTIONS app/import.tsx:710-778; FIELD MAPPING 780-839; PREVIEW 841-874 -->

- **Fields separated by:** the app guesses the separator and shows **(guessed)** in the row. If
  the preview splits the columns wrongly, pick the right one here: **Comma**, **Semicolon**,
  **Tab** and so on. If your text contains colons (`:`) or semicolons, the guess can be wrong.
- **Allow HTML in fields:** when off, text appears exactly as written and line breaks are kept.
  When on, tags such as `<b>` are read as formatting. It turns on by itself when the file contains
  HTML.
- **Note type** and **Deck:** which note type the notes use and which deck they go into. You can
  also create a new deck from the deck list. If the file gives these in a column, the row shows
  **From file (column N)**.
- **Existing notes:** when you already have a note of the same note type with the same first field
  (or with the same identifier, if the file has an identifier column): **Update** (the default)
  writes the file's content; fields that are not mapped, and your tags when there is no tags
  column, are kept. **Preserve** skips the line. **Duplicate** adds a new note anyway.
- **Match scope:** **Note type** looks for matches in every deck; **Note type and deck** counts a
  note as a match only if it has a card in the deck you chose.
- **Tag all notes** and **Tag updated notes:** type tags separated by spaces. The second is added
  only to notes that were updated, for example `updated-october`.
- **FIELD MAPPING:** choose which field each column goes to. A **Tags** column is read as tags; an
  **Ignored** column is skipped. The first field must be mapped to a column, and a field can come
  from one column only. At most 24 columns are shown.
- **PREVIEW:** shows how the first 5 lines are split.

When you tap **Import deck** and some existing notes would be updated, the app first asks **Update
Existing Notes?**, showing how many notes will be added, updated and skipped, and makes a safety
backup after you confirm. An import that only adds new notes makes no backup.

<a id="import-log"></a>
## The Import Log
<!-- In the app: components/ImportLogView.tsx:84-197; package lines app/import.tsx:532-586 -->

When the import finishes, the log shows how many notes were found in the file and how many were
added or skipped. Tap a group heading to see its explanation and, for text files, the notes in it
(the first 200 per group).

| Group | Meaning |
| --- | --- |
| **Notes added** | Added as a new note. |
| **Notes updated** | An existing note was updated with the file's content. |
| **Already present** | Already in your collection; nothing was changed. |
| **First field matched** | The first field matched an existing note: skipped with **Preserve**, added anyway with **Duplicate**. |
| **Note type changed** | The matching note has a different note type, so it was not updated. |
| **Note type missing** | The note type the line asks for is not in your collection; skipped. |
| **First field empty** | No card could be made because the first field was empty; skipped. |

For packages the log shows counts only; individual notes are not listed. Extra lines say how many
cards arrived with their progress and how many review entries and media files were added. Orange
lines need your attention: media files that were skipped, or a package whose deck and note type
data could not be read, so its notes were imported with simple note types.

<a id="export"></a>
## Exporting
<!-- In the app: ⓘ in the Export screen header (new, app/export.tsx:228-232) → help.export.sheet → "Learn more" → this section -->

There are four ways to open the **Export** screen:

- **Decks › ••• › Export:** all decks are preselected.
- **•••** on a deck's row › **Export deck:** that deck and its subdecks are preselected.
- **Settings › Data Management › Export data.**
- In the **Card Browser**, select cards and tap **More** › **Export cards** (in notes view,
  **Export notes**). The other cards of the selected cards' notes are included too.

1. Choose the **Export format** (below).
2. For a deck package or a text file, tick the decks in the **Decks to export** list. Tapping a
   parent deck selects its subdecks as well; **Select all** and **Clear** change them all at once.
   A collection package is always the whole collection, so it has no list.
3. Choose the **Include** options (below), then tap **Export**. On iPhone the share sheet opens: keep the file with **Save to Files**, or send it
   with AirDrop or Mail. The screen shows how many notes, cards and media files were exported.

The TUS Cards pack and filtered decks are not in this list. The exported file is not encrypted;
send it only to people and places you trust.

> **In the web version:** The file is downloaded to your computer. On a phone or tablet browser the
> share sheet may open instead.

<a id="export-formats"></a>
## Export formats
<!-- In the app: Export format selector app/export.tsx:260-264, list 352-365 -->

| Format | What it contains | When to use it |
| --- | --- | --- |
| **Anki Collection Package (.colpkg)** | The whole collection, with study progress, review history, presets, the collection's settings and every media file. | Moving to a new device. Not available from the **Card Browser**. |
| **Anki Deck Package (.apkg)** | The decks or cards you chose, the note types they use, and media. | Sharing a deck, or moving part of your collection. |
| **Notes in Plain Text (.txt)** | One note per line, fields separated by tabs, with `#` lines at the top. | Editing in a spreadsheet and importing again. |
| **Cards in Plain Text (.txt)** | One card per line: question and answer as they appear on the card. | Reading or printing; carries no note type information. |

The file name follows your choice: `koleksiyon.colpkg` for the whole collection, the deck's name
for a deck, `secili-kartlar.apkg` for a **Card Browser** selection; text files get `-notlar` or
`-kartlar` at the end of the name.

<a id="export-options"></a>
## What to include
<!-- In the app: Include: app/export.tsx:266-326 -->

For packages:

- **Include media** (on): the images and sounds your cards use, as far as they are on this device,
  go into the package.
- **Include scheduling information** (.apkg only; on, but off when the screen is opened from one
  deck): when on, cards keep their progress, review
  history and flags. When off, cards go out as new cards; history, flags and the `marked` and
  `leech` tags are removed. Turn it on when you move your own progress; leave it off when you share
  a deck with someone.
- **Include deck presets** (.apkg only, off): the decks' presets go into the package too.
- **Support older Anki versions** (off): writes the package so that Anki versions before 2.1.50
  can open it too.
- **.colpkg** is always exported with progress, presets and the collection's settings.

For text files:

- **Include HTML and media references** (on): when off, fields are turned into plain text and image
  and sound references are removed.
- For **Notes in Plain Text** also **Include tags** (on), **Include deck name**, **Include note type
  name** and **Include unique identifier** (off). With the unique identifier included, importing
  the file again later updates the same notes instead of creating copies.

Exports are written the way Anki writes them, so a file can go between TusAnkiM and Anki as many
times as you like without anything in it changing.

<a id="move-to-new-device"></a>
## Moving your collection to a new device
<!-- In the app: Export (colpkg) app/export.tsx; Import deck (colpkg) app/import.tsx:449-458 -->

TusAnkiM does not sync between devices; you move the collection with a file.

1. On the old device open **Decks › ••• › Export**. Keep all decks selected, the format on **Anki
   Collection Package (.colpkg)** and **Include media** on.
2. Tap **Export**. In the share sheet, send the file to the new device with AirDrop, or keep it in
   iCloud Drive with **Save to Files**.
3. On the new device install TusAnkiM, open the file with **Share › TusAnkiM**, tap **Import deck**
   and confirm **Replace Collection?**.
4. Check your decks and a few cards. Only then delete the collection on the old device.

What moves: decks, notes, cards, note types, presets, media, your study progress and your review
history. What does not move: app settings (language, theme, notifications), Stopwatch records,
backups and the TUS Cards pack. You install the pack again on the new device; the study state of
the pack's cards does not move this way.

If you already added cards on the new device, they are deleted. Export those decks as **.apkg**
first and import them again after the move. You use the same route to move a backup from the old
device (see [Sharing a backup](15-backups-and-maintenance.md#share-backup)). If you are coming from
Anki, see [Using TusAnkiM with Anki](19-using-with-anki.md).

> **Different from Anki:** There is no syncing through an AnkiWeb account. A move always uses a file
> and replaces the collection on the target device.

<a id="share-with-others"></a>
## Sharing a deck with someone

1. Tap **•••** on the deck's row › **Export deck**. The format is set to **Anki Deck Package
   (.apkg)**.
2. Leave **Include scheduling information** off, so the recipient starts the deck from scratch.
   Keep **Include media** on.
3. Tap **Export** and send the file.

The recipient can open the file in TusAnkiM with **Import deck**; Anki opens these packages too.
Check decks for personal notes or tags before you share them. Decks from the TUS Cards pack cannot
be shared.

<a id="limits"></a>
## Limits
<!-- In the app: size alert app/import.tsx:268-278; limits lib/importApkg.ts:43-58, lib/importApkgMedia.ts:19-25, lib/archiveSecurity.ts:7-10, app/import.tsx:59-66 -->

| What | Limit |
| --- | --- |
| Deck or collection package | Up to 400 MB |
| A single media file in a package | Up to 100 MB; larger ones are skipped and mentioned in the log |
| All files in a package | 2 GB and 200,000 files once unpacked |
| Records in a package | 1 million notes, 2 million cards, 5 million review entries |
| Text file | Up to 50 MB |
| Preview and field mapping | First 5 lines; at most 24 columns |

A file over a limit shows **The file exceeds the safe size limit.** and your collection is not
changed. A file that contains cards from the TUS Cards pack cannot be imported; the pack is
installed only from inside the app (see [TUS card pack](17-tus-card-pack.md)). Backups on the
**Backups** screen are restored there, not from this screen.

## Related topics

- [Backups and maintenance](15-backups-and-maintenance.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
- [Decks](04-decks.md)
- [Note types and card templates](09-note-types.md)
- [Card Browser and search](10-browser-and-search.md)
