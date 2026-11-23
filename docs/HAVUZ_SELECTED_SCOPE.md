# Havuz owner selections — 2026-11-23

Base: current production source `origin/master` at `7819c158`.
Source pool: `Havuz` at `c31c2045`. Delivery branch: `codex/havuz-approved`.

The owner selected individual numbered items from the before/after report. A number without
an extra comment means approval; explicit comments take precedence. They also confirmed that
items 14–15 must use current production source rather than replace it with Havuz's older site.

## Scope actually applied

- **1–3:** excluded entirely (read-error overhaul, persistent plan wizard draft, Quick Search).
- **4–6:** held; not added (offline Help Center, contextual facet counts, chart data tables).
- **7–12:** excluded from this package (Havuz focus package, Today plan panel, section layout,
  comparisons, lazy graphs, bundle budgets). Existing production accessibility and other
  unrelated behavior are retained.
- **13:** approved with the owner's follow-up changes: image previews use the current live
  row design, with no generated image emoji. Tapping a thumbnail opens the original locally;
  holding it (or right-clicking on web) offers “Görseli aç”. Both stay in one sheet over
  Kartlarım, preserving the list's search, filters and scroll. The remembered preview option
  defaults on; missing images leave no decorative fallback icon. Original media is unchanged.
- **14:** current live search implementation retained, with its remaining fixes applied:
  nested unbounded regex repetition is refused, Custom Study names are escaped literally,
  and old `is:relearn` scope terms are upgraded without rewriting quoted field text.
  The existing Anki 26.09.3 oracle remains the reference for supported search behavior.
- **15:** current live `website/` retained. No older Havuz site is imported. The existing
  Turkish/English search guide receives item 14's corrections through its current sources.
- **16:** approved pause behavior is retained for existing menus, pickers, backgrounding and
  whiteboard. Its original Quick Search-specific fix has no runtime target, because item 3
  is explicitly excluded. No Quick Search provider/hook or UI dependency is introduced.
- **17:** stable local field identity protects unsaved editor values and pins through field
  rename/reorder. The identity is local metadata, excluded from Anki field export. Note-type
  and Empty Cards deletion refuse read-only tabs before backup, await durable completion,
  and restore only affected rows after write failure, leaving unrelated edits intact.

## Evidence and verification

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

The owner's follow-up approved the port and requested removal of the image emoji and an
in-place “Görseli aç” action on long press. The implementation uses the shared IconButton,
MenuItem and AppSheet. Cards and Notes share the same image extraction and original viewer.
Raster thumbnails are disposable derivatives in a separate bounded cache; file invalidation,
aborted requests and web object-URL ownership are covered by focused regressions. Remote
images, SVGs and missing files are not decoded as thumbnails. Original media stays read-only.

At `http://127.0.0.1:8098/browser`, Safari's isolated local origin installed the bundled
9,575-card package. The new rows showed decoded thumbnails without the generated emoji.
Holding the first thumbnail offered “Görseli aç”; that action displayed the original over the
same Browser route. Closing returned to the same rows. A “Sinapsları” search showed two cards;
tapping its thumbnail opened the original directly without navigation. Closing preserved the
search and both results. These are desktop-web
checks, not physical-iPhone evidence.

New screenshots in the chat's visualization directory:

- `13-kartlarim-emojisiz.png` — current selected rows.
- `13-kartlarim-gorsel-acik.png` — original image over Kartlarım.

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
is not substituted. Changes are prepared locally for review; no deployment is claimed here.
