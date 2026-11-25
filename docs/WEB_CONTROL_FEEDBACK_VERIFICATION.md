# Web control feedback verification

Verified 2026-11-25, on desktop (1440 points, dark) and phone-width (390 points, light) windows.

## What changed

Hover tint and the keyboard focus ring follow what the learner sees, not the invisible press
area around it:

- `focusFaceProps` (`components/ui/focusFace.ts`) marks the visible face of a control whose press
  area is larger: a Study Calendar or Statistics week-strip day (`StudyDayBox`), a standalone
  `Checkbox`, the floating buttons, SearchField's clear circle, the recorder's
  pause/resume/redo circle and the card browser's edit pencil. A passive checkbox inside
  `CheckRow` stays unmarked, so its whole row keeps the feedback.
- The card browser's pencil wore a 44-point ring that ran past the card's edge and over the flag
  under it. Its 24-point slot is now the face, and the row's status icons sit 4 points lower.
- Chips round the outer corners of their separate body and remove targets. `AppSwitch` rounds its
  web input and drops React Native Web's second thumb halo, so one ring marks the switch.
- PasswordField's show/hide is the kit's round `IconButton`.
- The running stopwatch's message row repeated the named note button as an unnamed Tab stop. It
  now leaves Tab order and the accessibility tree on web too (it stays clickable). Every timeline
  card's side button is painted above the timeline node, which hid the right edge of its ring.
- A card field's editor is a same-origin frame. The page never sees its keys or presses, and a
  frame never matches `:focus` from outside, so a focused field had no ring and Tab out of a
  field left the next control without one. The page now follows focus into and out of frames
  (`frameFocusRing` in `lib/webKeyboardNavigation.ts`): the field's row (`fieldRowProps` on the
  `RichTextEditor` frame) wears the ring after Tab, a click into a field drops it, and Tab out of
  a field shows it on the next control.

Press areas, tab stops (apart from the stopwatch duplicate) and what each control does are
unchanged. On iPhone the markers are empty objects and nothing changes.

## Browser evidence

A Playwright script drove headless Chromium through the routed web app with real Tab presses on
a collection imported from `test/fixtures/anki-26.09-roundtrip-legacy.apkg`. At every Tab stop it
found the element wearing the ring (face, field row, list row or the control) and checked that
the ring was drawn, that no scrolling or rounded ancestor cut it, that it lay inside the window,
and that nothing painted over the control. It covered `/decks`, `/stats`, `/settings` and its
eight sections, `/browser`, `/editor`, `/stopwatch`, `/study-calendar`, `/study-plans`, the
Detailed Plan wizard, `/study-analysis`, `/import`, `/export`, `/catalog`, `/backups`,
`/note-types`, `/deck-options`, `/empty-cards`, `/account`, `/study-clear`, `/sign-in` and `/help`
(about 1,300 Tab stops across both widths).

Before the fixes it reported the card browser's pencil ring (cut by the list, over the flag) and
the editor (no ring on a focused field; no ring after Tab out of one). After them, no Tab stop
reports a missing, cut or covered ring; the floating buttons' remaining "covered" reports were
the list behind them and their rings were checked by screenshot. Screenshots of the pencil and
the focused Back field confirmed the result.

This is geometry and activation coverage in Chromium, not an exhaustive Safari Tab-policy test or
a VoiceOver listening pass, which remains the compatibility gate.

## Repository checks

`lib/webKeyboardNavigation.test.ts` covers the frame hand-off rule. `npm run quality` passed.
