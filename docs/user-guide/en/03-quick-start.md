---
id: quick-start
title: Quick start
summary: From first launch to your first study session: install the card pack, add decks and cards, bring in Anki decks, study.
order: 3
web_path: /en/help/quick-start
app_help: help?article=quick-start
app_screens:
  - "Decks tab (first launch) — app/(tabs)/decks.tsx"
  - "First-run card — help.firstRun.* (see in-app/01-decks.md)"
verified_against: claude/user-flow-core-functions-31d44c (2026-11-07)
---

# Quick start

This page takes you to your first study session in a few minutes. For details, follow the link at
the end of each step.

<a id="first-screen"></a>
## 1. The first screen: Decks

The app opens on the **Decks** screen. On first launch you see:

- **TUS Kartları** — the ready-made pack, with a lock icon and the line "9,575 cards · 12 courses ·
  106 subdecks". It is not on your device yet; tapping it opens its introduction screen.
- The **Welcome** card — the three ways to get cards: **Unlock the TUS pack**, **Add note** and
  **Import**. It goes away by itself once you add your first own card; to close it sooner, tap the
  **×** at its top right.
- **Varsayılan** — an empty deck (its name means "Default"). Cards you add without choosing another
  deck go here. Once you have other decks it is hidden while empty (as in Anki) and comes back as
  soon as a card goes into it.

At the bottom of the screen are the **Card Browser**, **Stopwatch**, **Stats** and **Settings** buttons. At the
bottom right is the **＋** button for adding a new deck or card, and at the top right is the **⋮**
(More options) menu.

<a id="get-cards"></a>
## 2. Get some cards

You can use any or all of these three ways.

<a id="install-tus-pack"></a>
### Install the ready-made TUS pack

1. In the deck list, tap the **TUS Kartları** row.
2. Look through what the pack contains and tap **Unlock cards for free**.
3. Installing takes a few seconds. Tap **OK** on the **Package unlocked** message; you are back
   on the deck list, where the 12 subject decks and their subdecks are.

The **Add 9,575 ready-made TUS cards for free** button on the **This Deck is Empty** screen, which
appears when you open an empty deck, installs the pack too; once it is done the study screen opens
straight on **TUS Kartları**.

The pack needs no internet connection, payment or account. See [TUS card pack](17-tus-card-pack.md).

<a id="create-own-cards"></a>
### Write your own cards

1. Create a deck with **＋ › Create deck**, for example `Pharmacology`. For a subdeck, type the
   name as `Pharmacology::Antibiotics`.
2. Open the editor with **＋ › Add note**. Choose the note type (for example **Basic**) in the
   **Type:** row at the top and the deck in the **Deck:** row.
3. Type the question in the **Front** field and the answer in the **Back** field.
4. Save with the **✓** button at the top right. The fields clear, **Note added · 1 card** shows
   briefly at the top, and you can type the next card straight away. When you are done, leave with
   **‹** at the top left; tapping **✓** on the empty form closes the screen as well.

See [Adding and editing cards](08-adding-and-editing.md).

<a id="bring-anki-decks"></a>
### Bring in your Anki deck

1. Move the `.apkg` file you exported from Anki to your iPhone (AirDrop, iCloud Drive, Files).
2. In the **Files** app, tap the file and choose TusAnkiM from the share menu. Or, in TusAnkiM,
   go to **⋮ › Import › Choose File**.
3. Check the options and tap **Import**.

If you want to move your whole Anki collection, read
[Using TusAnkiM with Anki](19-using-with-anki.md#move-whole-collection) first: a collection
package replaces the cards you already have.

<a id="first-study"></a>
## 3. Study

1. In the deck list, tap a deck's **name**. The study screen opens with that deck and its
   subdecks.
2. Read the question and answer it in your head.
3. Tap **Show Answer**.
4. Depending on how well you remembered, tap **Again**, **Hard**, **Good** or **Easy**.
   If you tapped by mistake, you can undo your last answer.
5. When today's cards are done, the **Congratulations!** screen appears. Go back to the list
   with **‹ Back to Decks**.

For what the buttons mean, see [Key concepts](02-key-concepts.md#answer-buttons); for all the
tools on the screen, see [Studying](05-studying.md).

> **Different from Anki:** Tapping a deck's name starts studying straight away. To see the deck's
> summary, choose **Overview** from the row's **•••** menu.

<a id="daily-habit"></a>
## 4. A little every day

- Spaced repetition works best when you study every day. Reviews from the days you miss pile up
  and carry over to the following days.
- There is no daily limit for new cards; you decide how many new cards to open. Every new card
  comes back as a review in the following days, so plan your load with that in mind.
- For a daily reminder, choose a **Reminder time** under **Settings › Notifications**.
  See [Settings](16-settings.md#notifications).
- You can follow your progress on the **Stats** screen and your study time with the
  **Stopwatch**. See [Statistics](12-statistics.md) and
  [Stopwatch and study calendar](13-stopwatch-and-calendar.md).

<a id="protect-your-data"></a>
## 5. Protect your data

When your collection changes, the app regularly makes automatic backups on the device. These
backups stay on the same device. To guard against losing or replacing your phone, save a copy of
your collection to the **Files** app or your computer now and then with **⋮ › Export**.
See [Backups and maintenance](15-backups-and-maintenance.md).

## Related topics

- [Key concepts](02-key-concepts.md)
- [Decks](04-decks.md)
- [Studying](05-studying.md)
- [FAQ and troubleshooting](20-faq.md)
