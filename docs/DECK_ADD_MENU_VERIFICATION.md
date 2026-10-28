# Deck add menu verification

Date: 2026-10-28.

## Change

Desteler keeps one green ＋ button and its existing three actions: Create filtered
deck, Create deck and Add note. The menu now uses the stopwatch tools' presentation:
a transparent native Modal with a fade, a 60% black backdrop, three wide cards and
the same button at the same position to close it. Tapping the backdrop also closes it.
The orange study tools button stays on Kronometre and Çalışma Takvimi.

The trigger clears the measured bottom bar and iPhone bottom safe area. Its list
footer keeps the original single-button clearance. On iOS, selecting an action
waits for the menu's onDismiss before opening the existing form or editor, so UIKit
does not receive two overlapping modal presentations.

This is a TusAnkiM presentation change; it changes no Anki-facing capability,
scheduling, collection storage or action destination.

## Verification

- `npm run quality`: TypeScript, 241 passing test files / 2539 passing tests,
  2 skipped files / 5 skipped tests, iOS configuration and Anki source registry.
  The first concurrent build/test run exceeded the 5-second limit in the two
  33,000-card reservation tests; the full quality command passed when run separately.
- `npm run build:web -- --output-dir /tmp/tus-deck-add-menu-web`: production export,
  27 routes. The first attempt raced an unrelated import-screen refactor and could
  not resolve TextImportOptions; rebuilding after that file was present passed.
- Isolated Chromium contexts, Turkish locale, production bundle at 320×568,
  390×844 and 1024×768: exactly one ＋ trigger and no study-tools trigger; all three
  cards fit above ＋ without horizontal clipping; both ＋ and the backdrop close the
  menu; Create Deck accepts a name and creates a visible deck, Create Filtered Deck
  opens its existing form, and Add Note opens the editor. Back returns to Desteler
  with the add menu closed. No browser runtime errors occurred.
- The 390×844 open menu was visually inspected after its fade completed.
- `git diff --check`.

## Native limitation

The computer-use runtime cannot initialize because this workspace's writable root
is a symlink. Run the focused Deck add menu row in IOS_RELEASE_CHECKLIST.md on an
iPhone before release, including native backdrop/button dismissal, the handoff to
each form, back gestures, VoiceOver, safe areas and larger text. Browser coverage
does not establish native interaction coverage.
