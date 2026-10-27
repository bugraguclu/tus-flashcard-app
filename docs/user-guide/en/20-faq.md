---
id: faq
title: FAQ and troubleshooting
summary: Fixes for common problems: no cards showing, tapped the wrong button, changing phones, an Anki deck that will not open, and more.
order: 20
web_path: /en/help/faq
app_help: help?article=faq
app_screens:
  - "Help center — app/help.tsx (new)"
  - "Error screen — app/_layout.tsx (Something went wrong)"
  - "Support page — docs/support.html (website)"
verified_against: master c6108e6 (2026-10-25)
---

# FAQ and troubleshooting

We have gathered the most common questions and their answers here. If you cannot find what you
are looking for, see the [Support](#contact-support) section at the end of the page.

<a id="studying"></a>
## Studying

<a id="no-cards-today"></a>
### I tapped a deck but no cards come up; "Congratulations!" appears straight away

This means there are no cards left to study in that deck today. Possible reasons:

- The deck has no new cards and no reviews due today. If the numbers in the deck list are zero,
  this is the case.
- You have reached the daily limit for review cards. You can change the limit under
  **Deck options › Daily Limits**. See [Deck options](06-deck-options.md#daily-limits).
- The cards may be suspended or buried for today. You can find these cards in the
  **Card Browser** and turn them back on. See [Card Browser and search](10-browser-and-search.md).

If you still want to study, start a **Custom study** session for the deck (from the deck row's
**•••** menu). See [Filtered decks and Custom Study](11-filtered-decks.md).

<a id="new-card-limit"></a>
### How many new cards should I study a day?

TusAnkiM does not put a daily limit on new cards; it leaves the decision to you. Every new card
comes back as a review in the following days, so the new cards you open today shape your review
load for the coming weeks. Study the same number of new cards for a few days and watch your review
load, then go up or down. The forecast chart on the [Statistics](12-statistics.md) screen helps
with this.

<a id="midnight"></a>
### It is past midnight but my cards still count as "today"

In the app the day changes not at midnight but at the **Start of next day** hour (04:00 by
default). You can change the hour under **Settings › Reviewing**. See
[Key concepts](02-key-concepts.md#study-day).

<a id="card-came-back-soon"></a>
### A card I just answered came back a few minutes later

Cards in the learning stage are repeated in short steps measured in minutes. When no other cards
are left, the app may show a learning card that is due within a few minutes without waiting
(the learn ahead limit, 20 minutes by default). This is normal. See
[Studying](05-studying.md).

<a id="wrong-button"></a>
### I tapped the wrong button

Tap the undo button (curved arrow) in the study screen's top bar; your last answer is undone and
the card comes back in front of you. Tap it several times to undo earlier actions too. See
[Studying](05-studying.md).

<a id="leech-card"></a>
### I keep forgetting a card

When a card is forgotten many times, the app marks it as a **Leech**. Splitting such a card into
smaller pieces, or adding an example or an image, usually helps. To edit the card, open the editor
from the study screen. See [Adding and editing cards](08-adding-and-editing.md) and
[Deck options](06-deck-options.md#lapses).

<a id="reminder-not-working"></a>
### The daily reminder does not arrive

1. Under **Settings › Notifications**, check that the **Notifications** switch is on.
2. Check the **Reminder time** and the **Notify when** option. The reminder may not arrive if
   there are no cards to study at that time.
3. Make sure notifications are allowed in the iPhone's **Settings › Notifications › TusAnkiM**.
   If you see the **Notification permission required** warning, this is the problem.

See [Settings](16-settings.md#notifications).

> **In the web version:** The reminder comes as a browser notification; your browser must allow
> notifications for this site and the tab must stay open.

<a id="cards"></a>
## Cards and appearance

<a id="images-missing"></a>
### Images or sounds do not show in a deck I imported

The package may have been exported without media. In the app where you made the package, turn on
the option to include media, export again and then import again; cards are not duplicated. To see
which files are missing, use the **Check Media** button on the **Backups** screen. See
[Import and export](14-import-export.md) and
[Backups and maintenance](15-backups-and-maintenance.md#check-media).

<a id="card-looks-plain"></a>
### Cards from a shared deck do not look the way they do in Anki

The templates of some shared decks contain JavaScript code. For safety, TusAnkiM does not run this
code; the card may look plainer. Math formulas (MathJax/LaTeX) are not shown rendered either. See
[Using TusAnkiM with Anki](19-using-with-anki.md#differences).

<a id="text-size"></a>
### The text on cards is too small or too large

Under **Settings › Accessibility › Card** you can scale card text with **Card zoom** and images
with **Image zoom**, anywhere from 50% to 200%. See [Settings](16-settings.md).

<a id="find-a-card"></a>
### I cannot find a card

Open the **Card Browser** from the bottom bar and type a word from the card into the search box.
You can also narrow the list by deck, tag or flag. See
[Card Browser and search](10-browser-and-search.md).

<a id="data"></a>
## Your data

<a id="new-phone"></a>
### I am changing phones; how do I move my cards?

1. On the old phone, open **⋮ › Export** and, with all decks selected, export in the
   **Anki Collection Package (.colpkg)** format with **Include media** on.
2. Move the file to the new phone through AirDrop, iCloud Drive or a computer.
3. Install TusAnkiM on the new phone and open the file with **⋮ › Import**.

A collection package replaces the cards already on the new phone; on a fresh install this is not
a problem. The **TUS Kartları** pack is not included in this file: on the new phone you install
the pack again with **Unlock cards for free**, and the pack's cards start as new cards. See
[Import and export](14-import-export.md#move-to-new-device) and
[TUS card pack](17-tus-card-pack.md#new-device).

<a id="sync"></a>
### Do my cards sync between my iPhone and my computer?

No. TusAnkiM keeps all your data only on your device; there is no account, cloud or sync. You move
cards to another device or to Anki with a file. See
[Using TusAnkiM with Anki](19-using-with-anki.md#using-both).

<a id="delete-app"></a>
### What happens if I delete the app?

Deleting the app also deletes all of its data on the device: cards, review history, settings and
the app's own backups. Before you delete it, save your collection as a `.colpkg` file with
**⋮ › Export** to the **Files** app or to your computer.

<a id="undo-import"></a>
### I imported the wrong file; can I go back?

Yes. Before every package import, the app makes an automatic safety backup. Use
**⋮ › Restore from Backup** and choose the backup from just before the import. See
[Backups and maintenance](15-backups-and-maintenance.md).

<a id="reset-progress"></a>
### What does "Reset progress" do?

**Settings › Data Management › Maintenance › Reset progress** does not reset individual cards; it
deletes the whole collection: decks, cards, review history, Stopwatch records and app settings.
The app opens as it did when first installed. A restorable safety backup is made first. If you
only want to start some cards over, select them in the **Card Browser** and use the
**Reset cards…** command instead. See
[Backups and maintenance](15-backups-and-maintenance.md#reset-progress).

<a id="turkish-characters"></a>
### Turkish letters look garbled in a text file I imported

The file was saved in an encoding other than UTF-8. Save the file again in Excel or a text editor
as "CSV UTF-8" or "UTF-8" and import it again. See
[Import and export](14-import-export.md).

<a id="tus-pack"></a>
## TUS card pack

<a id="is-it-free"></a>
### Does the TUS card pack cost anything?

No. The pack is free in this version; it needs no account or payment. You install it by tapping
the **TUS Kartları** row in the deck list and then **Unlock cards for free**. See
[TUS card pack](17-tus-card-pack.md).

<a id="pack-content"></a>
### I found a mistake in a card in the pack

You can edit the card in your own copy. To report the mistake to us, use the route in the
[Support](#contact-support) section; telling us the card's deck and its front side makes our job
easier. The cards are for education; for clinical decisions, rely on current sources.

<a id="problems"></a>
## App problems

<a id="error-screen"></a>
### A "Something went wrong" screen appeared

1. Tap **Try Again**. Most of the time this is enough.
2. If not, go back to the deck list with **Return to Home**.
3. If the problem continues, close the app completely and open it again.

If you want to report it to us, add the text that opens with **Show technical details** to your
support message. Your data is not affected by this screen.

<a id="app-slow"></a>
### The app has slowed down or search gives odd results

1. Check your collection with **Settings › Data Management › Maintenance › Check database**. It
   changes nothing; it only tells you whether there is a problem.
2. If it finds a problem, or search still looks wrong, run **Repair and optimize**. It checks
   first and asks you to confirm, then makes a safety backup, repairs broken records and rebuilds
   the search index.

See [Backups and maintenance](15-backups-and-maintenance.md#check-database).

<a id="contact-support"></a>
## Support

If your problem is not listed here, contact us through the **Support** page on our website. It
helps if your message includes:

- your iPhone model and iOS version (or, in the web version, your browser's name),
- the app version, shown as "Version" under **Settings › About**,
- the steps that lead to the problem and, if there is one, the technical details from the error
  screen.

You do not need to send your cards or backup files; if we need them, we will ask separately.

## Related topics

- [Quick start](03-quick-start.md)
- [Backups and maintenance](15-backups-and-maintenance.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
- [Glossary](21-glossary.md)
