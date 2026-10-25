---
id: backups
title: Backups and maintenance
summary: Automatic and manual backups, restoring, checking media, repairing the database, empty cards and resetting the collection.
order: 15
web_path: /en/help/backups
app_help: help?article=backups
app_screens:
  - "Backups — app/backups.tsx"
  - "Backups › Check Media — components/backups/MediaCheckSection.tsx"
  - "Export Backup — app/export.tsx (?backup=…)"
  - "Settings › Data Management (Backup, Maintenance) — app/settings.tsx"
  - "Empty Cards — app/empty-cards.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Backups and maintenance

TusAnkiM backs up your collection on this device by itself. On the **Backups** screen you see your
backups, make one yourself, restore one, or export a backup as a file. The maintenance tools find
and repair inconsistencies in the collection.

To open **Backups**, tap **•••** at the top right of the **Decks** screen › **Create Backup** or
**Restore from Backup** (both open the same screen), or go to **Settings › Data Management ›
Manage backups**.

<a id="automatic-backups"></a>
## Automatic backups
<!-- In the app: ⓘ in the Backups screen header (new, app/backups.tsx:208-212) and the ? button of the Settings › Data Management › Backup group (new, app/settings.tsx:1544) → help.backups.sheet → this section -->

- If something in the collection changed, the app makes a backup **every 30 minutes**. When you
  open the app or return to it, a backup is also made if the last one is more than 30 minutes old.
- No backup is made while you are studying cards; it waits until you leave the study screen or put
  the app in the background.
- Of the backups from today and yesterday, the newest 24 are kept. Of older ones, one is kept for
  each of the last 12 days that have backups, one for each of the last 10 weeks and one for each of
  the last 9 months; the rest are deleted automatically.
- To turn automatic backups off, switch off **Settings › Data Management › Automatic backup** and
  tap **Save** at the top right. Backups you make yourself and the safety backups before risky
  operations are still made.

| In a backup | Not in a backup |
| --- | --- |
| Decks, notes, cards, note types, presets | Media files such as images and sounds |
| Study progress and review history | The TUS Cards pack itself |
| App settings and Stopwatch records | |
| Your progress and tags on TUS Cards pack cards | |

