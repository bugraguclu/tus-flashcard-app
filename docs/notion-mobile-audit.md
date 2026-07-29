# Notion “Tus Ankim / Revizeler” Mobile Audit

Audit date: 29 July 2026
Source: `tus ankim` → `revizeler` (last edited 28 July 2026)

## Verdict

The Notion page is useful as raw product feedback, but it is not yet a professional release
specification. It mixes requests, implementation notes and test reminders; several unchecked
items are already implemented; acceptance criteria, priority, owner, target version and
verification evidence are mostly absent. It must not be used alone to decide “ready to publish.”

The codebase now uses this release decision instead:

1. Functional parity and regression tests
2. Mobile layout and accessibility checks
3. Privacy, security and App Store metadata checks
4. Xcode Release build and device-size smoke tests
5. Explicit list of account/content/brand blockers

## Item-by-item mapping

| Notion request | Audited state | Mobile/release treatment |
|---|---|---|
| Explain the `zzz` and pause icons | Implemented | The reviewer now shows the persistent labels **Göm** and **Askıya Al**, not icon-only controls. VoiceOver labels explain that burying lasts until the next study day and suspension lasts until the user restores the card. Touch targets are at least 44 pt. |
| Seven-box weekly streak | Implemented and revised | `WeekStreakStrip` shows seven actual calendar days, highlights today in orange, disables navigation into the future and provides 44 pt previous/next controls. On narrow phones it uses a compact full-width layout; statistics cards stack vertically instead of overflowing horizontally. |
| Swipe between weeks | Not implemented | Arrow navigation is complete. A horizontal swipe gesture remains a post-1.0 enhancement because adding competing gestures inside a vertically scrolling statistics screen creates accidental navigation risk and needs dedicated gesture/accessibility QA. |
| Sequential native audio | Implemented; real-device check remains | Audio/video elements are played in document order. Replay and pause signals work on web and native. The native WebView enables JavaScript only for cards with playable media; card HTML is sanitized and navigation is restricted. Two-file ear testing on a physical iPhone remains mandatory. |
| Custom Study details | Implemented | Filtered/custom decks, limit increase, forgotten-card study, preview and study-ahead flows are present. Filtered cards are restored to their original deck and covered by repository/deck tests. |
| Basic card type | Implemented | “Temel” creates a single front-to-back card. |
| Type answer card | Implemented | “Yazarak Cevapla” renders a native text field and shows a character-level answer diff after reveal. |
| Basic and reversed card | Implemented | “Çift Taraflı” generates sibling cards and supports an optional reverse-side answer override. |
| Media picker and photo editing | Implemented and revised | Question/answer fields expose a 44 pt add-media control. A selected or captured photo now enters a full-screen editor before it can be attached: native crop, 90° rotation, pen, translucent highlighter, arrow, rectangle, ellipse, a filled study/occlusion cover, outlined text, color/size controls, tap eraser, undo/redo and clear are supported. The flattened PNG is written to the private media store only after **Bitti**. Photo library, camera and audio recording remain user initiated. |
| Preview before save | Implemented | The editor renders question and answer through the same card renderer before persistence. The navigation title now distinguishes **Yeni Kart** from **Kartı Düzenle**. |
| Empty cards | Implemented | The empty-card flow exists as a dedicated route and uses shared collection refresh state. |
| Import/export | Implemented with a platform boundary | iPhone/iPad exposes only the supported CSV/TSV/TXT import path. `.apkg` remains available on desktop web, where its parser works, but its explanation, ZIP picker type and action are absent from mobile. JSON backups/export use the system picker/share sheet. File/media names are sanitized and import paths have regression coverage. |
| Reviewer preferences | Implemented | Auto advance, interrupt audio on answer, remaining count and next-review-time visibility are available from the scrollable card options sheet. |
| Note marking | Implemented | Mark/unmark state is persisted and surfaced in reviewer/browser filtering. |
| Image question UI | Implemented and hardened | Images and video are constrained to card width; local media resolves through the private media directory. Remote or unsafe navigation cannot replace the review WebView. |
| Center New/Learn/Review | Implemented | Counts are centered in the deck summary and responsive reviewer header; the phone layout reduces spacing without reducing semantic labels. |
| Deck options from reviewer | Fixed in this audit | **Seçenekler** previously opened global application settings. It now opens the current card’s deck-specific configuration. |
| Sync after completion | Not implemented | There is no AnkiWeb/cloud sync and no account system. The 1.0 listing must say “offline” and must not claim full Anki ecosystem compatibility. Sync needs a separate privacy/security/backend specification. |

## Mobile changes added during this audit

### Reviewer

- Compact phone spacing for the title, queue counters, card padding and rating buttons.
- Metadata and action controls wrap onto separate rows on narrow screens.
- Göm / Askıya Al / Geri Al / Diğer controls meet the 44 pt touch-target rule.
- The Space/1–4/Ctrl shortcut footer is now desktop-web-only. It is absent from iPhone, iPad
  and compact web layouts, while the actual answer buttons remain visible and accessible.
- VoiceOver no longer announces the web-only `(R)` key hint on the native replay-audio button.
- The options sheet is bottom aligned, keyboard safe and vertically scrollable; all fifteen-plus
  actions remain reachable on short devices.
