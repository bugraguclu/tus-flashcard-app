---
id: welcome
title: What is TusAnkiM?
summary: What TusAnkiM is for, where your data is kept and how to use this guide.
order: 1
web_path: /en/help/what-is-tusankim
app_help: help?article=welcome
app_screens:
  - "Help center opening article — app/help.tsx (new)"
  - "Settings › About — app/settings.tsx (renderAbout)"
verified_against: master c6108e6 (2026-10-25)
---

# What is TusAnkiM?

TusAnkiM is a flashcard app made for people preparing for TUS, the Turkish medical specialty exam.
It uses spaced repetition: it shows you each card just before you are about to forget it. You can
write your own cards, import decks you made in Anki, or install the ready-made TUS card pack for
free.

<a id="what-you-can-do"></a>
## What you can do

- **Study:** You see the question on a card, reveal the answer and tell the app how well you
  remembered with one of four buttons. The app uses your answer to work out when the card comes
  back. See [Studying](05-studying.md).
- **Write cards:** Formatting, images, audio recordings, drawing on photos and fill-in-the-blank
  (cloze) cards are supported. See [Adding and editing cards](08-adding-and-editing.md).
- **Organize decks:** You can sort cards into subject and topic decks and subdecks, and give each
  deck its own study settings. See [Decks](04-decks.md) and [Deck options](06-deck-options.md).
- **Search and act on many cards at once:** In the **Card Browser** you can search all your
  cards and tag, flag, move or suspend them.
  See [Card Browser and search](10-browser-and-search.md).
- **Track your progress:** Statistics, your daily streak, the study calendar and the
  **Stopwatch**, which measures how long you study. See [Statistics](12-statistics.md) and
  [Stopwatch and study calendar](13-stopwatch-and-calendar.md).
- **Exchange data with Anki:** You can import and export `.apkg` and `.colpkg` packages and
  CSV/TSV/TXT files. See [Import and export](14-import-export.md) and
  [Using TusAnkiM with Anki](19-using-with-anki.md).

<a id="your-data"></a>
## Where is your data kept?

- Your cards, review history, backups and settings are stored **only on your device**. You do not
  need an account, and your cards and study history are never sent to a server. The app has no
  ads, analytics or tracking.
- The app works fully **offline**. You do not need an internet connection to study.
- **Deleting the app also deletes all of its data on the device.** Export your collection before
  you delete it.
- There is **no automatic sync** between devices. To move your cards to another device, you
  export your collection and import it on the other device.
  See [Import and export](14-import-export.md).
- The app makes automatic backups on the device. To protect yourself against losing your device,
  now and then save your collection as a `.colpkg` file with **⋮ › Export** to the **Files** app
  or to your computer. See [Backups and maintenance](15-backups-and-maintenance.md#share-backup).

> **In the web version:** There is also a preview of the app that runs in the browser
> (`tusankim.vercel.app`). There, the collection is kept in your browser's own storage and is not
> uploaded anywhere; if you clear the browser's site data, the collection is deleted too. The
> main app is the iPhone app.

<a id="tus-card-pack"></a>
## The ready-made TUS card pack

In the deck list, next to your own decks, you see an optional ready-made pack: 9,575 cards across
12 basic and clinical science subjects. The pack installs for free and does not touch your own
cards. See [TUS card pack](17-tus-card-pack.md).

<a id="important"></a>
## Good to know

- **For education only.** TusAnkiM and the cards in it are for learning and exam preparation
  only. They are not medical advice, diagnosis, treatment recommendations or clinical decision
  support. For clinical decisions, rely on current official sources and qualified healthcare
  professionals.
- **An independent project.** TusAnkiM works with Anki packages but is not part of Anki. It is not
  affiliated with or endorsed by Anki or Ankitects. Places where the app behaves differently from
  Anki are marked in this guide with **Different from Anki** notes.
- **Language:** The app is available in Turkish and English. You change the language under
  **Settings › General › Language**.

<a id="using-this-guide"></a>
## Using this guide

- In the app, the **ⓘ** button in a screen's title or the **?** button on a settings card opens a
  short explanation of that screen. The **Learn more** link below the explanation takes you to
  the matching section of this guide.
- If you are just starting, read [Key concepts](02-key-concepts.md) and then
  [Quick start](03-quick-start.md).
- If something goes wrong, see [FAQ and troubleshooting](20-faq.md). If you cannot find a
  solution there, you can write to us through the **Settings › About › Support** link. Do not put
  personal health information or passwords in a support request.

## Related topics

- [Key concepts](02-key-concepts.md)
- [Quick start](03-quick-start.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
- [Glossary](21-glossary.md)
