# Havuz owner selections — 2026-11-23

Base: current production source `origin/master` at `7819c158`.
Source pool: `Havuz` at `c31c2045`. Delivery branch: `codex/havuz-approved`.

The owner selected individual numbered items from the before/after report. A number without
an extra comment means approval; explicit comments take precedence. They also confirmed that
items 14–15 must use current production source rather than replace it with Havuz's older site.

## Scope actually applied — revised owner approval

On 2026-11-23 the owner explicitly replaced the initial selection and authorized production
deployment: **1–2 yes; 3 delete; 4–5 yes; 6 next step; 7–11 yes; 12 delete; 13–17 yes.**

- **1:** Stats and Study Analysis distinguish read failures from valid empty data. Failed
  sections are labelled, partial results are not cached, Retry reloads data, and previous data
  retains its own deck/period labels. Plan reads now propagate errors before a write.
- **2:** Persistent local wizard draft, with Continue / New plan / Discard and the saved step.
  Adapted to the live three-route wizard instead of replacing it with Havuz's single-screen
  implementation. Autosave coalesces edits; leaving waits for the latest durable draft. An
  unreadable draft cannot become an editable empty form. Plan creation and draft removal
  commit together, repeated Create presses are ignored, and failures preserve the draft.
- **3:** Quick Search is excluded, including its provider, shortcut and triggers.
- **4:** Offline Turkish/English Help Center compiled from the **current** guide sources.
  Search, verified section targets and contextual links are included. Article drill-down uses
  routed pages so header Back, browser Back and iOS back swipe agree. Nested modal handoffs
  await dismissal; the filtered-deck form remains mounted while its guide is open.
- **5:** Contextual flag/tag counts and result actions use the live browser query. Notes mode
  deduplicates sibling cards; combinations use exact OR unions. Count failures hide counts
  while filtering remains usable.
- **6:** **Next step only.** No chart data-table control, sheet or runtime dependency is added.
- **7:** Retain the newer live keyboard, focus-ring and modal trapping system. Add the missing
  Skip to main link, main landmarks and native screen/sheet opening focus. The navigator's
  wrapper remains the same element across routes.
- **8:** Today shows planned/studied/remaining Kronometre time and blocks, with live refresh
  while focused. Other subjects do not fill a planned course; card review time stays separate.
- **9:** Local statistics order/visibility and optional two columns on wide web. Save awaits
  durable storage, Cancel retains saved preferences, and one section always stays visible.
- **10:** Equal adjacent 7/30/90-study-day periods or two deck scopes, with shared axes,
  explicit accuracy denominators and separate missing/zero values. Chart tables are deferred.
- **11:** Native sections mount near the viewport, remain mounted once shown and mount eagerly
  with VoiceOver. Web keeps its complete accessible reading order. No device speed claim.
- **12:** Bundle-budget modules, scripts and CI checks are excluded.
- **13:** The approved no-emoji thumbnail rows and direct Soru/Cevap preview are retained.
  Tap/hold opens the shared Kart Ekle preview over Kartlarım, preserving context and originals.
- **14:** Current live search plus the already selected regex/literal-name/legacy-state fixes.
- **15:** Current live website retained; no old Havuz website is substituted. Guide updates
  flow into the current site. The current site's build/verify is checked alongside the app.
- **16:** Existing modal/background/whiteboard Auto Advance pause remains. The rejected
  Quick Search-specific dependency is excluded.
- **17:** Stable local editor field identity and durable note-type / Empty Cards deletion,
  with the approved backups, read-only refusal and scoped rollback, are retained.

## Next step

Item **6** is the only deferred numbered feature: numeric views for six statistics charts,
including comparison. It is not part of this production deployment. Items **3 and 12** are
removed from the delivery scope, rather than queued for later.

## Current release verification

The expanded selection passed `npm run quality` on Node 24.16.0: **371 files / 3,950 tests
passed**, 2 files / 5 tests skipped. TypeScript, the guide generator and the canonical iOS/source
registry checks passed. The existing dependency advisory gate reports no blocking advisories.

The production app exported successfully with `TUSANKIM_WEB_BASE=/uygulama`. The unchanged
current website's build and verify passed: 33 pages, 32 sitemap URLs, 65 search entries, 1,195
reference records, eight script tests and 17 planner tests. The two outputs were assembled
with the actual Vercel packaging script. HTTP checks on ten website/app paths verified 200
responses and every linked script/stylesheet, including Help and all wizard routes.

Visual desktop browser QA could not run in this chat: browser access is unavailable and both
native Chrome and Safari reported `cgWindowNotFound`. No new visual tap-through is claimed.
The comparison's actual rendered component has additional regressions for real zero accuracy/
time, visible answer denominators and local deck selection. Prior item 13 visual evidence is
retained below; current tests cover its shared Soru/Cevap preview.

Physical iPhone testing remains explicitly owner-deferred ("Cihaz kontrolü sonraya kalsın").
This authorization deploys the public **web preview**; it does not claim an App Store/native
release. Production publication is authorized by the revised instruction; this commit is the
verified candidate to promote from `codex/havuz-approved` to `master` without force.

