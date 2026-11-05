# Deck name drag verification

Date: 2026-11-05.

Holding a movable deck name in Desteler for 450 ms starts the existing handle's
move/reorder flow, including the floating preview, destination feedback, hover
expansion and edge scrolling. A short tap still opens study. Movement before the
hold cancels it and allows native list scrolling; termination cancels an active
move. Filtered and protected catalog deck names retain the existing study button.
This is TusAnkiM presentation; the hierarchy and storage operations are unchanged.

## Automated verification

- `npm run quality`: passed (exit 0); TypeScript, 275 passing test files / 2909
  passing tests, 2 skipped files / 5 skipped tests, iOS configuration and Anki
  source registry.
- `npx vitest run lib/deckNameButton.test.ts lib/deckDropTarget.test.ts`: 25 passed.
  The name-button tests cover short tap, hold, moving beyond the button, final
  drop coordinates, stationary release, scrolling before the hold, responder
  termination, re-rendering, unmount cleanup, protected/filtered fallback and
  native accessibility / web keyboard activation.
- `npm run build:web -- --output-dir /tmp/tus-deck-name-web`: passed.
- Production web in an isolated Chromium profile, Turkish, 390 × 844: create two
  test decks; short-click a name to study; return, hold the name and release without
  moving (preview appears, study does not open); hold again, drag outside the name
  onto the other deck, verify the “alt destesi olacak” feedback and release. The
  moved deck hides when its parent collapses, and the relationship survives a full
  reload. Enter on the name still opens study. No browser runtime errors.
- The active-drag screenshot was visually inspected; the existing floating preview
  and subdeck destination are visible on the phone-width layout.

## Native verification pending

An iPhone 17 Pro simulator running iOS 26.4 is booted, but the computer-use runtime
cannot initialize: the configured writable project root is a symbolic link.
Consequently no native gesture, VoiceOver or larger-text smoke is claimed here.
Run only the Deck name drag row in `IOS_RELEASE_CHECKLIST.md` on iPhone before
release. Browser and deterministic coverage do not establish native scroll/gesture
handoff coverage.
