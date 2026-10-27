---
id: stopwatch
title: Stopwatch and study calendar
summary: Timing study with the Stopwatch, breaks, the daily goal, exam date, reminders, and sessions in the Study Calendar.
order: 13
web_path: /en/help/stopwatch
app_help: help?article=stopwatch
app_screens:
  - "Stopwatch — app/stopwatch.tsx"
  - "Stopwatch sheets — components/stopwatch/ (SubjectPickerSheet, SessionEditorSheet, StopwatchSettingsSheet, StopwatchAlertsSheet, SessionActionsMenu)"
  - "Study Calendar — app/study-calendar.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Stopwatch and study calendar

The **Stopwatch** times the study you do away from the cards (reading, question practice, mock
exams) and adds it to your daily goal. The **Study Calendar** lists your card study and stopwatch
sessions day by day. To open the Stopwatch, tap the **Study streak** card on the **Statistics**
screen; the calendar button at the Stopwatch's bottom right opens the Study Calendar.

> **Different from Anki:** The Stopwatch and the Study Calendar are TusAnkiM's own; Anki has
> nothing like them. Stopwatch sessions are not part of `.apkg` packages; they are kept in TusAnkiM
> backups.

> **In the web version:** In a wide browser window, the sidebar next to the study screen also has
> **⏱️ Stopwatch** and **Study Calendar** buttons.

<a id="stopwatch"></a>
## The Stopwatch screen
<!-- In the app: the new ⓘ in the Stopwatch header (app/stopwatch.tsx:324-341), "Learn more" link of its info sheet → this section -->

- **Ring:** Shows your total study time today and fills towards the daily goal. While the
  stopwatch runs, the subject and this session's time appear in the middle.
- **Daily Goal** and the **Start** button sit next to the ring.
- **Recent Study:** Today and the six days before it, newest day first.
- The header has a bell (reminders) and a gear (stopwatch settings); the calendar button is at the
  bottom right.

Stopwatch sessions do not appear in the Statistics charts or in the **Study time** of the
**Today** card, but they do count for the **Study streak**. See
[Study streak](12-statistics.md#streak).

<a id="start-and-break"></a>
## Starting and taking breaks

1. Tap **Start**.
2. On **What will you study?**, pick a subject from **Your plan**, **Recently studied** or
   **TUS subjects** (the TUS courses, shown with their Turkish names, plus Soru Çözümü for question
   practice and Deneme Sınavı for mock exams). For anything else, type its name in the search box
   and tap **Use as a new subject**.
3. The stopwatch starts at once.

- **Break:** Study time stops and break time starts; the ring says **On a break**. **Resume** takes
  you back to studying.
- The line under the buttons compares the time with the block length, for example
  `Study block 00:25:00 / 00:50:00`. When it is up, it reads "Study block is up — you can take a
  short break." The stopwatch never stops or pauses by itself.
- **Pass:** A subject started with **Start** continues the pass of that subject's latest session
  (1 the first time). To change it, use [Today's plan](#plan) or edit the session.

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

The timeline shows two kinds of sessions:

- **Card sessions (✓):** Created automatically when you answer cards; see
  [How card sessions are made](#card-sessions).
- **Stopwatch sessions:** Timed with the stopwatch (stopwatch icon) or added by hand (✎).

Each session card shows the subject, **Study** and **Break** times, the **Time range** and a
label. On a stopwatch session the label is **Pass N**, the pass through the subject you are on; on
a card session it is **Session N**, the Nth session of that subject that day.

The **•••** button left of the card:

- Stopwatch session: **Edit**, **Session details**, **Delete session**. Deleting is permanent; if
  it was the day's only study, the day drops out of your streak.
- Card session: **Go to this deck** (opens the deck's overview) and **Session details** (cards,
  answers, deck). Card sessions come from your answers, so they cannot be edited or deleted.

A day with no study says "No study this day!", so gaps in your streak are easy to see.

<a id="add-session"></a>
## Adding a session by hand

If you forgot to start the stopwatch, add the session afterwards:

1. Tap **Add Session** next to the **Recent Study** heading.
2. Tap **Choose a subject** and pick it; change the **Pass** if needed.
3. Set the **Date** and **Start time**. Enter the **Study time** in hours and 5-minute steps, and
   the **Break** as the total break within the session.
4. Tap **Save**.

A session must be at least a minute long and cannot end in the future; the date can be today or
earlier. A session added by hand counts that day for the **Study streak**. To change an existing
session, use **•••** › **Edit**, which opens the same sheet (**Edit session**).

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
default 08:00). The same setting is in **Stopwatch settings** behind the gear button.

<a id="plan"></a>
## Today's plan

The row under today's sessions shows the subject you plan to study today:

- **Left:** The time still needed to reach your daily goal. Once you reach it, it says
  **Goal reached ✓**.
- **Start:** Starts the planned subject in one tap. If another subject is running, **Switch
  subject** asks first; **OK** saves the running session and starts the plan.

To set or change the plan, tap the gear on the row or the "What will you study today?" card. On
**Today's plan**, choose the **Pass** (1–20) first, then tap the subject. **Remove plan** clears it;
while you have no plan, the next subject you start becomes the plan.

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

On the **Reminders** sheet (bell button), the **Study and break reminders** switch (on by default)
controls notifications. While it is on, the iPhone shows "Study block is over" when a block ends and
"Break is over" when a break ends; tapping the notification opens the Stopwatch.

- You get one notification per block, timed from when you started the block or came back from the
  break. If you keep studying past the end, no second notification follows.
- Turning the switch on asks for notification permission. If notifications are turned off for the
  app, the sheet says so and shows **Open Settings**.
- Even with reminders off, the line under the buttons tells you when a block is over.

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

Open it with the calendar button at the Stopwatch's bottom right, or the
"All your sessions are in the Study Calendar ›" link under the timeline.

- At the top are the **Weekly** / **Monthly** views and the previous and next arrows. Tap a day to
  scroll the list below to it; tap a dimmed day of the neighbouring month to switch to that month.
- Under each day is its total study time as `H:MM`; see [Day totals](#day-totals).
- Below the calendar are the sessions of the month or week shown, oldest day first.
- The **•••** menu: **Go to this session** on card sessions (opens the deck's overview);
  **Session details** and **Open this day in the weekly view** on all sessions; **Delete session**
  on stopwatch sessions. Editing is only on the Stopwatch screen, for the last seven days.
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