## Earlier selected-package verification (historical)


- Before the fixes, the added focused regressions failed: 19 failures across the six edited
  test files confirmed the missing search guards, field identity and deletion guarantees.
- The focused post-fix suite passed 264 tests across 10 files, including the existing Auto
  Advance dwell/timer/input guard tests and the Anki search oracle.
- An extra quote-preservation regression failed against Havuz's original legacy-state
  replacement; the selected implementation now scans quotes/escapes before upgrading a term.
- Full quality including item 13 on Node 24.16.0: 359 files / 3,886 tests passed; 2 files / 5 tests
  skipped. This includes TypeScript, the source registry and iOS configuration checks.
- The production web export passed. The current site's build and verify passed with 33 HTML
  pages, 32 sitemap URLs, 65 search entries and 1,195 reference records.
- In the selected production-web build on local port 8097, an unsaved new-note value was
  pinned, its field renamed Front → Prompt and moved to the second position. The text and pin
  followed it; after saving the note and reloading Browse, the same question was present.
  The rejected `re:"(a+)+$"` search showed the last valid results and a syntax notice without
  freezing. These interactions used only the new local test origin.
- Physical iPhone smoke remains a release gate. Do not infer a native pass from screenshots.
  On 2026-11-23 the owner explicitly deferred this check ("Cihaz kontrolü sonraya kalsın").
  The requested selection/implementation and visual review are complete; no native-device
  pass or production deployment is claimed.

## Selected thumbnail implementation (item 13)

The latest owner follow-ups remove the intermediate “Görseli aç” action: holding opens directly.
The preview now shares CardPreviewContent with Kart Ekle, including Soru/Cevap and CardWebView.
Actual note/card/template data, rather than one extracted file, supplies both faces and all
images. The original selection/implementation used the menu described in the historical web
verification below; that menu is superseded. Cards and Notes share this same preview.
Raster thumbnails are disposable derivatives in a separate bounded cache; file invalidation,
aborted requests and web object-URL ownership are covered by focused regressions. Remote
images, SVGs and missing files are not decoded as thumbnails. Original media stays read-only.

Before the final Soru/Cevap follow-up, at `http://127.0.0.1:8098/browser`, Safari's isolated local origin installed the bundled
9,575-card package. The new rows showed decoded thumbnails without the generated emoji.
Holding the first thumbnail offered “Görseli aç”; that action displayed the original over the
same Browser route. Closing returned to the same rows. A “Sinapsları” search showed two cards;
tapping its thumbnail opened the original directly without navigation. Closing preserved the
search and both results. These are desktop-web
checks, not physical-iPhone evidence.

New screenshots in the chat's visualization directory:

- `13-kartlarim-emojisiz.png` — current selected rows.
- `13-kartlarim-gorsel-acik.png` — original image over Kartlarım.

## Latest Soru/Cevap verification

The final web build was opened in Chrome on the isolated local `8098` origin, with the bundled
9,575-card catalog. Holding its first thumbnail opened Önizleme immediately, without an action
menu. Soru showed the image and hidden cloze answers; Cevap showed the same image, revealed
answers and a second image. The URL stayed `/browser`. Different front/back images, multiple
images, a back-only image, reversed-card ordinals and reopening on Question are covered by
`lib/browserImagePreview.test.ts`, which also compares the Browser's rendered HTML to the
editor's shared preview. The scrolling WebView is excluded from sheet dragging.

Final `npm run quality`: 359 files / 3,886 tests passed, 2 files / 5 tests skipped. A preceding
run concurrent with web builds hit the existing 5-second 33,000-card scale-test timeout; the
unchanged full command passed after the builds finished, with no timeout increase. The app's
web export and the current website's build/verify passed. Physical-device execution remains
explicitly deferred by the owner.

## Initial thumbnail demonstration (historical)


On `http://127.0.0.1:8096/browser`, the bundled 9,575-card catalog was installed in the local
test origin. The resulting collection had 9,577 cards, including two pre-existing local test
cards. No production-origin collection was modified.

The same list was captured with image previews off and on. The eight visible image previews
decoded successfully; the list retained the same scope, text and card count. The preference
was toggled off/on and the screen was reloaded; all eight visible previews loaded again.
The four thumbnail regression files passed all 27 tests on the unchanged Havuz source.
The images are stored in the chat's local
visualization directory:

- `13-onizleme-kapali.jpg` — previews off.
- `13-onizleme-acik.jpg` — previews on.

The initial Havuz UI included older row decorations. The selected port uses the current live
design system and keeps image-free rows free of those older leading icons.

## Production-source boundary

The live homepage was inspected at `https://tusankim.vercel.app/`. Its current card demo,
study-planning page links and other site structure are preserved. The 31-page Havuz snapshot
is not substituted. The original package was prepared locally. The revised owner instruction above authorizes publishing the expanded selected package; final deployment evidence is recorded separately.
