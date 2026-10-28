---
id: stopwatch
title: Stopwatch and study calendar
summary: Timing study with the Stopwatch, breaks, the daily goal, exam date, reminders, and sessions in the Study Calendar.
order: 13
web_path: /en/help/stopwatch
app_help: help?article=stopwatch
app_screens:
  - "Stopwatch — app/stopwatch.tsx"
  - "Stopwatch sheets — components/stopwatch/ (StudyStartSheet, StudyPickers, SessionEditorSheet, RunningNoteSheet, StopwatchSettingsSheet, StopwatchAlertsSheet, SessionActionsMenu)"
  - "Study Calendar — app/study-calendar.tsx"
verified_against: kronometre-screen-functions (2026-10-28)
---

# Stopwatch and study calendar

The **Stopwatch** times the study you do away from the cards (reading, question practice, mock
exams) and adds it to your daily goal. The **Study Calendar** lists your card study and stopwatch
sessions day by day. Open the Stopwatch with the **Stopwatch** button in the bottom bar of the
**Decks** screen, or by tapping the **Study streak** card on **Statistics**; the calendar button in
the Stopwatch's header opens the Study Calendar.

> **Different from Anki:** The Stopwatch and the Study Calendar are TusAnkiM's own; Anki has
> nothing like them. Stopwatch sessions are not part of `.apkg` packages; they are kept in TusAnkiM
> backups.

> **In the web version:** In a wide browser window, the sidebar next to the study screen also has
> **⏱️ Stopwatch** and **Study Calendar** buttons.

<a id="stopwatch"></a>
## The Stopwatch screen
<!-- In the app: the new ⓘ in the Stopwatch header (app/stopwatch.tsx:324-341), "Learn more" link of its info sheet → this section -->

- **Ring:** Shows your total study time today and fills towards the daily goal. **Daily Goal** and
  the **Start** button sit next to it.
- **While the stopwatch runs**, the top changes: **Today** and **Goal** with a bar that fills
  towards the goal, the subject, this session's study time as a large clock, and the **Finish** and
  **Break** buttons.
- **Recent Study:** Today and yesterday, each day's latest session first. Earlier days are one tap
  away on the **Study Calendar** card at the bottom of the list.
- The header has a bell (reminders), a calendar (Study Calendar) and a gear (stopwatch settings);
  the orange study tools button is at the bottom right.

Stopwatch sessions do not appear in the Statistics charts or in the **Study time** of the
**Today** card, but they do count for the **Study streak**. See
[Study streak](12-statistics.md#streak).

<a id="start-and-break"></a>
## Starting and taking breaks

1. Tap **Start**.
2. On **Start Studying**, tap **Subject**, pick the subject in the grid and tap **Close**. The grid
   has Karışık (mixed) and the TUS courses, shown with their Turkish names, plus any other subject
   you have used. For a subject not in the list, type its name in the box under the grid and tap
   **Choose**.
3. Tap **Type** and pick one: **Pass 1**–**Pass 8**, past TUS questions, question practice, prep
   course, video lesson or mock exam. The **Search** box above filters the list.
4. Tap **Start**; the stopwatch starts at once.

The sheet opens on the subject and type you last started (Karışık and **Pass 1** the first time).
Choosing a subject continues its pass from that subject's latest "Pass N" session.

- **Break:** Study time stops and break time starts; the break's time appears under the large
  clock. **Resume** takes you back to studying.
- The running session has its own card at the top of **Today**: its **Study** and **Break** times,
  **Session time** and how far the study block has gone, for example **60% · 20 min left**. Once
  the block is over it says by how much (**15 min over**); on a break the same line counts the
  break. The stopwatch never stops or pauses by itself.
- **Study note:** The book button left of the running session's card adds a note (up to 100
  characters). It shows on the card in place of "Happy studying" and is saved with the session.

<a id="finish"></a>
## Finishing

Tap **Finish** to see a confirmation with your study and break totals; **OK** saves the session,
**Cancel** keeps the stopwatch running. The saved session appears under **Today** and in the Study
Calendar, and counts for the daily goal and the **Study streak**.

