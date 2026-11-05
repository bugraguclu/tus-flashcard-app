# Settings responsiveness verification — 2026-11-05

## Automated coverage

- `lib/appText.test.ts`: crossing Normal in either direction retains the native text/input
  instances, nested state and input ref; explicit iOS line-breaking preferences still win.
- `lib/appContextIsolation.test.ts`: equal previews, Save and discard do not republish settings;
  the draft editor's action subscription does not redraw when its preview is published.
- `lib/settingsDefaultPreset.test.ts`: an unrelated app setting does not rewrite an unchanged
  Default preset or enumerate decks/cards. Audio and scheduling edits still persist.
- `lib/studyDataSettings.test.ts`: presentation, controls, audio, Timebox and notifications keep
  the data key; every scheduling input, including array contents, changes it. Reviewer, Browser,
  Statistics and Deck Overview use this key for their queue/snapshot invalidation.
- `lib/settingsScreen.test.ts`: text-size preview and Save retain the same scroll surface and
  active section. Restore/rebase and default-preset preservation tests continue to pass.

`npm run quality` passed: TypeScript, 275 test files / 2909 tests (2 files / 5 tests skipped),
iOS configuration and the source registry. The first full run hit the existing 5-second timeout
in both 33,000-card filtered-reservation scale tests during concurrent host work; the final full
run passed them unchanged. The production web export and `git diff --check` passed.

## Production-web check

An isolated Chrome profile loaded the exported app, changed all four text-size steps, saved and
reloaded: Extra large remained selected. General, Reviewing, Controls, Accessibility and
Notifications were checked at 320, 375 and 430px, at the top and middle of each scroll surface.
DOM range checks found no visible word split across lines or horizontal overflow in those views.
The 320px Accessibility capture was also inspected: numeric controls sit below their labels,
choice buttons have usable widths, and text does not overlap.

The final Save/scroll check retained the same DOM scroll surface and a marked text node. The
scroll offset was 178px before Save and 177px afterwards; an immediate wheel scroll reached
377px. No main-thread task of 50ms or longer was observed during those actions in this isolated
empty-collection web profile. These observations are web checks, not iPhone performance figures.

## Native release gate

Native UI automation could not start in this session, and no physical-iPhone check was run.
Run the App text size row in `IOS_RELEASE_CHECKLIST.md`, including immediate scrolling after
Save with a large collection, both themes, larger system text, and the VoiceOver slider actions,
before releasing. The native push-out text strategy also needs that on-device visual check.
