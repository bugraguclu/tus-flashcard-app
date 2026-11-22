import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySearchOutput } from './verify-search-output.mjs';
import { verifyBrandOutput } from './verify-brand-output.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(WEBSITE_ROOT, 'dist');

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('[verify-site] dist/ missing. Run npm run build first.');
  process.exit(1);
}

const files = walk(DIST);
const relFiles = files.map((f) => path.relative(DIST, f));

// 1. No raw .apkg / .tuspack in dist
for (const rf of relFiles) {
  check(!/\.(apkg|tuspack)$/i.test(rf), `Forbidden catalog package in dist: ${rf}`);
}

// 2. Check required routes exist
const requiredFiles = [
  'index.html',
  'referanslar/index.html',
  'puan-hesapla/index.html',
  'kurucu/index.html',
  'sss/index.html',
  'yardim/index.html',
  'yardim/tusankim-nedir/index.html',
  'yardim/fsrs/index.html',
  'yardim/anki-ile-kullanma/index.html',
  'yardim/sozluk/index.html',
  'gizlilik/index.html',
  'kullanim-kosullari/index.html',
  'destek/index.html',
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'arama-index.json',
  'data/references.json',
];
for (const rf of requiredFiles) {
  check(fs.existsSync(path.join(DIST, rf)), `Missing required built file: ${rf}`);
}

