---
id: anki
title: Using TusAnkiM with Anki
summary: Moving your Anki decks to TusAnkiM, taking them back, and the differences between the two apps.
order: 19
web_path: /en/help/using-with-anki
app_help: help?article=anki
app_screens:
  - "Import — app/import.tsx"
  - "Export — app/export.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Using TusAnkiM with Anki

TusAnkiM reads and writes Anki's package files. You can bring in decks you made in Anki desktop,
AnkiMobile or AnkiDroid, and take what you studied in TusAnkiM back to Anki. You move things with
files; there is no automatic sync between the two apps.

> TusAnkiM is an independent project; it is not affiliated with Anki or Ankitects. The name "Anki"
> appears here only to describe file formats and behavior.

<a id="what-transfers"></a>
## What transfers?

| File | What is inside | What happens in TusAnkiM |
| --- | --- | --- |
| `.apkg` (deck package) | One or more decks: notes, cards, note types (fields, templates, CSS), media; optionally study progress, review history and deck settings | It is **added** to your current collection. If the same notes are found, they are updated by the rule you choose. |
| `.colpkg` (collection package) | The whole collection, with its study history | It **replaces** your current cards, decks and history. A safety backup is made first. |
| `.csv`, `.tsv`, `.txt` | Lines of text; Anki's header lines starting with `#` are supported | Added as notes to the note type and deck you choose, or used to update existing notes. |

A deck package with a `.zip` extension can also be opened from the file picker, or by dragging
and dropping it in the web version; the app reads it like an `.apkg`.

<a id="move-whole-collection"></a>
## Moving your whole Anki collection

If you are new to TusAnkiM and want to bring over everything you have in Anki:

1. In Anki, open the **Export** window, choose the collection package (`.colpkg`) as the format
   and leave the option to include media (**Include media**) turned on.
2. Move the file to your iPhone: AirDrop, iCloud Drive or copying it from a computer to the
   **Files** app all work.
3. In **Files**, tap the file and choose TusAnkiM from the share menu. Or, in TusAnkiM, go to
   **Decks › ⋮ › Import › Choose File**.
4. Read the **Replace Collection?** question. If you confirm, TusAnkiM first makes a safety backup
   of your current collection and then loads the package.
5. When it finishes, the **Import Log** shows how many cards, review entries and media files came
   in. Leave with **Done**.

A collection package replaces only cards, decks and history. Your app settings, Stopwatch sessions
and the media files on the device stay where they are.

> **Watch out:** If you already have cards you have been studying in TusAnkiM, a collection package
> deletes them. If you only want to add some decks, use a deck package as described in the next
> section.

<a id="bring-some-decks"></a>
## Bringing in only some decks

1. In Anki, export the deck as a deck package (`.apkg`). If you also want to bring your own
   progress, keep the option to include scheduling information (**Include scheduling
   information**) and media turned on.
2. Open the file in TusAnkiM. In the **Import options** section:
   - **Import any learning progress** (on by default): Cards carry on from where they were in
     Anki. If you turn it off, the cards start as new; review history and the `marked` and `leech`
     tags are not brought in.
   - **Import any deck presets** (on by default): The presets in the package come too. If an
     identical one already exists, it is reused.
   - **Update notes** and **Update note types**: **If newer** (the default), **Always** or
     **Never**. These decide how notes are updated when you open a newer version of a package you
     imported before.
3. Tap **Import**. An automatic safety backup is made before every package import.

Importing the same package a second time does not duplicate cards: notes are recognized by their
unique IDs. An update changes only the note content and tags; your study state in TusAnkiM is
kept.

<a id="shared-decks"></a>
## Decks shared by others

You import an `.apkg` file you downloaded from the internet the same way. If you do not want to
start with the study history of the person who made the deck, turn off **Import any learning
progress**; the cards then arrive as new for you.

The card templates of some shared decks contain JavaScript code. For safety, TusAnkiM does not run
code in cards; such cards may look plainer. See
[Note types and card templates](09-note-types.md).

<a id="back-to-anki"></a>
## Taking cards from TusAnkiM to Anki

1. Open **Decks › ⋮ › Export**.
2. Choose the format:
   - With all decks selected, **Anki Collection Package (.colpkg)**: the whole collection,
     including study history.
   - For some decks, **Anki Deck Package (.apkg)**. If you want your progress to go along too,
     turn on **Include scheduling information**; this option is **off** by default.
3. Keep **Include media** on, tap **Export**, and save or send the file from the share menu.
4. Import the file in Anki.

The TUS Kartları pack and filtered decks are not exported; cards that are in filtered decks are
exported in their own decks. Details: [Import and export](14-import-export.md).

<a id="using-both"></a>
## Using both apps at the same time

Because there is no sync between TusAnkiM and Anki, studying the same cards in both places creates
two separate histories, and they cannot be merged. Importing a deck package again updates the note
content but does not change the study state in TusAnkiM. Our advice:

- Study your cards in **one main app**.
- When you switch apps, move the whole collection as a `.colpkg`.
- Make a backup on both sides before you move.

<a id="differences"></a>
## Where TusAnkiM works differently from Anki

TusAnkiM is built to be compatible with Anki's file formats and core study behavior, but it does
not have every feature. The main differences you will notice:

| Topic | In TusAnkiM |
| --- | --- |
| Sync (AnkiWeb) | None. You move things with a `.colpkg` / `.apkg` file. |
| Profiles | There is a single collection. |
| Daily limit for new cards | None: you can study as many new cards as you like. Review cards have a daily limit. See [Deck options](06-deck-options.md#daily-limits). |
| Math (MathJax/LaTeX) | Formulas are not shown rendered; the source text in the fields is kept. |
| Image Occlusion | Notes are made and edited with the app's mask editor and open in Anki with the same masks, including their turn and colour; colours here come from a short palette, and any colour set in Anki is kept. |
| Add-ons | Not supported. |
| JavaScript in card templates | Not run, for safety. |
| Merging note types | Not offered. A note type whose structure has changed is added as a separate copy, with `(Imported)` at the end of its name. |
| Backups | These are the app's own backups and do not open directly in Anki. To take a backup to Anki, turn it into a package with **Backups › Share**. See [Backups and maintenance](15-backups-and-maintenance.md). |
| Statistics | Some of Anki's charts are available. See [Statistics](12-statistics.md). |
| Keyboard shortcuts | The study screen has the basic keys; some Anki keys are missing. See [Studying](05-studying.md). |
| **Reset progress** | This command in Settings does not reset individual cards as in Anki; it deletes the whole collection. See [Backups and maintenance](15-backups-and-maintenance.md#reset-progress). |

Only in TusAnkiM: the ready-made [TUS card pack](17-tus-card-pack.md), the
[Stopwatch and study calendar](13-stopwatch-and-calendar.md), deck shortcuts and
[automation](18-shortcuts-and-automation.md) with `tusankim://` links.

<a id="limits"></a>
## File limits

- Deck or collection package: up to 400 MB; a single media file up to 100 MB.
- Text file: up to 50 MB. The file must be saved as UTF-8; in files saved with another encoding,
  Turkish letters look garbled.

Importing very large packages can take a few minutes; keep the app open while it runs.

## Related topics

- [Import and export](14-import-export.md)
- [Backups and maintenance](15-backups-and-maintenance.md)
- [FAQ and troubleshooting](20-faq.md)