- “Deck options” now resolves the current card’s actual deck ID.

### Deck list and navigation

- Removed the manual refresh icon from iPhone/iPad. Deck counts already update through shared
  application state, so the control added header noise without being part of the mobile flow.
- Drag-and-drop nesting and its handle/banner now render only on desktop web. This prevents a
  horizontal/long-press deck gesture from competing with vertical touch scrolling on phones and
  tablets.
- No capability was lost: every deck keeps the explicit `•••` menu and its **Taşı (alt deste
  yap)** parent picker, which is discoverable, reversible before confirmation and touch-friendly.
- The new-deck sheet no longer instructs phone users to type the technical `::` hierarchy syntax.
  It directs them to the same `••• → Taşı` flow; desktop web keeps the fast syntax hint.
- The four bottom actions were retained because all four have working destinations. They now
  expose explicit accessibility roles and names: Yeni kart ekle, Kartlarımı aç, İstatistikleri
  aç and Ayarları aç.

### Card editor

- Added iOS keyboard avoidance, automatic keyboard insets and handled tap behavior.
- Limited the content column to 720 pt for iPad while keeping full-width phone behavior.
- Raised card-type, course, topic, deck, modal and media targets to 44–52 pt.
- Added dynamic **Yeni Kart / Kartı Düzenle** titles.
- Replaced direct photo attachment with a non-destructive, full-screen annotation step. The
  original picker result is not inserted into the note; only the user's confirmed flattened PNG
  is stored. Canceling leaves the question/answer field unchanged.
- Added pen, highlighter, arrow, rectangle, ellipse, a filled study/occlusion cover, outlined text, eraser, color and size
  controls, undo/redo, clear and rotation. Text placement and shape geometry use normalized
  coordinates so annotations stay aligned across phone/iPad sizes and after rotation.

### Statistics

- Removed fixed-width combinations that exceeded narrow phone width.
- Today’s four metrics wrap into a two-by-two grid on phones.
- Streak summary and seven-day strip stack on mobile.
- Headers, legend and data-management buttons wrap/stack instead of clipping.

### Settings and support

- Settings uses a centered 760 pt maximum column on iPad.
- Step buttons, option chips and actions now use 44–48 pt minimum targets.
- Keyboard binding rows are desktop-web-only. Mobile no longer spends an entire section listing
  inert key values or explaining that they do not work on the current device.
- User-facing scheduler descriptions were translated from implementation jargon such as
  `Learning + Relearning + Review pipeline` to plain Turkish.
- Added in-app version, privacy-policy and support links.
- Added public Turkish/English privacy text and a support/FAQ page.
- Privacy wording now accurately explains optional camera, photo-library and microphone use.

### Import and terminology

- The native document picker now requests CSV, TSV and plain-text files only. Its instructions
  and accessibility label name exactly those supported formats; `.apkg` is not advertised on
  App Store builds.
- Card Browser details now use **Aralık**, **Kolaylık** and **Sonraki gösterim** instead of
  Interval/Ease/Due/Learning queue.
- Card Info now translates status, queue, scheduling fields and review-log labels while keeping
  raw IDs and scheduling values available for advanced diagnosis.
- The mobile drawer subtitle is **Aralıklı Tekrar**, replacing the mixed-language
  “Spaced Repetition” label.

### Security and project structure

- Sanitization now covers imported note templates as well as field values.
- Encoded event handlers/URI schemes, malformed scripts, SVG/MathML active content, unsafe
  CSS imports and dangerous data URIs are blocked; regression tests cover these vectors.
- Card WebView top-level navigation, mixed content and new windows are restricted.
- Context, sidebar and startup hook moved outside `app/`, preventing Expo Router from treating
  helper modules as screens.

## What still prevents a truthful “ready to publish” decision

1. Approve a distinct store-facing name; `TusAnkiM` can imply official Anki ecosystem
   compatibility even though sync is absent.
2. Publish and verify the support/privacy URLs.
3. Confirm ownership/licensing of every bundled TUS card and media file.
4. Run camera/photo/microphone, sequential audio, backup and relaunch tests on a physical iPhone.
5. Complete signing, TestFlight, screenshots and App Store Connect declarations.

See `docs/app-store-release.md` for the submission metadata and final checklist.

## Verification evidence for this revision

- TypeScript + Vitest: 30 test files, 277 tests passed.
- Expo Doctor: 18/18 checks passed.
- Production web export completed successfully.
- Responsive browser QA at 390×844 confirmed no shortcut footer or key-binding section; a
  1024 px desktop check confirmed that the web shortcuts remain available there.
- Xcode Release simulator build completed successfully with the current source bundle.
- iPhone 17 Pro (iOS 26.5) accessibility and screenshot QA confirmed: no refresh/drag controls,
  no native keyboard shortcut text, mobile-only CSV/TSV/TXT import copy and intact rating actions.
- iPad mini (iOS 26.5) confirmed that wide native layouts still do not inherit desktop-web drag
  handles, refresh or key hints.

This is simulator/build evidence, not a signed App Store archive or physical-device acceptance.
The physical-device and App Store Connect blockers above still apply.
