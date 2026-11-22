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
design-language audit of 5 November 2026. On 16 November 2026 the owner went through the audit of
the live build look by look: what was still drawn outside the kit was either pulled onto a part,
added to the kit as a part of its own, or kept as a named exception (listed below).
On 17 November 2026 the owner's answers set the corners to 8 · 12 · 16, made the centred menu
card neutral, put the editor's tool tabs on the segmented control, and named the 11-point text
role, the 2- and 6-point spacing steps and the three icon sizes.

## Tokens

`constants/theme.ts` holds the scales and colours; `components/ui/tokens.ts` maps them to roles.

| Role | Token | Value |
|---|---|---|
| Danger, warning, success, info | `colors.danger`, `warning`, `success`, `info` (+ `…Bg`) | The red, orange, green and blue the grade buttons and badges use. Never borrow `btnAgain` or `badgeNew` for chrome. Status words are coloured text: no tinted pill, disc or tile behind a label, count or icon (the owner rejects that look), and no `opacity` to dim text — use `textMuted` or `textFaint`. A tinted fill marks only a selected or active control. |
| Text on an accent or red fill | `colors.onAccent` | white |
| Dimming behind a dialog or sheet | `colors.scrim` | black 40% |
| Dimming behind a popover or side menu | `colors.scrimLight` | black 22% |
| Dimming behind a speed-dial menu | `colors.scrimStrong` | black 60% |
| Marked-note star | `colors.marked` | amber |
| Chosen segment | `colors.segmentSelected` | white (dark: border tone) |
| Corners | `Radius.control` 8 · `inset` 8 · `button` 12 · `card` 16 · `sheet` 16 · `pill` | small controls (tool buttons, steppers, boxed chips) · menus, segmented track, boxes inside a card · buttons and text fields · cards and dialogs · sheet top · chips and badges. Screens name a role; `BorderRadius` is only the scale the roles are built on. |
| Shadows | `Shadow.card` · `Shadow.floating` (· `Shadow.floatingOutline`) | a white surface resting on the page · anything that hovers above it (menus, dialogs, sheets, the floating button, a dragged row, the dock). `floatingOutline` is the same shadow for a surface drawn as an SVG outline (the dock's notched panel): it follows the drawing, where a box shadow would cast a rectangle. No other shadow value belongs in a screen. |
| Touch target | `HIT_TARGET` | 44 pt minimum for anything tappable |
| Disabled | `DISABLED_OPACITY` | 0.45 on the whole control |
| Text | `Type.title` 18/600 · `sectionTitle` 16/600 · `rowTitle` 14/500 · `body` 14/400 · `bodyStrong` 14/600 · `button` 14/600 · `textButton` 14/600 · `caption` 12/18 · `label` 12/500 sentence case · `micro` 11/500 | screen, sheet and dialog titles · card headings · row titles · body · values · filled buttons · text buttons · summaries and footnotes · group labels · badges, bar captions, count columns and chart axes |

Spacing stays on the 4-point grid of `Spacing`; screens keep a 16-point side gutter. Two off-grid
steps have names so they are not typed as numbers: `Spacing.xxs` (2) and `Spacing.s6` (6).

Text sizes come from `FontSize` (11 · 12 · 14 · 16 · 18 · 22 · 28 · 32). Nothing is drawn under
11 points, and 13 and 15 are not sizes: a row title is 14. Weights stop at 600; the Kronometre's
running clocks are the only heavier text.

Icons come in three sizes: 20 inside a row or a chip, 22 in an icon button or a toolbar, 24 in a
header. Larger drawings are the floating button's own icon (26–28) and the picture of an empty or
error state (30 and up). A small mark (a disclosure chevron inside a button, the tick in a check
box, a badge's glyph) is 16; no icon is drawn smaller.

A wide window (desktop web, iPad) centres each screen's content in one column instead of
stretching it: `READABLE_WIDTH` (760) for forms, settings, timelines and cards, `LIST_WIDTH` (920)
for the deck list and the card browser, 720 for the note editor's fields. Content in a scroll view
takes `width: '100%', maxWidth, alignSelf: 'center'`; a full-width bar (a header, a bottom bar, a
list whose scroll bar stays at the window edge) keeps its background edge to edge and adds
`useCenteredInset(maxWidth)` (or `centeredInset(width, maxWidth)`) to its side padding, and a
floating button adds it to its `right`. A phone is narrower than every limit, so it never changes.

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
| Control glyphs | `BackIcon`, `ForwardIcon`, `ChevronRightIcon`, `ChevronDownIcon`, `ChevronUpIcon`, `CloseIcon`, `CheckIcon`, `PlusIcon`, `MinusIcon`, `MoreIcon` (•••, the one "more" icon everywhere), `SearchIcon`, `RefreshIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `ArrowLeftIcon`, `ArrowRightIcon`, `TrashIcon`, `UndoIcon`, `RedoIcon`, `ExternalLinkIcon`, `DragHandleIcon`, `EyeIcon`, `EyeOffIcon` | `components/ui/icons.tsx` |
| − value + | `Stepper` (holding repeats; `children` for an editable value) | `components/ui/Stepper.tsx` |
| A surface for rows, charts or fields | `Card` (`divided` for rows, `padded` for free content; `title`, `description`, `accessory` draw its heading inside), `CardHeader` | `components/ui/Card.tsx` |
| A labelled group of rows | `Section` (`SectionLabel` + `Card` + `SectionFootnote`) | `components/ui/Card.tsx` |
| Rows | `ListRow` (opens something; `selected` makes it an option of a single-choice list, `expanded` a disclosure), `SwitchRow`, `ValueRow` (label and value or control), `SelectRow` (label and chosen option) | `components/ui/Rows.tsx` |
| Switch | `AppSwitch` | `components/ui/Rows.tsx` |
| Chips, badges, segmented control, checkboxes, chosen-row tick | `Chip` (`role` button, radio or checkbox), `Badge` (coloured text, no pill; `keycap` boxes a keyboard key), `SegmentedControl`, `Checkbox` / `CheckRow` (`mixed` for a partly ticked group), `SelectedMark` | `components/ui/Choice.tsx` |
| Text entry | `TextField` (`label` for a caption above it, `error` / `hint` for a line under it, `accessory` for a control inside its right edge, `monospace` for code), `PasswordField` (show/hide button, iOS Password AutoFill; `isNew` for a password being chosen), `SearchField` | `components/ui/Fields.tsx` |
| Empty, loading, notices, progress | `EmptyState`, `LoadingState` (`delayed` stays blank for 300 ms, then fades in), `Notice` (`info`, `warning`, `danger`, `success`), `ProgressBar` | `components/ui/Feedback.tsx` |
| Bottom sheet | `AppSheet` (title and subtitle centred under the grabber, keyboard lift, overlay picker), `SheetScrollView` for its scrolling body, `SheetNoDrag` around a multi-line field | `components/ui/Sheet.tsx` |
| Centred form, picker or explanation | `AppDialog` | `components/ui/Dialog.tsx` |
| ••• menu | `PopoverMenu` + `MenuItem` (`chevron` for a row that opens a submenu) | `components/ui/Menu.tsx` |
| A long action menu centred over the screen (the deck row's •••) | `MenuDialog` + `MenuItem` | `components/ui/Menu.tsx` |
| Floating button | `Fab` (`rounded`: the ＋ shape; `round` with `colors.studyTool`: the Kronometre's tools and the calendar's stopwatch); `FabFace` is its face alone, for a button that also holds a caption (the dock's raised ＋) | `components/ui/Fab.tsx` |
| Floating button that opens actions above itself | `SpeedDial` + `SpeedDialAction` (a label and a small button) or `SpeedDialCard` (a filled card with a title and what it does); `placement="center"` + `withButton={false}` turns the dock's raised ＋ into × and slides the actions up side by side over it, together like a drawer (names under their buttons) | `components/ui/Fab.tsx` |
| A screen's shortcuts floating over its bottom edge, with its main action raised in the middle | `Dock` + `DockItem` (24 pt icon over a caption) and its `action` (the deck list's ＋); `useDockClearance` for the list under it, `useDockScroll` for when it gets out of the way | `components/ui/Dock.tsx` |
| Bar of bulk actions along the bottom edge | `BottomBar` + `BottomBarItem` (icon over a caption) | `components/ui/Bars.tsx` |
| One tool of a formatting or drawing toolbar | `ToolButton` (44 pt square, `selected` tint, optional `label` under the icon) | `components/ui/Bars.tsx` |
| Confirmation | `lib/confirm` (system alert on iPhone, `DialogHost` on web) | `lib/confirm.ts` |

Import each part from its own file (`components/ui/Button`), not through a barrel: screen tests mock
`react-native` per file, and a barrel would load every part's dependencies.

## What replaced what

The screens used to carry their own small kits. They map onto the parts like this:

| Before | Now |
|---|---|
| Kronometre tools `ToolSection` / `ToolRow` / `Segmented` / `ToolButton` | `Section` / `ValueRow` / `SegmentedControl` / `Button` (`danger` → `destructive`, `plain` → `secondary`); `DateField` is a `ValueRow` |
| Kronometre sheets `StopwatchSheet`, `SettingRow`, `SheetButton`, `Stepper` | `AppSheet` (form header → its centred `title`), rows in a `divided` `Card`, `Button`, `ui/Stepper` |
| Statistics `StatsSegmented`, `StatsCard` | `SegmentedControl`, `Card padded` + `CardHeader` |
| Settings groups, `ToggleRow`, `ChoiceRow`, `StepperRow`, data rows | `Card padded`/`divided` + `CardHeader` (+ `HelpButton`), `SwitchRow`, `SegmentedControl`, `Stepper`, `ListRow` |
| Deck options `OptionCard`, toggles, selects, number boxes, limit tabs, `FieldAdvice`, preset windows | `Card` + `CardHeader` + `HelpButton`, `SwitchRow`, `SelectRow` (options in an `AppDialog` of `ListRow selected`), `ValueRow` + `TextField`, `SegmentedControl`, `Notice`, `AppDialog`; Save and ••• sit in the `ScreenHeader` actions |
| Accent-coloured picker toolbars (deck, note type, tag) | A white header inside the dialog card: `Type.title`, `CloseButton`; the chosen row ends in `SelectedMark` |
| Per-screen popovers (deck list, Browse, editor •••) | `PopoverMenu` + `MenuItem` |
| Per-screen dimming (18% … 60% black, tinted blacks) | `colors.scrim`, `scrimLight`, `scrimStrong` |
| Text glyphs ›, ⌄, ⌃, ×, ✕, ✓, ⋮, •••, ＋, ↻, ↑, ↓, ← as icons | `components/ui/icons` |
| Per-screen floating buttons and their menus (deck list ＋, study tools, calendar stopwatch) | `Fab`, `SpeedDial` |
| The deck list's shortcut bar and Browse's selection bar | `BottomBar` + `BottomBarItem` |
| The deck list's `BottomBar` and its ＋ floating at the bottom right (22 November 2026, after Yemek Takibi's dock) | `Dock` + `DockItem`, the ＋ raised in the dock's notch |
| Editor, whiteboard and drawing-pad tool buttons (44, 38, 46 and 36 pt) | `ToolButton` |
| Filled or accent-text rows marking the chosen option (pickers, sort, export format, fonts) | `ListRow selected` / `CheckRow`: a tick, no fill |
| Note-type and tag pickers, the reviewer's flag panel | `AppDialog` with `ListRow` / `CheckRow`; `PopoverMenu` + `MenuItem` |
| The note-type screen's native stack header | `ScreenHeader` |
| `Shadows.sm` / `md` / `lg` spread through screens | `Shadow.card` / `Shadow.floating` |

## Feature parts and exceptions

The owner kept these looks on 16 November 2026. They are not kit parts, and nothing else should
copy them; change them only on the owner's word.

| Where | What stays its own |
|---|---|
| Reviewer (`app/(tabs)/index.tsx`) | The toolbar whose title is the deck selector (16/600 with a down chevron), "Cevabı göster" and the four grade buttons (corner 12, 54–56 pt), and the card panel (corner 20, `reviewerCardBorder`). |
| Deck list | The large "Desteler" title and the TUS Kartları strip. |
| Deck picker (`components/DeckPickerModal.tsx`) | Its own window and 54 pt rows; the chosen deck ends in the kit's tick. Every screen that picks a deck opens this one picker. |
| Browse | The card row (`BrowserCardRow`: its own boxed row with two detail lines), the deck scope selector under the header, and the search-help example rows. |
| Kronometre | The green header and hero, "Başla", the plan card's "Oluştur", "Sınav tarihi ekle", "Geçmiş çalışma ekle", the session card's ••• and the sleeping-panda empty state. Its sheets, selectors, steppers and fields are kit parts. |

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
  backdrop colour. A sheet has no close button: its grabber, a pull-down from anywhere outside
  what scrolls or edits text, and the backdrop close it. Dialogs keep their `CloseButton`.
- A header's back control is spoken as "Geri dön" / "Go back", or names the one place it returns
  to ("Destelere dön", "Ayarlara dön"). One meaning has one wording.
- Left raw on purpose: the number inside a stepper, a time box and the keyboard-shortcut field
  (`TextInput`), and the system `ActivityIndicator` inside an icon button or beside a label. A
  whole-screen wait is `LoadingState`.
- A dock is on screen by default. It leaves only while the learner moves down a long list on purpose
  and comes back on any small move up, at the top and the end of the list and on every return to
  the screen, never on a timer (`lib/dockScroll.ts`). It stays put for a screen reader and in a
  wide window; with Reduce Motion it fades instead of sliding.
- Disabled controls fade with `DISABLED_OPACITY`. Every state a control has (disabled, checked,
  selected, expanded, busy) is passed both as `accessibilityState` and as the matching `aria-*`
  prop: react-native-web reads only the `aria-*` props, iOS reads both.
- Everything tappable is at least 44 × 44 points (hit slop may make up a compact control's height).
- A field whose box holds more than its input (`SearchField`, a `Stepper` with an editable value,
  a name and its button) spreads `fieldRowProps` (`components/ui/fieldRow.ts`) on that box. In a
  browser the focus ring is then drawn around the box, as around a `TextField`, instead of as a
  second frame inside it; never style `outline*` by hand.
- Do not show or hide content on a field's focus alone: in a browser the press that moves focus
  away then lands on whatever slid under the pointer. Follow the software keyboard instead
  (`useKeyboardVisible`), as the Kronometre's course picker does.
- `lib/designSystem.test.ts` counts what each file outside the kit still builds by hand: raw
  touchables, touchables with no 44-point target it can see, `Modal`, `TextInput` and `Switch`.
  `lib/designSystemAllowlist.json` holds today's counts; a file may lower them, never raise them,
  and a new screen starts at zero. After moving something onto the kit, lower the numbers with
  `UPDATE_DESIGN_ALLOWLIST=1 npx vitest run lib/designSystem.test.ts`.
- On the web, the keyboard reaches everything (`hooks/useWebKeyboardNavigation.ts`, mounted by
  `WebAppIntegrations`): it draws the focus ring, puts focus inside a dialog, sheet or menu as it
  opens and moves through menus and segmented controls with the arrow keys. A part works with it
  by its roles: a menu's container is `accessibilityRole="menu"` and its rows `MenuItem`s (or
  `menuitem`), a choice of views is a `SegmentedControl` (one Tab stop, chosen with ← →), and a
  backdrop is a pressable that covers the layer. Never draw a focus outline in a screen; never
  put a focusable control inside a row that takes the press (`AppSwitch passive` does this for
  `SwitchRow`).
