---
id: tus-cards
title: TUS card pack
summary: Installing the free 9,575-card TUS pack, studying and editing it, content updates, backups and moving to a new device.
order: 17
web_path: /en/help/tus-card-pack
app_help: help?article=tus-cards
app_screens:
  - "Decks tab, locked TUS Kartları row — app/(tabs)/decks.tsx (renderLockedCatalogCard)"
  - "TUS Kartları screen — app/catalog.tsx"
  - "••• menu of the pack decks — app/(tabs)/decks.tsx (renderMenuModal)"
  - "Note editor on a pack note — app/editor.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# TUS card pack

**TUS Kartları (TUS Cards)** is a ready-made card pack that ships with the app: 9,575 cards across
12 basic and clinical science courses. The pack is optional and free. To install it, tap the
**TUS Kartları** row at the top of the **Decks** tab.

<a id="what-is-included"></a>
## What is included

<!-- In the app: TUS Kartları screen › "What's inside" section (app/catalog.tsx:208) and the ⓘ info sheet (help.tusCards.sheet) "Learn more" → this section -->

The pack has 12 course decks and 106 subdecks below them. Everything sits under one parent deck
called **TUS Kartları**. Course and subdeck names are in Turkish.

| Course | Cards | Subdecks |
| --- | ---: | ---: |
| Deneme ve Soru (practice exams and questions) | 806 | 4 |
| Anatomi (anatomy) | 477 | 8 |
| FHE (physiology, histology, embryology) | 597 | 10 |
| Biyokimya (biochemistry) | 602 | 5 |
| Mikrobiyoloji (microbiology) | 730 | 6 |
| Patoloji (pathology) | 724 | 10 |
| Farmakoloji (pharmacology) | 827 | 9 |
| Dahiliye (internal medicine) | 1,183 | 8 |
| Pediatri (pediatrics) | 1,506 | 15 |
| Genel Cerrahi (general surgery) | 742 | 9 |
| Küçük Stajlar (minor clinical rotations) | 626 | 15 |
| Kadın Doğum (obstetrics and gynecology) | 755 | 7 |
| **Total** | **9,575** | **106** |

- **How the subdecks are formed:** the pack's author labelled part of the cards with a topic tag;
  those cards go into the subdeck of their tag. Untagged cards are placed by the subject terms in
  their own text. All subdecks of Anatomi, FHE, Patoloji and Farmakoloji come from this second
  step.
- **Cards that fit no topic** (2,612 in total) stay directly in their course deck. When you open a
  course on the **TUS Kartları** screen, they are counted on the **Cards without a topic tag** row.
  Studying the course deck includes them.
- You can see the subdeck names and card counts before installing: tap a course on the
  **TUS Kartları** screen.
- The cards are cloze cards and basic cards with a typed answer; some contain images.

> The cards are for exam preparation and education only; they are not medical advice or clinical
> decision support.

<a id="install"></a>
## Installing the pack

<!-- In the app: Decks › locked "TUS Kartları" row (app/(tabs)/decks.tsx:1383) → TUS Kartları screen (app/catalog.tsx) -->

1. Open the **Decks** tab. At the top of the list you see the **TUS Kartları** row with a lock icon
   and **Unlock free** next to it.
2. Tap the row. The **TUS Kartları** screen opens with the contents, the course list and a few
   notes.
3. Tap **Unlock cards for free** at the bottom. No payment, account or internet connection is
   needed; the pack is installed from inside the app.
4. An **Installing cards** window shows for a few seconds, then **Package unlocked** appears.
5. Tap **Go to my decks**. **TUS Kartları** is now an ordinary deck in your list.

Installing does not touch your own decks, notes or review history. If the installation is
interrupted, your collection stays as it was; the next time you open the app it tries again on
its own.

If you already have a deck of your own called **TUS Kartları**, the pack is installed as
**TUS Kartları 2** and your deck stays where it is.

> **In the web version:** the pack is downloaded into the browser while it installs, so an
> internet connection is needed during installation.

<a id="studying-the-pack"></a>
## Studying the pack

- After installation, **TUS Kartları** and its course decks are folded. Tap the arrow at the left
  of a row to show the courses, and a course's arrow to show its subdecks.
- You can study one subdeck, one course or the whole pack. Studying a parent deck includes every
  card below it.
