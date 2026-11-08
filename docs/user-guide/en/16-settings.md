---
id: settings
title: Settings
summary: Language and theme, how the study screen looks, when the day starts, reminders, tap/swipe and keyboard controls, accessibility.
order: 16
web_path: /en/help/settings
app_help: help?article=settings
app_screens:
  - "Settings — app/settings.tsx"
  - "Settings › Controls › Keyboard — components/settings/KeyboardSettingsSection.tsx"
verified_against: claude/zen-tu-bbdc99 (2026-11-08)
---

# Settings

**Settings** controls how the app looks and how the study screen behaves. Deck rules such as daily
limits, learning steps and the scheduler are not here; they live in
[Deck options](06-deck-options.md).

<a id="open-settings"></a>
## Opening Settings

- Tap **Settings** at the bottom of the **Decks** screen.
- While studying, when no card is ready right now (**That’s All for Now!**), the
  **Learn-ahead settings** button also opens Settings.

Settings has eight categories. Tap one to open its page; the back arrow at the top left returns
you to the category list.

| Category | What's in it |
| --- | --- |
| **General** | Language, theme, adding-cards preferences |
| **New study screen** | How the study screen looks, the toolbar, answer buttons |
| **Reviewing** | When the day starts, learn ahead, timebox, audio |
| **Notifications** | The daily study reminder |
| **Controls** | Tap zones, swipe gestures, the Tools button, keyboard |
| **Accessibility** | Zoom, button size, tap timings |
| **Data Management** | Backups, import and export, maintenance |
| **About** | Version, help, privacy policy, support |

> **In the web version:** In a wide window, the sidebar next to the study screen also has a
> **Settings** button.

<a id="search-settings"></a>
## Searching settings

The **Search…** box above the category list searches category names, the headings listed under
them and the names of the settings on each page. Typing "theme" or "keyboard" finds the right
category. Type the name of a setting (for example "timebox" or "playback speed") and its category
is listed with the matching setting named under it. Case and accents do not matter, and each word
you type has to match the start of a word: "card" finds "Card zoom", "ard" finds nothing.

<a id="saving"></a>
## Saving your changes

Changes in Settings are previewed at once: switch the theme or language and the screen changes
immediately. But nothing is stored until you tap **Save**.

1. Change the settings.
2. Tap **Save** at the top right. The button briefly shows **✓ Saved**.

If you try to leave without saving, **Unsaved changes** asks first. **OK** discards your changes
and leaves; **Cancel** keeps you on the page.

- On iPhone, swiping back from the left edge of the screen closes Settings entirely; with unsaved
  changes the screen comes back and asks first. To go from a category back to the list, use the
  back arrow at the top left.
- **Restore default settings** and the **Data Management** commands do not wait for **Save**; they
  run as soon as you confirm.
- Turning on **Notifications** asks for permission right away; your choice is still stored with
  **Save**.
- Settings are stored with the collection on your device and are part of backups. Restoring a
  backup also restores the settings it contains. If you restore one on the **Backups** screen you
  opened from Settings (or import a collection package), Settings shows the restored settings when
  you come back, keeping only the changes of your own that you had not saved yet. **Save** never
  writes the old values back over the restored ones.

<a id="general"></a>
## General

<a id="language"></a>
### Language

**System**, **Türkçe** or **English**. With **System**, the app is Turkish when your iPhone's
language is Turkish and English for any other language. The app starts in Turkish the first time
you open it. Study reminders use the same language.

<a id="theme"></a>
### Theme

**System**, **Light** or **Dark** (default: **Light**). **System** follows your iPhone's light/dark
appearance. The chosen theme also applies to the keyboard, system sheets and the status bar.

<a id="text-size"></a>
### Text size

Drag the slider, or tap anywhere on its track: it settles on **Small**, **Default** (the default),
**Large** or **Extra large**. While you drag, only the sample below it changes; when you lift your
finger the whole app takes the new size, and **Save** keeps it. Menus, lists, buttons and text
boxes use this size; headings and big numbers grow a little less than body text. Screens lay
themselves out for it: on Decks, a long deck name that no longer fits on one line with its counts
gets the counts below it, in the same columns, so a word is never broken in the middle. Text inside
fixed-size drawings, such as the Stopwatch ring, stays at its designed size.

