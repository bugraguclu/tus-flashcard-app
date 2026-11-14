# TusAnkiM design system

Every screen draws its chrome from one set of parts in `components/ui/` and the tokens in
`constants/theme.ts`. A job the app does in more than one place (a primary action, a list row, a
sheet, a dialog, a close button) has exactly one look and one behaviour, and it lives in one file.
Do not style a new button, row, card, sheet or dialog in a screen: use the part, or extend the part
for everyone.

The look is calm and neutral: white cards with hairlines on a light grey page, the app icon's teal
for actions, orange for streaks and the Kronometre tools, and the grade colours as pale tints. The
owner chose it change by change on 13 November 2026 (TUSBuddy was the reference). The parts take
their measurements from the variant the app already used most for each job, recorded in the
design-language audit of 5 November 2026.

## Tokens

`constants/theme.ts` holds the scales and colours; `components/ui/tokens.ts` maps them to roles.

| Role | Token | Value |
|---|---|---|
| Danger, warning, success, info | `colors.danger`, `warning`, `success`, `info` (+ `…Bg`) | The red, orange, green and blue the grade buttons and badges use. Never borrow `btnAgain` or `badgeNew` for chrome. |
| Text on an accent or red fill | `colors.onAccent` | white |
| Dimming behind a dialog or sheet | `colors.scrim` | black 40% |
| Dimming behind a popover or side menu | `colors.scrimLight` | black 22% |
| Dimming behind a speed-dial menu | `colors.scrimStrong` | black 60% |
| Marked-note star | `colors.marked` | amber |
| Chosen segment | `colors.segmentSelected` | white (dark: border tone) |
| Corners | `Radius.control` 6 · `inset` 8 · `card` 12 · `sheet` 16 · `pill` | buttons and fields · menus, segmented track, boxes inside a card · cards and dialogs · sheet top · chips and badges |
| Touch target | `HIT_TARGET` | 44 pt minimum for anything tappable |
| Disabled | `DISABLED_OPACITY` | 0.45 on the whole control |
| Text | `Type.title` 18/600 · `sectionTitle` 16/600 · `rowTitle` 14/500 · `body` 14/400 · `bodyStrong` 14/600 · `button` 14/600 · `textButton` 14/600 · `caption` 12/18 · `label` 12/500 sentence case | screen, sheet and dialog titles · card headings · row titles · body · values · filled buttons · text buttons · summaries and footnotes · group labels |

Spacing stays on the 4-point grid of `Spacing`; screens keep a 16-point side gutter.

No colour literal belongs in a screen. Exceptions: user-chosen ink and highlight swatches (drawing
pad, photo editor, editor colour pickers), image content (the sleeping panda), card templates, and
the photo editor's crop frame, which is drawn over the photo itself.

## Parts