Sessions shorter than a minute are not saved: on **Short session**, **OK** resets the stopwatch
without saving. If you do not want to keep a longer session, finish it and then delete it (see
[Sessions](#sessions)).

<a id="sessions"></a>
## Recent Study and sessions

The timeline shows two kinds of sessions, both marked ✓ on the line:

- **Card sessions:** Created automatically when you answer cards; see
  [How card sessions are made](#card-sessions).
- **Stopwatch sessions:** Timed with the stopwatch or added by hand; **Session details** says
  which.

Each session card shows the subject, a type label, the **Study** and **Break** times (with the
number of breaks), its note if it has one, and the **Time range**. On a stopwatch session the label
is the type you chose (**Pass 2**, question practice...); on a card session it is **Session N**,
the Nth session of that subject that day.

The **•••** button left of the card:

- Stopwatch session: **Edit**, **Session details**, **Delete session**. Deleting is permanent; if
  it was the day's only study, the day drops out of your streak.
- Card session: **Go to this deck** (opens the deck's overview) and **Session details** (cards,
  answers, deck). Card sessions come from your answers, so they cannot be edited or deleted.

If you did not study yesterday, it says "No study this day!", so a gap in your streak is easy to
see.

<a id="add-session"></a>
## Adding a session by hand

If you forgot to start the stopwatch, add the session afterwards:

1. Tap **Add Session** next to the **Recent Study** heading; **Add a Past Session** opens.
2. Choose the subject and type with **Subject** and **Type**, as when you start the stopwatch.
3. Tap **Start** and **End** to pick the date and time. The end opens on now and the start an hour
   earlier.
4. Enter the **Breaks** and, minute by minute, the **Total Break**; add a **Study Note** if you like
   (up to 100 characters; the counter shows how many are left).
5. Tap **Add Session**.

The study time is the time from start to end less the total break. A session cannot end in the
future or be longer than 24 hours; its breaks cannot be longer than that span and must leave at
least a minute of study. Anything wrong is shown under the button. A session added by hand counts
that day for the **Study streak**.

To change an existing session, use **•••** › **Edit**, which opens the same sheet (**Edit Your
Session**). If you leave its start, end and breaks alone, the times it measured are kept to the
second.

<a id="daily-goal"></a>
## Daily goal and total time

The ring's **Total Study Time** for today adds up:

- the time spent on card answers (each answer counted up to the **Maximum answer time**),
- the stopwatch sessions you saved,
- a stopwatch started today that is still running.

Cards you answer while the stopwatch runs are not counted twice. On Statistics, **Today** ›
**Study time** counts card answers only and follows the selected deck, so the total here is usually
higher. The day changes at the **Start of next day** hour.

Change the **Daily Goal** in half-hour steps with **−** and **+** next to the ring (00:30 to 16:00,
default 08:00). The same setting is in **Stopwatch settings** behind the gear button. While the
stopwatch runs, today's total and the goal are in **Today** and **Goal** at the top, with the bar
under them showing your progress.

<a id="plan"></a>
## Today's plans

The plans from **Study Planning** that fall on today appear as cards under today's sessions:

- A card shows the subject, the type and the time **Left**: the planned time less what you have
  studied of that subject today, a running stopwatch included. Once it is covered, it says
  **Done ✓**. The plan's hours are under the card.
- **▶** starts the stopwatch on the plan's subject and type. If another subject is running,
  **Switch subject** asks first; **OK** saves the running session and starts the plan. While you
  study the same subject, the button is hidden.
- The gear left of the card, and the card itself, open **Study Planning**.

With no plans at all, today shows **You have no study plan!**; **Create** opens the plan wizard.
With plans for other days only, the card says **Nothing planned for today!** and **Plans** opens
them.

<a id="exam-date"></a>
## Exam date

The hourglass label to the right of the **Today** heading counts down to your exam. Without a date
it says **Add exam date**; tap it to open **Stopwatch settings** and pick the **Exam date**. The
label then shows, for example, **45 days left**, and **Exam day** on the day itself. Days are
counted on the calendar. **Remove** clears the date; once the exam date has passed, the label goes
back to **Add exam date**.

<a id="reminders"></a>
## Study and break reminders
<!-- In the app: Stopwatch › bell button in the header › Reminders sheet (components/stopwatch/StopwatchAlertsSheet.tsx) -->

Set the block lengths in **Stopwatch settings** (gear button):

- **Study block:** 50 min by default (5–180 min). Going below the shortest turns it **Off**.
- **Break length:** 10 min by default (5–60 min), or **Off**.

These lengths also drive the progress bar on the running session's card; with one **Off**, its bar
is not shown.

On the **Reminders** sheet (bell button), the **Study and break reminders** switch (on by default)
controls notifications. While it is on, the iPhone shows "Study block is over" when a block ends and
"Break is over" when a break ends; tapping the notification opens the Stopwatch.

- You get one notification per block, timed from when you started the block or came back from the
  break. If you keep studying past the end, no second notification follows.
- Turning the switch on asks for notification permission. If notifications are turned off for the
  app, the sheet says so and shows **Open Settings**.
- Even with reminders off, the running session's card tells you when a block is over.

> **In the web version:** Reminders arrive only while the app is open in a browser tab; the browser
> asks for permission.

<a id="background"></a>
## When you leave the app

The stopwatch keeps running if you leave the screen, lock the phone or close the app; the time is
worked out from when it started, so nothing is lost. If you are on a break, break time keeps
counting too.

- Nothing outside the Stopwatch screen shows that it is running, and it never stops by itself. If
  you forgot to finish, finish the session and correct its time with **•••** › **Edit**.
- A session belongs to the study day it started on.
- Saved sessions and your stopwatch settings are included in TusAnkiM backups; a stopwatch that is
  still running is not. See [Backups and maintenance](15-backups-and-maintenance.md).

<a id="study-calendar"></a>
## Study Calendar
<!-- In the app: the new ⓘ in the Study Calendar header (app/study-calendar.tsx:327-334), "Learn more" link of its info sheet → this section -->

Open it with the calendar button in the Stopwatch's header, or the **Study Calendar** card under
the timeline.

- At the top are the **Weekly** / **Monthly** views and the previous and next arrows. Tap a day to
  scroll the list below to it; tap a dimmed day of the neighbouring month to switch to that month.
- Under each day is its total study time as `H:MM`; see [Day totals](#day-totals).
- Below the calendar are the sessions of the month or week shown, oldest day first.
- The **•••** menu: **Go to this session** on card sessions (opens the deck's overview);
  **Session details** and **Open this day in the weekly view** on all sessions; **Edit** and
  **Delete session** on stopwatch sessions.
- The chart icon at the top right opens **Statistics**; the orange button at the bottom right
  opens the Stopwatch.

A stopwatch that is still running is added to the calendar once you finish it.

<a id="card-sessions"></a>
## How card sessions are made

Card sessions are made from your answers automatically:

- Answers are grouped by day and by top-level deck: a card in `Pharmacology::Autonomic` goes into a
  "Pharmacology" session. Cards answered in a filtered deck or Custom Study count under their own
  deck.
- If more than 30 minutes pass between two answers, a new session starts.
- **Study** is the time spent on answers (each counted up to the **Maximum answer time**);
  **Break** is the idle time between answers within the session.
- Answers you give during a saved stopwatch session count inside that session and do not show up as
  a separate card session.

Example: you answered Pharmacology cards between 09:00 and 09:40 and spent 25 minutes on the
answers in total. The session shows **Study 25m** and **Break 15m**.

<a id="day-totals"></a>
## Day totals

The time under each day in the calendar is the sum of that day's **Study** times from card sessions
and stopwatch sessions; breaks are not included. On Statistics, the **Reviews › Time** chart counts
card answers only. Dimmed days of neighbouring months show no total.

## Related topics

- [Statistics](12-statistics.md)
- [Studying](05-studying.md)
- [Key concepts](02-key-concepts.md#study-day)
- [Backups and maintenance](15-backups-and-maintenance.md)