Card content is not affected; use [Card zoom](#accessibility) under **Accessibility** for that.
Your iPhone's own text size (Settings › Display & Brightness › Text Size) adds on top of this step.

<a id="editing-preferences"></a>
### Editing and the card browser

| Setting | Default | What it does |
| --- | --- | --- |
| **Deck for new cards** | **Current deck** | When the add-card screen is not opened from a deck (for example from the **+** button on Decks), this picks its starting deck. **Current deck** is the deck you studied last; **Default** is the deck named "Varsayılan". |
| **Paste clipboard images as PNG** | Off | Images you paste into the editor are always added to the card; stored as PNG when on, as JPEG when off. |
| **Never type answers** | Off | Cards that ask you to type the answer are shown as normal cards; no keyboard opens. |
| **Type answer into the card** | Off | Puts the typing box where the card's template places it, so the card's own styling applies. Shown only while the setting above is off. |
| **Focus type-in-answer** | On | Selects the box and opens the keyboard when a type-in card appears. |
| **Show filenames** | Off | Shows audio file names in the question and answer text of the **Card Browser** list. This row sits in an untitled card at the bottom of the General page. |

For typing answers, see [Studying](05-studying.md).

<a id="new-study-screen"></a>
## New study screen

This page sets how the study screen looks. The **Use new study screen** switch at the top (off by
default) turns on the redesigned screen: a new toolbar with remaining counts, a timer and an
estimated finish, and answer feedback that moves left (**Again**) or right (the other buttons).
Every other option on the page, except **Toolbar position**, also applies to the classic screen.

| Setting | Default | What it does |
| --- | --- | --- |
| **Frame style** | **Card** | **Card** shows the card on a framed surface; **None** uses the screen edge to edge. |
| **Show remaining card count** | On | Shows the new, learning and review counts. |
| **Show play buttons on cards with audio** | On | Adds a play button next to the sounds in a card. |
| **Show answer feedback** | On | Shows a red cross for **Again** and gives a light vibration on every answer. |
| **Center align** | Off | Places the card content in the vertical middle of the screen. |
| **Show deck title** | On | Shows the name of the deck you are studying at the top. |
| **Show remaining time** | Off | Estimates how long is left at your current pace. |
| **Show toolbar** | On | Shows back, the deck picker, the counts and card actions. When off, open the menus with swipe gestures or the **floating Tools button**; turn either on in **Controls**. |
| **Toolbar position** | **Top** | On the new screen you can move the toolbar to the **Bottom**. |
| **Show answer buttons** | On | When off, you answer with tap zones or swipes. One of them must be on in **Controls** before you can turn this off. |
| **Show next review time above answer buttons** | On | Each button shows when the card would come back. |
| **Hide Hard and Easy buttons** | Off | Only **Again** and **Good** are shown. |
| **Auto advance** | Off | See below. |

<a id="auto-advance"></a>
### Auto advance

The **Auto advance** switch lets cards move on without you. How long to wait and what happens when
the time is up are set per deck in **Deck Options › Auto Advance**: how long to show the question
and the answer (in seconds) and the action to take. If those times are 0 (the starting value),
nothing happens even with the switch on. The countdown waits while a menu is open, while the app
is in the background, or while you draw on the card. See [Deck options](06-deck-options.md#auto-advance).

<a id="reviewing"></a>
## Reviewing

<a id="next-day-starts"></a>
### Start of next day

The app's day changes at this hour, not at midnight (default **04:00**). Cards you study before
this hour count towards the previous day. Daily limits, buried cards coming back, "today" in the
statistics and the count in your reminder all follow this hour. Pick an hour between 01:00 and
23:00. If you often study late at night, choose an hour after you usually go to sleep.

<a id="learn-ahead"></a>
### Learn ahead limit

Learning cards come back after short steps (for example in 10 minutes). When nothing else is left
to study, learning cards whose step ends within this many minutes are shown without waiting
(default **20 mins**, 0–120 in steps of 5). **0** turns this off: learning cards appear only when
their time comes.

If cards are waiting longer than that, the study screen says **That’s All for Now!** and shows a
countdown. Its **Study Now** button brings the waiting learning cards right away; the
**Learn-ahead settings** button opens Settings, where you go to the **Reviewing** page.

<a id="timebox"></a>
### Timebox time limit

Splits your study into blocks of minutes (default **0**, which is off). If you enter 25, the first
card you answer after 25 minutes opens the **Timebox** window, which tells you how many cards you
studied in that block. **Continue** starts a new block; **Finish** takes you to Decks. The time is
measured by the clock from the start of the block; switching to another deck starts a new block.

<a id="study-audio"></a>
### Screen and audio

| Setting | Default | What it does |
| --- | --- | --- |
| **Keep screen on** | Off | The iPhone screen does not dim while the study screen is open. |
| **Automatically play audio** | On | Sound in a card plays by itself when the card opens. To turn autoplay off for one deck, use that deck's **Deck Options › Audio**. |
| **Audio playback speed** | 1.0x | 0.75x–2.0x. Applies to decks using the **Default** preset and to decks without a speed of their own. A preset's own speed is set in **Deck Options › Audio**. |
| **Interrupt audio when answering** | On | Showing the answer or moving to the next card stops the sound file or text-to-speech still playing. When off, the sound file plays to its end and the new side’s sounds and speech wait for it. Replaying audio or leaving study stops it. |

<a id="notifications"></a>
## Notifications
<!-- In the app: Settings › Notifications group ? button (new, app/settings.tsx:1236) → the sheet's "Learn more" link → this section -->

Every day at the time you choose, TusAnkiM sends a reminder if reviews are due:
**Time to study — 12 reviews are waiting.** Tapping it opens Decks.

- **Notifications:** turns the reminder on or off (on by default).
- **Notify when:** **When reviews are waiting** (at least one card; the default), a limit such as
  "More than 10…" (10, 25, 50, 75, 100, 150, 200 or 500), or **Never notify**. The limit must be
  passed: "More than 10" means at least 11 cards.
- **Reminder time:** type the hour and the minute (default 09:00). Shown only while notifications
  are on.

Good to know:

- Only cards in the **review** state are counted. New cards and cards in a learning step are not
  part of the reminder; if no reviews are due, no reminder is sent that day.
- Reminders are planned a few weeks ahead and recalculated every time you open or leave the app, so
  the number in the reminder reflects your latest study.
- After a fresh install, your iPhone may deliver these reminders quietly, to Notification Center
  only. For banners and sound, allow them in **iPhone Settings › Notifications › TusAnkiM**. Sound,
  vibration, lock-screen display and Focus modes are managed there too; the app has no separate
  vibration setting. The app icon never shows a count badge.
- If you turn on **Notifications** while notification permission is off, the app points you to
  iPhone Settings with an **Open Settings** button.
- [Stopwatch](13-stopwatch-and-calendar.md) block reminders use the same notification permission.

> **In the web version:** Reminders arrive only while the app is open in a browser tab (the tab can
> be in the background). The browser asks for permission when you turn on **Notifications**; if no
> reminder arrives, turn the switch off and on again and allow the browser's request. If your
> browser does not support site notifications, you see **Notifications not supported**.

<a id="controls"></a>
## Controls
<!-- In the app: Settings › Controls › Taps and swipes group ? button (app/settings.tsx:1300) → the "Customize taps and swipes" window's "Learn more" link (new) → this section -->

This page sets what taps and swipes do on the study screen. Your choices apply only while
studying. The **?** button next to **Taps and swipes** opens a short guide.

<a id="tap-zones"></a>
### Tap zones

**9-point touch** (on by default) divides the card surface into a 3×3 grid. With **Card side** you
set the **Question** and **Answer** sides separately; tap a zone and pick an action from the list.

- By default every zone on the question side shows the answer. On the answer side the left column
  answers **Again**, the center column does nothing and the right column answers **Good**.
- Actions you can choose: show the answer, the four answer buttons, undo the last action, add a
  note, edit the note, mark it, bury or suspend the card, replay audio, open the flag picker or the
  tools, return to decks.
- While the question is showing, an answer action first reveals the answer; a rating is only given
  once the answer is visible. That way you never rate an answer you have not seen.
- Links, typing boxes and audio buttons inside the card still receive their own taps.

<a id="swipes"></a>
### Swipe gestures

**Enable swipe gestures** (off by default) lets you give each of the four directions an action.

- **Presets:** **Balanced for iPhone** opens the tools with a left swipe and returns to decks with
  a right swipe. **Fast answers** gives left **Again**, right **Good**, up **Easy** and down
  **Hard**. After choosing a preset you can change each direction.
- **Up and down swipes work when you start them at the left or right edge of the screen.** In the
  middle of the card a vertical swipe keeps scrolling long cards. Left and right swipes work
  anywhere on the card.
- **Swipe sensitivity** (1%–200%, default 100%): a higher value also catches short movements; a
  lower value needs a longer, deliberate swipe.

If **Show answer buttons** is off and you turn off both tap zones and swipes, the answer buttons
come back by themselves, so there is always a way to answer. If you change the zones' and
directions' actions until none of them answers, the page warns **No way left to answer cards**, and
**Save** then offers to save with the answer buttons shown again. Should such a setting arrive from
a backup or an older version, the study screen shows the answer buttons anyway.

**On-screen control › Show the floating Tools button** adds a fixed **Tools** button to the study
screen for one-handed use. Pick the left or right side with **Button position**.

<a id="keyboard"></a>
### Keyboard

The keys used while studying with a physical keyboard connected to your iPhone (for example a
Bluetooth keyboard):

| Action | Default key |
| --- | --- |
| **Show answer** | Space |
| **Answer again** / **Answer hard** / **Answer good** / **Answer easy** | 1 / 2 / 3 / 4 |
| **Replay audio** | R |
| **Bury card** | - |
| **Suspend card** | @ |
| **Mark note** | * |

To change a key:

1. Tap **Change** on its row; the box shows **Press a key**.
2. Press the new key on the keyboard. To give up, tap **Cancel** or press Esc.
3. Tap **Save**.

Give each key to only one action; if two actions share a key, the shortcuts go back to their
defaults when you save. **Reset shortcuts** puts every key back to its default.

Some keys are fixed: Esc leaves study, Z or U undoes the last action (unless you gave those letters
to another action), and while Space is the show-answer key, Enter does the same. Full list:
[Studying](05-studying.md#keyboard-shortcuts).

> **In the web version:** Ctrl/Cmd+Z undoes the last action, and Ctrl/Cmd+1–7 changes the card's
> flag.

<a id="accessibility"></a>
## Accessibility

| Setting | Default | What it does |
| --- | --- | --- |
| **Card zoom** | 100% | Scales the whole card between 50% and 200%. |
| **Image zoom** | 100% | Scales the images in cards separately, 50%–200%. |
| **Answer button size** | 100% | Makes the answer buttons up to 175% larger. |
| **Show large answer buttons in two rows** | Off | Puts the four buttons in two rows, which makes large buttons easier to hit. |
| **Show answer long-press time** | 0 ms | Above 0 you must hold **Show Answer** that long, which prevents revealing by accident. Tap zones are not affected. |
| **Double tap time interval** | 200 ms | Ignores a second tap that comes within this time after an answer (0–1000 ms). |
| **Font scaling** (Card browser) | 100% | Scales the text in the **Card Browser** list, 75%–175%. |

The app's own text also follows your iPhone's text size setting, and VoiceOver reads the names of
the buttons.

<a id="data-management"></a>
## Data Management

The commands on this page run without waiting for **Save**.

- **Automatic backup** (on by default): if the collection changed, the app takes a backup about
  every half hour. **Manage backups** lists your backups and restores them. See
  [Backups and maintenance](15-backups-and-maintenance.md#automatic-backups).
- **Export data** and **Import decks and data** open the full-screen export and import screens. See
  [Import and export](14-import-export.md).
- **Check database** looks for problems without changing anything; **Repair and optimize** first
  shows what it found and, once you agree, backs up and repairs. See
  [Checking the database](15-backups-and-maintenance.md#check-database) and
  [Repairing](15-backups-and-maintenance.md#repair).
- **Reset collection** deletes your cards, decks and your whole study history; it takes a safety
  backup first. See [Resetting the collection](15-backups-and-maintenance.md#reset-progress).

<a id="about"></a>
## About

- **Help and user guide** opens this guide. The guide ships with the app and needs no internet.
- **Privacy Policy** and **Support** open in your browser. Do not put personal health data or
  passwords in a support request.
- The group's description shows the app's version number; mention it when you ask for support.

TusAnkiM is an independent project; it works with Anki packages but is not affiliated with Anki or
Ankitects.

<a id="restore-defaults"></a>
## Restoring default settings

The **↺ Restore default settings** button at the bottom of the **General** page runs right after
you confirm (no **Save** needed):

- The settings on every page return to their starting values: language **Türkçe**, theme
  **Light**, text size **Default**, reminder at 09:00, keyboard shortcuts on their default keys.
- [Deck options](06-deck-options.md#presets) do not change: the **Default** preset's daily
  limits, learning steps and interval settings, FSRS and the collection-wide choices such as how
  daily limits are counted all stay as they are. Only **Automatically play audio** and **Audio
  playback speed**, which this screen shows as well, go back to their starting values (on, 1.0x).
- Your cards, decks and study history do not change.

## Related topics

- [Studying](05-studying.md)
- [Deck options](06-deck-options.md)
- [Backups and maintenance](15-backups-and-maintenance.md)
- [Shortcuts and automation](18-shortcuts-and-automation.md)