| Job | Part | File |
|---|---|---|
| Header of a routed screen or full-screen form | `ScreenHeader` (`leading="back"` or `"close"`, `subtitle`, `actions`) | `components/ScreenHeader.tsx` |
| Header icon action | `IconButton` / `HeaderIconButton` | `components/ui/Button.tsx` |
| Any filled, outlined or text action | `Button` (`primary`, `secondary`, `destructive`, `plain`; `regular` 50 pt or `compact` 40 pt) | `components/ui/Button.tsx` |
| Close and help controls | `CloseButton` (SVG ×), `HelpButton` (round ?) | `components/ui/Button.tsx` |
| Control glyphs | `BackIcon`, `ForwardIcon`, `ChevronRightIcon`, `ChevronDownIcon`, `ChevronUpIcon`, `CloseIcon`, `CheckIcon`, `PlusIcon`, `MinusIcon`, `MoreIcon` (•••), `MoreVerticalIcon` (⋮), `SearchIcon`, `RefreshIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `ArrowLeftIcon`, `ArrowRightIcon`, `TrashIcon`, `UndoIcon`, `RedoIcon`, `ExternalLinkIcon`, `DragHandleIcon` | `components/ui/icons.tsx` |
| − value + | `Stepper` (holding repeats; `children` for an editable value) | `components/ui/Stepper.tsx` |
| A surface for rows, charts or fields | `Card` (`divided` for rows, `padded` for free content; `title`, `description`, `accessory` draw its heading inside), `CardHeader` | `components/ui/Card.tsx` |
| A labelled group of rows | `Section` (`SectionLabel` + `Card` + `SectionFootnote`) | `components/ui/Card.tsx` |
| Rows | `ListRow` (opens something; `selected` makes it an option of a single-choice list, `expanded` a disclosure), `SwitchRow`, `ValueRow` (label and value or control), `SelectRow` (label and chosen option) | `components/ui/Rows.tsx` |
| Switch | `AppSwitch` | `components/ui/Rows.tsx` |
| Chips, badges, segmented control, checkboxes, chosen-row tick | `Chip` (`role` button, radio or checkbox), `Badge`, `SegmentedControl`, `Checkbox` / `CheckRow` (`mixed` for a partly ticked group), `SelectedMark` | `components/ui/Choice.tsx` |
| Text entry | `TextField` (`label` for a caption above it, `monospace` for code), `SearchField` | `components/ui/Fields.tsx` |
| Empty, loading, notices, progress | `EmptyState`, `LoadingState`, `Notice` (`info`, `warning`, `danger`, `success`), `ProgressBar` | `components/ui/Feedback.tsx` |
| Bottom sheet | `AppSheet` (title, subtitle, optional close button, keyboard lift, overlay picker) | `components/ui/Sheet.tsx` |
| Centred form, picker or explanation | `AppDialog` | `components/ui/Dialog.tsx` |
| ••• menu | `PopoverMenu` + `MenuItem` | `components/ui/Menu.tsx` |
| Confirmation | `lib/confirm` (system alert on iPhone, `DialogHost` on web) | `lib/confirm.ts` |

Import each part from its own file (`components/ui/Button`), not through a barrel: screen tests mock
`react-native` per file, and a barrel would load every part's dependencies.

## What replaced what

The screens used to carry their own small kits. They map onto the parts like this:

| Before | Now |
|---|---|
| Kronometre tools `ToolSection` / `ToolRow` / `Segmented` / `ToolButton` | `Section` / `ValueRow` / `SegmentedControl` / `Button` (`danger` → `destructive`, `plain` → `secondary`); `DateField` is a `ValueRow` |
| Kronometre sheets `StopwatchSheet`, `SettingRow`, `SheetButton`, `Stepper` | `AppSheet` (form header → `closeButton` + `dividedHeader`), rows in a `divided` `Card`, `Button`, `ui/Stepper` |
| Statistics `StatsSegmented`, `StatsCard` | `SegmentedControl`, `Card padded` + `CardHeader` |
| Settings groups, `ToggleRow`, `ChoiceRow`, `StepperRow`, data rows | `Card padded`/`divided` + `CardHeader` (+ `HelpButton`), `SwitchRow`, `SegmentedControl`, `Stepper`, `ListRow` |
| Deck options `OptionCard`, toggles, selects, `FieldAdvice` | `Card` + `CardHeader` + `HelpButton`, `SwitchRow`, `SelectRow`, `Notice` |
| Accent-coloured picker toolbars (deck, note type, tag) | A white header inside the dialog card: `Type.title`, `CloseButton`; the chosen row ends in `SelectedMark` |
| Per-screen popovers (deck list, Browse, editor •••) | `PopoverMenu` + `MenuItem` |
| Per-screen dimming (18% … 60% black, tinted blacks) | `colors.scrim`, `scrimLight`, `scrimStrong` |
| Text glyphs ›, ⌄, ⌃, ×, ✕, ✓, ⋮, •••, ＋, ↻, ↑, ↓, ← as icons | `components/ui/icons` |

## Rules

- One look per job. A primary action is a `primary` `Button` everywhere; Cancel is a `plain`
  `Button`; a destructive action is `destructive` (filled) or a `plain` button with `tone="danger"`
  in a row of text actions.
- Close is an icon (×), never a text glyph. Back is `BackIcon` in the header's leading slot.
- A row that opens something ends in `ChevronRightIcon`; a value that opens a list ends in
  `ChevronDownIcon`. Text characters (›, ⌄, ×, ✓, ⋮, ＋) are not icons.
- A group of rows is a `Section` or a `divided` `Card`: the card draws the hairlines between its
  direct children, so pass rows directly (a fragment counts as one child).
- Sheets are `AppSheet` over `BottomSheetModal`; dialogs are `AppDialog`; neither draws its own
  backdrop colour.
- Disabled controls fade with `DISABLED_OPACITY`. Every state a control has (disabled, checked,
  selected, expanded, busy) is passed both as `accessibilityState` and as the matching `aria-*`
  prop: react-native-web reads only the `aria-*` props, iOS reads both.
- Everything tappable is at least 44 × 44 points (hit slop may make up a compact control's height).