- Every card arrives as a **new** card, so the **New** column shows a large number on the first
  day. TusAnkiM has no daily limit for new cards; you decide how many new cards to open each day.
  See [Deck options](06-deck-options.md#daily-limits).
- A practical approach: pick one course or subdeck at a time and stop when you reach your daily
  goal. The next day your reviews come first.
- Pack cards are studied like your own: the answer buttons, flags, suspending, burying,
  **Custom study** and filtered decks all work the same way. Your reviews appear in the statistics.
- You cannot delete a course you do not want, but you can keep it folded or suspend its cards:
  in the **Card Browser**, search for something like `deck:"TUS Kartları::Anatomi"`, choose
  **Select all**, then **More › Toggle suspend**.
  See [Card Browser and search](10-browser-and-search.md).

<a id="editing"></a>
## Editing the cards

<!-- In the app: note editor with a pack note open, info line (help.tusCards.editorHint, near app/editor.tsx:1140) "Learn more" → this section -->

You can edit pack cards like your own notes. Open the note with **Edit note** from the card menu
on the study screen, or from the **Card Browser**.

- You can change the text of every field, add formatting, images and audio, and add or remove
  cloze numbers.
- You can add and remove tags, mark the note and flag its cards.
- Editing does not change the cards' study state or review history. If you remove a cloze number,
  that card becomes empty; you can clean it up with **Empty Cards**.

> **Caution:** text changes you make to pack cards are not included in backups or exported files.
> Details: [Backups and export](#backups-and-export).

<a id="what-you-cannot-change"></a>
## What you cannot change

The pack's structure is protected. The actions below are not available on pack cards and decks;
the option is either missing from the menu or shows a short explanation when you tap it.

| Action | What happens |
| --- | --- |
| Renaming or deleting a pack deck, editing its description, adding a subdeck | These options are not in the deck's ••• menu. |
| Dragging a pack deck to a new place | The row's move handle is dimmed and does not respond. |
| Moving a pack card to another deck | Tapping the **Deck:** row or **Change deck** shows an explanation. |
| Moving your own cards into a pack deck, or adding a new note to it | Pack decks are not offered as a destination. **Add** in a pack deck's menu adds the note to one of your own decks; the **Deck:** row of the editor shows which one. |
| Changing the note type | Tapping the **Type:** row shows an explanation. |
| Deleting a note | **Delete note** is not shown for pack cards. |
| Exporting | Pack decks are not listed for export. |

<a id="updates"></a>
## Content updates

Corrections to the cards arrive with app updates. The first time you open the app after an update,
the pack refreshes itself; you do not need to do anything.

**Kept:**

- Each card's study state: intervals, due dates, flags, suspended and buried cards.
- Your review history and statistics.
- Notes whose text you changed: their fields, tags and cards stay as you left them. The correction
  in that update is not applied to these notes.

**Returned to the pack's version:**

- Notes whose text you did not change. Tags and marks you added to these notes also return to the
  pack's version.
- The options and folding of the pack decks. See [Presets](#presets).

If the new pack cannot be loaded, the old one stays in place and the app tries again next time.

<a id="backups-and-export"></a>
## Backups and export

<!-- In the app: Backups screen, hint under "Back Up Now" (help.tusCards.backupHint, app/backups.tsx:234) and the Export screen hint (help.tusCards.exportHint, app/export.tsx:300) → this section -->

The pack's cards come with the app, so backups and exported files do not contain their text. How
much of your work is kept depends on the route you use:

| Route | What is kept for the pack? |
| --- | --- |
| **Backups** (automatic or **Back Up Now**) | Each card's study state, flags, tags and review history. Text changes you made to pack cards are not kept. |
| **Export › Anki Collection Package (.colpkg)** | Pack cards and their study state are **not** in the file. It contains only your own decks. |
| **.apkg** and plain-text export | Pack decks and cards cannot be selected. |

- When you restore a backup on the same device, the pack is reinstalled and the study state from
  the backup is applied to its cards.
- A file that contains pack cards (`.apkg`, `.colpkg` or text) cannot be imported.
- If you import a `.colpkg` file and replace your collection, the pack is installed from scratch and
  its cards start as new. You can return to your previous state by restoring the safety backup
  taken before the import.

See [Backups and maintenance](15-backups-and-maintenance.md) and
[Import and export](14-import-export.md).

<a id="new-device"></a>
## Moving to a new device

The app's backups stay on the device. When you send a backup with **Backups › Share**, it is
converted into an Anki package, and that file does not contain pack cards or their study state
either. There is no way inside the app to carry your progress in the pack to another device in a
file.

On the new device:

1. Import your own decks from a `.colpkg` file. See
   [Import and export](14-import-export.md).
2. Install the pack again with **Decks › TUS Kartları › Unlock cards for free**.
3. Pack cards start as new cards. To move quickly through courses you already know well, you can
   use the **Easy** button.

<a id="remove-the-pack"></a>
## Removing the pack

There is no way to remove the pack on its own; its decks and cards cannot be deleted. You can keep
the parts you do not want to study folded or suspended
(see [Studying the pack](#studying-the-pack)).

The pack is removed only by **Settings › Data Management › Reset progress**. This command deletes
**your whole collection** together with the pack: your own decks, cards and review history. A
restorable safety backup is made first. After the reset, **TUS Kartları** appears locked again;
you can reinstall it with **Unlock cards for free** whenever you like. Details:
[Backups and maintenance](15-backups-and-maintenance.md#reset-progress).

<a id="presets"></a>
## Presets

<!-- In the app: Deck options › "Preset" row (app/deck-options.tsx:1113), hint help.tusCards.presetHint → this section -->

The pack comes with its own **preset**, named **TUS Kartları**. The default preset the app gives
your own decks is also named **TUS Kartları**. The **Preset** row at the top of **Deck options**
shows, next to the name, how many decks use it (**N decks**); that is how you tell the two apart.

- To avoid mixing them up, rename your own preset: **Preset actions › Rename preset**. This name is
  not affected by updates.
- You can change the values of the pack's preset or give the pack decks another preset. After a
  content update, the pack decks go back to the pack's own preset with its original values, so
  check your options after an update.

See [Deck options](06-deck-options.md#presets).

## Related topics

- [Decks](04-decks.md)
- [Adding and editing cards](08-adding-and-editing.md)
- [Backups and maintenance](15-backups-and-maintenance.md)
- [Import and export](14-import-export.md)
- [FAQ and troubleshooting](20-faq.md)