// 3. Check CSS preservation & no low-contrast belif leftovers
const cssFiles = files.filter((f) => f.endsWith('.css'));
check(cssFiles.length > 0, 'Expected at least one built CSS file');
const allCss = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
check(!/Sansa\s*Pro/i.test(allCss), 'Built CSS must not reference commercial Sansa Pro font');
check(!/#858d92/i.test(allCss), 'Built CSS must not use non-AA #858d92');
check(!/#b85010/i.test(allCss), 'Built CSS must not use sub-AA #b85010 warm token (use #a3430a)');
check(!/\[hidden\]\s*\{\s*display:\s*none\s*!important\s*\}/i.test(allCss), 'Bare [hidden]{display:none!important} breaks hidden="until-found"');

// 3b. Check SVGs for sub-AA #b85010 warm color
for (const svgFile of files.filter((f) => f.endsWith('.svg'))) {
  const svgText = fs.readFileSync(svgFile, 'utf8');
  check(!/#b85010/i.test(svgText), `${path.relative(DIST, svgFile)}: contains sub-AA #b85010 (use #a3430a)`);
}

// 4. Audit every HTML page
const htmlFiles = files.filter((f) => f.endsWith('.html'));
check(htmlFiles.length === 31, `Expected 31 HTML pages (10 core + 21 help guides), got ${htmlFiles.length}`);

const forbiddenText = [
  { re: /7\s*gün[^<.]{0,80}iade|koşulsuz\s+iade|iade\s+garantisi/i, label: 'Removed refund promise' },
  { re: /Cloze-AnKingMaster/i, label: 'Cloze-AnKingMaster' },
  { re: /Sansa\s*Pro/i, label: 'Sansa Pro' },
  { re: /\bbelif\b/i, label: 'belif leftover' },
  { re: /\bBeymen\b/i, label: 'Beymen leftover' },
  { re: /facebook-domain-verification/i, label: 'Facebook verification leftover' },
  { re: /fonts\.googleapis\.com|fonts\.gstatic\.com/i, label: 'External Google Fonts call' },
  { re: /<iframe\b/i, label: 'Forbidden <iframe>' },
  { re: /\son(?:click|change|input|submit)=/i, label: 'Inline JS event handler' },
  { re: /text-ink\/45/i, label: 'Low-contrast text-ink/45' },
];

for (const hf of htmlFiles) {
  const rel = path.relative(DIST, hf);
  const html = fs.readFileSync(hf, 'utf8');

  check(/<html\b[^>]*\blang="tr"/.test(html), `${rel}: missing <html lang="tr">`);
  check(html.includes('href="#icerik"') && html.includes('id="icerik"'), `${rel}: missing skip link target #icerik`);
  check(html.includes('TusAnkiM bağımsız bir projedir'), `${rel}: missing independent-product disclaimer`);

  // Strip <script> blocks for markup-only structural checks (template literals inside scripts have JS expressions)
  const htmlNoScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const ids = [...htmlNoScripts.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  check(new Set(ids).size === ids.length, `${rel}: duplicate element IDs`);
  if (rel.startsWith('yardim/') && rel !== 'yardim/index.html') {
    check(html.includes('data-help-steps'), `${rel}: missing short starting steps`);
    const detailGroups = html.match(/data-help-detail/g) || [];
    check(detailGroups.length >= 2 && detailGroups.length <= 5, `${rel}: expected 2–5 reading groups`);
    check(!html.includes('aria-label="Tüm yardım rehberleri"'), `${rel}: repeated full guide navigation returned`);
  }

  // Single H1 per page + sequential non-skipping heading hierarchy
  const headingLevels = [...htmlNoScripts.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1Count = headingLevels.filter((n) => n === 1).length;
  check(h1Count === 1, `${rel}: expected exactly 1 <h1>, found ${h1Count}`);
  for (let i = 1; i < headingLevels.length; i++) {
    check(
      headingLevels[i] <= headingLevels[i - 1] + 1,
      `${rel}: heading level skipped from h${headingLevels[i - 1]} to h${headingLevels[i]}`,
    );
  }

  // Exactly one <main>, <header>, <footer> landmark per page
  check((htmlNoScripts.match(/<main\b/gi) || []).length === 1, `${rel}: expected exactly 1 <main>`);
  check((htmlNoScripts.match(/<header\b/gi) || []).length === 1, `${rel}: expected exactly 1 <header>`);
  check((htmlNoScripts.match(/<footer\b/gi) || []).length === 1, `${rel}: expected exactly 1 <footer>`);
  check(/<title>[^<]+<\/title>/i.test(htmlNoScripts), `${rel}: missing non-empty <title>`);

  // No headings inside <summary>
  const summaries = htmlNoScripts.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/gi) || [];
  for (const s of summaries) {
    check(!/<h[1-6]\b/i.test(s), `${rel}: heading found inside <summary>`);
  }

  // Native <dialog> must not carry role="dialog" or aria-modal
  const dialogs = htmlNoScripts.match(/<dialog\b[^>]*>/gi) || [];
  for (const d of dialogs) {
    check(!/\brole="dialog"/i.test(d), `${rel}: native <dialog> has redundant role="dialog"`);
    check(!/\baria-modal=/i.test(d), `${rel}: native <dialog> has redundant aria-modal`);
  }

  // Every <img> must have alt, width, height, and never combine fetchpriority="high" + loading="lazy"
  const imgs = htmlNoScripts.match(/<img\b[^>]*>/gi) || [];
  for (const img of imgs) {
    check(/\balt=/i.test(img), `${rel}: <img> missing alt: ${img.slice(0, 80)}`);
    check(/\bwidth=/i.test(img) && /\bheight=/i.test(img), `${rel}: <img> missing width/height: ${img.slice(0, 80)}`);
    check(!(/\bfetchpriority="high"/i.test(img) && /\bloading="lazy"/i.test(img)), `${rel}: <img> combines fetchpriority=high and loading=lazy`);
  }

  // Forbidden content/patterns (checked across full HTML including scripts)
  for (const f of forbiddenText) {
    check(!f.re.test(html), `${rel}: forbidden pattern "${f.label}"`);
  }

  // Internal href resolution & zero raw .md links
  const hrefs = [...htmlNoScripts.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href.startsWith('#')) {
      check(ids.includes(decodeURIComponent(href.slice(1))), `${rel}: missing local anchor ${href}`);
      continue;
    }
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
    check(!/\.md(?:$|[?#])/.test(href), `${rel}: un-rewritten Markdown link "${href}"`);
    const cleanPath = href.split(/[?#]/)[0];
    if (!cleanPath || cleanPath === '/') continue;
    const stripped = cleanPath.replace(/^\/+/, '');
    const candidateFile = path.join(DIST, stripped);
    const candidateIndex = path.join(DIST, stripped, 'index.html');
    if (href.includes('#')) {
      const targetPath = fs.existsSync(candidateIndex) ? candidateIndex : candidateFile;
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        const targetHtml = fs.readFileSync(targetPath, 'utf8');
        const fragment = decodeURIComponent(href.split('#')[1]);
        check(targetHtml.includes(`id="${fragment}"`), `${rel}: broken fragment "${href}"`);
      }
    }
    check(
      fs.existsSync(candidateFile) || fs.existsSync(candidateIndex),
      `${rel}: broken internal link "${href}"`,
    );
  }
}

// 5. Verify sitemap.xml
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(locs.length === 30, `sitemap.xml expected 30 URLs (9 pages + 21 help guides), found ${locs.length}`);
check(!locs.some((u) => u.includes('/404')), 'sitemap.xml must not include 404');
check(locs.every((u) => u.startsWith('https://tusankim.com/') && u.endsWith('/')), 'All sitemap URLs must use https://tusankim.com/ and trailing slash');

// 6. Verify arama-index.json
const searchIndex = JSON.parse(fs.readFileSync(path.join(DIST, 'arama-index.json'), 'utf8'));
check(Array.isArray(searchIndex) && searchIndex.length >= 50, `arama-index.json expected >= 50 entries, got ${searchIndex.length}`);
for (const { url } of searchIndex) {
  const target = new URL(url, 'https://tusankim.com');
  const file = path.join(DIST, target.pathname, 'index.html');
  check(target.origin === 'https://tusankim.com' && fs.existsSync(file), `arama-index.json: broken destination ${url}`);
  if (target.hash && fs.existsSync(file)) {
    check(fs.readFileSync(file, 'utf8').includes(`id="${target.hash.slice(1)}"`), `arama-index.json: missing fragment ${url}`);
  }
}

// 7. Verify public/data/references.json integrity
const refData = JSON.parse(fs.readFileSync(path.join(DIST, 'data/references.json'), 'utf8'));
check(refData.kayitlar.length === 1195, `dist/data/references.json expected 1195 records, got ${refData.kayitlar.length}`);
const refRaw = JSON.stringify(refData);
check(!/Cloze-AnKingMaster|<img|<script|"reaId"/i.test(refRaw), 'dist/data/references.json contains forbidden fields/markup');

// 8. Round 2 regression checks (ARIA, TUS regulation accuracy, contrast, keyboard, tap targets)
const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
check(indexHtml.includes('for="demo-subject"') && indexHtml.includes('id="demo-subject"'), 'index.html: demo subject picker needs an associated label');
// Home keeps the working demo and separates pre-exam/current reference evidence.
check(indexHtml.includes('1.195') && indexHtml.includes('1.108'), 'index.html: missing reference totals');
check(indexHtml.includes('76/200') && indexHtml.includes('82/200') && indexHtml.includes('a78ae1f'), 'index.html: missing pre-exam/current reference distinction');
check(indexHtml.includes('data-demo-prev') && indexHtml.includes('data-demo-next'), 'index.html: missing demo navigation');
check(!indexHtml.includes('data-cd-announce'), 'index.html: removed countdown returned');

const puanHtml = fs.readFileSync(path.join(DIST, 'puan-hesapla/index.html'), 'utf8');
check(puanHtml.includes('%5 Puan Kesintisi Kuralı'), 'puan-hesapla: missing %5 Puan Kesintisi Kuralı');
check(!puanHtml.includes('%2 Puan Kesintisi'), 'puan-hesapla: stale %2 Puan Kesintisi found');
check(puanHtml.includes('id="puan-kesinti"'), 'puan-hesapla: missing interactive #puan-kesinti checkbox');
check(puanHtml.includes('data-score-warn role="alert"'), 'puan-hesapla: validation warning must carry role="alert"');
check(puanHtml.includes('Temel puanı: %70 Temel + %30 Klinik; Klinik puanı: %50 Temel + %50 Klinik'), 'puan-hesapla: missing accurate weight footnote');

const refHtml = fs.readFileSync(path.join(DIST, 'referanslar/index.html'), 'utf8');
check(refHtml.includes('for="ref-pre"'), 'referanslar: checkbox label must explicitly associate via for="ref-pre"');

verifySearchOutput({ dist: DIST, htmlFiles, check });
verifyBrandOutput({ dist: DIST, htmlFiles, check });

if (failures.length) {
  console.error(`[verify-site] FAILED (${failures.length} issues):`);
  for (const msg of failures) console.error(`  - ${msg}`);
  process.exit(1);
}

console.log(
  `[verify-site] PASSED: ${htmlFiles.length} HTML pages, ${locs.length} sitemap URLs, ` +
  `${searchIndex.length} search entries, ${refData.kayitlar.length} reference records, ` +
  `structural, content and integrity checks green.`
);