Backups are kept inside the app, on this device only; they do not appear in the **Files** app. If
you delete the app, the backups are deleted too (see [below](#delete-app-warning)).

> **Different from Anki:** Backups do not contain media files and cannot be taken out as files
> directly. To get a backup off the device, you turn it into a package with **Share**
> (see [Sharing a backup](#share-backup)).

> **In the web version:** Backups are kept in the browser's own storage. If the app is open in
> several tabs, only the tab that saves changes makes automatic backups. Clearing the browser's site
> data deletes the backups too.

<a id="back-up-now"></a>
## Making a backup yourself
<!-- In the app: Backups › BACKUP NAME and Back Up Now app/backups.tsx:214-235 -->

1. On the **Backups** screen, look at the **BACKUP NAME** box. It suggests a name made from the
   date and time, for example `tus-backup-2026-10-25-143012345.json`.
2. Change the name if you like, for example `before-mock-exam`. You don't need to add `.json`.
3. Tap **Back Up Now**. The message **Current data was saved as a local backup.** appears.

Backups with the suggested name are replaced by newer ones over time, like automatic backups.
**Backups you rename are kept until you delete them.** If you want a lasting backup before a big
import or a reset, make one with your own name.

The list shows each backup's kind, date and size: **Collection backup** or **Pre-restore
snapshot**. To delete a backup, tap **Delete**; a deleted backup cannot be brought back.

<a id="restore"></a>
## Restoring a backup
<!-- In the app: Backups › Restore app/backups.tsx:130-183, 268-274 -->

1. On the **Backups** screen, tap **Restore** under the backup.
2. Confirm **Restore Backup** with **OK**.
3. When you see **Backup restored.**, your collection is as it was in the backup.

Restoring replaces the whole collection: decks, notes, cards, review history and app settings
(language and theme included) go back to what is in the backup. Media files are not touched.

Right before restoring, a copy of the current state is added to the list as a **Pre-restore
snapshot**. If you picked the wrong backup, restore that snapshot to go back. The newest three of
these snapshots are kept.

If a backup cannot be restored, **Could not restore the backup.** appears and your collection is not
changed. This can happen when the backup was made by a newer version of the app or the file is
damaged.

<a id="share-backup"></a>
## Sharing a backup and taking it off the device
<!-- In the app: Backups › Share app/backups.tsx:200-204, 275-281 → Export Backup app/export.tsx:229, 235-248 -->

**Share** opens the **Export Backup** screen, which prepares a file from the backup you chose. It
offers the same options as the **Export** screen (see [Exporting](14-import-export.md#export)), but
the file is made from the collection as it was when the backup was taken; your current collection
does not change.

- To keep the whole collection or move it to another device, choose **Anki Collection Package
  (.colpkg)**. This format always includes progress.
- Backups do not store media files, so with **Include media** on only files that are still on this
  device are added.
- The resulting file is not encrypted; send it only to places you trust.

The backup file itself cannot be imported back into the app. To use a backup on another device,
export it as **.colpkg** and import it there; it replaces the collection on that device
(see [Moving your collection to a new device](14-import-export.md#move-to-new-device)).

<a id="backup-safety"></a>
## Backups made before risky operations
<!-- In the app: lib/packageImportWorkflow.ts:18-25, app/import.tsx:412, lib/maintenanceWorkflow.ts:47-68, lib/resetWorkflow.ts:29-46, components/backups/MediaCheckSection.tsx:49, lib/backup.ts:555-589 -->

Some operations that change the collection make a backup by themselves before they start:

| Operation | Backup first? |
| --- | --- |
| Importing a deck package (.apkg) | Always |
| Importing a collection package (.colpkg) | Always |
| Importing a text file | Only if it will update existing notes |
| Restoring a backup | Yes, as a **Pre-restore snapshot** |
| **Repair and optimize** | Always |
| **Reset progress** | Always |
| Moving unused media to the trash | Always (a collection backup) |
| Deleting empty cards | No |

These backups appear in the list as **Collection backup** with the time of the operation, and are
replaced by newer ones over time like automatic backups.

If the collection contains unreadable rows, the app cannot make a backup that can be restored. In
that case importing a collection package and **Reset progress** stop before they start and show the
**Repair First** alert, and **Back Up Now** saves only a **recovery copy**. A recovery copy can be
exported as a raw file with **Share** but cannot be restored. Run [Repair and optimize](#repair)
first.

<a id="check-media"></a>
## Check Media
<!-- In the app: Backups › MEDIA › Check Media components/backups/MediaCheckSection.tsx:77-116 -->

In the **MEDIA** section at the bottom of the **Backups** screen, tap **Check Media**. The app
compares the stored media files with your notes and note types:

- **Unused:** files no note or card template uses.
- **Missing (referenced, not stored):** files your notes mention that are not on this device.

The lists show the first 20 file names. Files whose names start with `_` are never counted as
unused, because templates may use them. `.apkg` files whose names start with `tusanki-source-` are
copies the app keeps of packages you imported; if they are listed, they are no longer needed.

**Move Unused to Trash (N)** first makes a collection backup and then moves the files to a trash
folder. **Restore Trash** puts every file in the trash back; if a file with the same name exists by
then, it stays in the trash. Files in the trash keep taking up space on the device.

To bring back missing files, import the package that contained them again: the notes are not
duplicated, but the missing media is put back. Or add the image again in the card editor.

> **Different from Anki:** There are no options to delete unused files permanently, to empty the
> trash, or to tag notes that have missing files.

> **In the web version:** The check only reports; files cannot be moved to the trash.

<a id="check-database"></a>
## Check database
<!-- In the app: Settings › Data Management › Maintenance › Check database app/settings.tsx:1568-1576, result 714-747; ? button of the Maintenance group (new, 1567) → help.settings.maintenanceSheet → this section -->

**Settings › Data Management › Check database** only reads; it changes nothing. The window that
opens shows an **Integrity** line first, then a count for each kind of problem:

| Lines | Meaning |
| --- | --- |
| **Integrity** | Whether the collection file itself is sound. |
| **Orphaned cards**, **Notes without cards**, **Cards with a missing deck** | Cards without a note, notes that have no cards left, and cards whose deck was deleted. |
| **Cards with an invalid interval**, **Cards with an invalid due date**, **New cards with an out-of-range position**, **Cards with an invalid template ordinal**, **Cards left with filtered-deck state**, **Cards keeping a stale pre-filter due**, **Cards with a wrong last review time** | Cards whose study data is out of the valid range. |
| **Unreadable notes** | Notes whose text cannot be read. They cannot be repaired; their text can only come back from a backup. |

If any count is above zero, run [Repair and optimize](#repair). If it says **An integrity issue was
detected**, try repairing first as well; if the problem stays, restore a recent backup.

> **Different from Anki:** Checking and repairing are separate buttons. **Check database** only
> reports; **Repair and optimize** shows what it found and asks before it changes anything.

<a id="repair"></a>
## Repair and optimize
<!-- In the app: Settings › Data Management › Maintenance › Repair and optimize app/settings.tsx:1577-1584; confirmation 878-920; result 762-871 -->

1. Tap **Settings › Data Management › Repair and optimize**.
2. The app checks the collection and shows what it found, and what it will do, in the **Repair and
   Optimize Database** window. Confirm with **OK**.
3. A safety backup is made, then the repair runs. The result window says what was fixed and names
   the backup.

The repair deletes cards that have no note; gives notes with no cards their first card back; moves
cards whose deck was deleted to their own deck or, if it cannot be found, to a deck called
**Kurtarılan Kartlar** ("Recovered Cards"); and corrects invalid dates, intervals and positions. No
note text is deleted. Then the collection file is compacted and the search index is rebuilt.

If a **Kurtarılan Kartlar** deck was created, move its cards to the right decks from the **Card
Browser**. Cards of the TUS Cards pack are never deleted or moved. If the result says **Partly
Completed**, the steps that did not finish are listed; you can run the repair again later.

<a id="empty-cards"></a>
## Empty Cards
<!-- In the app: Decks › ••• › Empty Cards (app/(tabs)/decks.tsx:2257-2263) → app/empty-cards.tsx -->

An **empty card** is a card whose front can no longer be made: the field that builds the front was
cleared, the card's template was removed from the note type, or, in a cloze note, that cloze number
was deleted from the text. The **Decks › ••• › Empty Cards** screen lists these cards with the
reason.

- To delete one card, tap **✕** on its row; to delete them all, tap **Delete All (N)**.
- **Keep notes with no valid cards** (on): if every card of a note is empty, its first card is
  kept so that the note is not left without cards. When off, all the cards are deleted but the
  note's text stays without cards; **Check database** then shows such notes as **Notes without
  cards**, and **Repair and optimize** gives them a card again.
- Review history is kept. Deleting cannot be undone and no backup is made first; make
  [a backup yourself](#back-up-now) before you start.

> **Different from Anki:** With **Keep notes with no valid cards** off, notes are not deleted; only
> their cards are.

<a id="reset-progress"></a>
## Reset progress: starting the collection over
<!-- In the app: Settings › Data Management › Maintenance › Reset progress app/settings.tsx:1585-1591; confirmation 979; result 991-1007 -->

**Reset progress deletes the whole collection, not just your study progress.**

| Deleted | Kept |
| --- | --- |
| All decks, notes, cards and note types | Media files |
| Presets, study progress, review history and statistics | Backups |
| Stopwatch records | |
| App settings (the language returns to Turkish, the theme to light) | |

After the reset the app opens as it did when first installed, with one empty deck called
**Varsayılan** (the default deck). To switch the language back, go to **Settings › General ›
Language**.

Before you use it:

1. Make a lasting backup with **Backups › Back Up Now**, giving it your own name.
2. Export the collection as **.colpkg** and keep the file off the device
   (see [Moving your collection to a new device](14-import-export.md#move-to-new-device)).

Then tap **Settings › Data Management › Reset progress** and confirm with **OK**. The app first
makes a safety backup that can be restored; the **Progress Reset** message names it. If you change
your mind, restore that backup from the **Backups** screen.

If you only want to turn some cards back into new cards, do not use this command: select the cards
in the **Card Browser** and tap **More** › **Reset cards…**
(see [Card Browser and search](10-browser-and-search.md)).

> **Different from Anki:** Resetting cards in Anki only turns the cards you select into new cards.
> **Reset progress** deletes the whole collection.

<a id="delete-app-warning"></a>
## Before you delete the app

Because backups are kept inside the app, **deleting the app deletes your collection and all your
backups with it.** Before you delete the app or change phones, export your collection as
**.colpkg** and save the file to iCloud Drive, your computer or another safe place. You can bring
it back later with **Import deck**.

> **In the web version:** Clearing the browser's site data also deletes the collection and the
> backups. Export the collection and download it before any important change.

## Related topics

- [Import and export](14-import-export.md)
- [Card Browser and search](10-browser-and-search.md)
- [Settings](16-settings.md)
- [FAQ and troubleshooting](20-faq.md)
