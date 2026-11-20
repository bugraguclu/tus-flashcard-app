# TusAnkiM `website/` Engineering Contract

Read `../docs/WEBSITE_AI_HANDOFF.md` before modifying this directory. This file lists the non-negotiable invariants for AI agents working on the marketing & product website.

## Stack & Isolation
- Isolated **Astro 7 + Tailwind CSS 3** static site (`output: 'static'`, `vite.build.cssMinify: 'esbuild'`).
- Keep `../tsconfig.json` (`exclude: ["website"]`), `../metro.config.js` (`WEBSITE` in `blockList`), and `../.gitignore` (`website/{node_modules,dist,.astro}/`) intact.
- Do **not** edit `../docs/{index,privacy,support,terms}.html` or `../docs/app-store/metadata-tr.md` (verified by root `npm run verify:ios`).

## Mandatory Legal, Content & Accessibility Invariants
1. **No commercial Belif fonts**: Never add `Sansa Pro` or external Google Fonts calls. Use bundled `@fontsource/plus-jakarta-sans` (latin + latin-ext).
2. **No ÖSYM / catalog leakage**: Never publish ÖSYM question text/options, raw `.apkg`/`.tuspack` files in `public/` or `dist/`, `Cloze-AnKingMaster`, `reaId`, or unverified `<img>` tags from APKG notes.
3. **Honest reference separation**: Always keep `Doğrudan`, `Dolaylı`, and `Konu Kapsamı` separate, preserve the `2026/2` pre-exam `git a78ae1f` (`76/200`) vs current (`82/200`) distinction, and keep the independent-product Anki disclaimer in `Footer.astro`.
4. **No cross-origin app iframe**: `https://tusankim.vercel.app/` sends `X-Frame-Options: SAMEORIGIN`. Keep `#demo` as a native client-side card demo and link out in a new tab.
5. **WCAG 2.2 AA & Modern Web Guidance**:
   - Never use `#858d92`, `#b85010`, or `text-ink/45` for text. Keep `teal` (`#0e7469`), `warm` (`#a3430a`), `gradeEasy` (`#205b94`), and `inkMuted` (`#596166`).
   - Keep `<details>/<summary>` free of nested headings, native `<dialog>` free of redundant `role="dialog"` / `aria-modal`, `hidden="until-found"` panels padded only on `.tabpanel-inner`, and mobile touch targets `>= 44px`.
   - Never call vertical `scrollIntoView()` on initial load (keep `scrollY === 0` on boot).
6. **TUS regulation accuracy**: Maintain current `%5` puan kesintisi and Temel (`%70/%30`) / Klinik (`%50/%50`) weights on `/puan-hesapla/`.

## Required Verification
```bash
cd website && npm run build && npm run verify
# And from the repository root:
npm run quality
```
Note: `src/data/generated/fsrs-curves.json` is precomputed from `../lib/fsrsSimulator.ts` and committed so `npm run build` works on branches (such as `Havuz`) that do not yet carry `lib/fsrsSimulator.ts`.
