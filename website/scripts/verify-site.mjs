import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySearchOutput } from './verify-search-output.mjs';
import { verifyBrandOutput } from './verify-brand-output.mjs';
import { verifyRehberContent } from './verify-rehber-content.mjs';

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
  'tus-calisma-rehberi/index.html',
  'calisma-plani/index.html',
  'kart-denemesi/index.html',
  'referanslar/index.html',
  'puan-hesapla/index.html',
  'hakkimizda/index.html',
  'ozellikler/index.html',
  'fiyatlar/index.html',
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
  'llms.txt',
  'llms-full.txt',
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
check(htmlFiles.length === 72, `Expected 72 HTML pages (20 core + 20 rehber + 11 branş + 21 help guides), got ${htmlFiles.length}`);

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

  const ids = [...htmlNoScripts.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((match) => match[1]);
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

  // Planned paid tiers are never presented as active: any page that prices them also states the beta.
  if (/₺1\.000|ara ara reklam/.test(html)) {
    check(html.includes('henüz devrede değil'), `${rel}: paid tiers or ads shown without the beta statement`);
  }
  // No named-physician review claim until the editorial review exists (founder.json).
  check(!/kurucu hekim|"@type":"Person"|reviewedBy/i.test(html), `${rel}: physician review or Person/reviewedBy claim`);

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
check(locs.length === 71, `sitemap.xml expected 71 URLs (19 pages + 20 rehber + 11 branş + 21 help guides), found ${locs.length}`);
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
// Home keeps the working demo and separates pre-exam/current reference evidence.
check(indexHtml.includes('1.195') && indexHtml.includes('1.108'), 'index.html: missing reference totals');
check(indexHtml.includes('76/200') && indexHtml.includes('82/200') && indexHtml.includes('a78ae1f'), 'index.html: missing pre-exam/current reference distinction');
check(indexHtml.includes('data-demo-simulator') && !indexHtml.includes('data-demo-payload'), 'index.html: missing the tablet demo, or its card JSON was embedded in the page');
check(indexHtml.includes('href="/kart-denemesi/"') && indexHtml.includes('href="/calisma-plani/"') && indexHtml.includes('href="/tus-calisma-rehberi/"'), 'index.html: missing links to the tablet demo, study planner, and TUS study guide');
check(!indexHtml.includes('data-cd-announce'), 'index.html: removed countdown returned');

const guideHtml = fs.readFileSync(path.join(DIST, 'tus-calisma-rehberi/index.html'), 'utf8');
const guideVisible = guideHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
for (const anchor of ['hizli-ozet', 'tempo-ve-profiller', 'mega-deste-kiyasi', 'tus-takvimi', 'brans-stratejisi', 'puan-ve-mevzuat', 'fsrs-ve-hacim', 'kartlari-dene', 'zorluklar', 'rehber-sss', 'kaynaklar']) {
  check(guideHtml.includes(`id="${anchor}"`), `tus-calisma-rehberi: missing required section #${anchor}`);
}
check(guideHtml.includes('data-demo-simulator') && guideHtml.includes('data-decks-url="/data/demo-decks.json"'), 'tus-calisma-rehberi: missing embedded tablet card demo');
check(guideHtml.includes('Bitirilebilir deste, bitmeyen desteden önce gelir'), 'tus-calisma-rehberi: missing migrated mega-deck comparison');
check(guideHtml.includes('27 Mart 2027') && guideHtml.includes('22 Ağustos 2027'), 'tus-calisma-rehberi: missing 2027 TUS exam dates');
const guideStrugglesSection = guideVisible.match(/<section[^>]*id="zorluklar"[\s\S]*?<\/section>/)?.[0] ?? '';
const struggleArticleCount = (guideStrugglesSection.match(/<article\b/g) ?? []).length;
check(
  struggleArticleCount === 7 &&
    guideStrugglesSection.includes('Sınav yaklaşırken yeni kaynak açmak ve oturmuş bilgiyi kaybetmek') &&
    guideHtml.includes('data-faq-toggle-all'),
  `tus-calisma-rehberi: missing 7 struggles (got ${struggleArticleCount}) or FAQ expand/collapse control`,
);
check(guideHtml.includes('76/200') && guideHtml.includes('82/200') && guideHtml.includes('a78ae1f'), 'tus-calisma-rehberi: missing honest pre-exam/current reference distinction');
check(guideHtml.includes('property="og:type" content="article"') && guideHtml.includes('property="article:modified_time"'), 'tus-calisma-rehberi: missing Open Graph article metadata');
check(!/`[^`]+`/.test(guideVisible), 'tus-calisma-rehberi: raw markdown backticks leaked into visible HTML');
check(!guideVisible.includes('TR,14991') && !guideVisible.includes('TR,15070'), 'tus-calisma-rehberi: dead 404 ÖSYM citation URL found');
check(!guideVisible.includes('guide-defer'), 'tus-calisma-rehberi: content-visibility:auto class (.guide-defer) breaks TOC anchor scroll positioning');
const guideSummarySection = guideVisible.match(/<section[^>]*id="hizli-ozet"[\s\S]*?<\/section>/)?.[0] ?? '';
const guideTempoSection = guideVisible.match(/<section[^>]*id="tempo-ve-profiller"[\s\S]*?<\/section>/)?.[0] ?? '';
const guideMegaAnchorIdx = guideTempoSection.indexOf('id="mega-deste-kiyasi"');
const guideProfilesPart = guideMegaAnchorIdx > 0 ? guideTempoSection.slice(0, guideMegaAnchorIdx) : guideTempoSection;
const guideMegaPart = guideMegaAnchorIdx > 0 ? guideTempoSection.slice(guideMegaAnchorIdx) : '';
const catalogData = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/generated/catalog.json'), 'utf8'));
const expectedCardsFormatted = catalogData.totals.cards.toLocaleString('tr-TR');
const guideSummaryPace = guideSummarySection.match(
  /([\d.]+) kartta günde <strong>(\d+) yeni kart<\/strong> ile ilk tur <strong>(\d+)\. günde<\/strong> biter; (\d+) günde ortalama ([\d.]+) kart \((~[^)/]+)\/gün\)/,
);
check(Boolean(guideSummaryPace), 'tus-calisma-rehberi: #hizli-ozet missing formatted planner summary');
if (guideSummaryPace) {
  const [, summaryCards, summaryPace, summaryFinish, summaryDays, summaryAvgCards, summaryAvgDur] = guideSummaryPace;
  check(
    summaryCards === expectedCardsFormatted,
    `tus-calisma-rehberi: #hizli-ozet card count (${summaryCards}) differs from catalog.json (${expectedCardsFormatted})`,
  );
  check(
    guideProfilesPart.includes(`${summaryAvgCards} kart (${summaryAvgDur})`),
    `tus-calisma-rehberi: #hizli-ozet (${summaryAvgCards} kart, ${summaryAvgDur}) diverges from #tempo-ve-profiller`,
  );
  const mezunRow = guideProfilesPart.match(
    new RegExp(`Mezun[\\s\\S]*?${summaryPace} yeni / gün[\\s\\S]*?${summaryFinish}\\. gün[\\s\\S]*?${summaryAvgCards} kart \\(${summaryAvgDur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)[\\s\\S]*?(~[^<]+\\([\\d.]+ kart\\))`),
  );
  check(Boolean(mezunRow), 'tus-calisma-rehberi: #tempo-ve-profiller Table 1 missing matching Mezun peak row');
  if (mezunRow) {
    const mezunPeak = mezunRow[1].trim();
    check(
      guideMegaPart.includes(mezunPeak),
      `tus-calisma-rehberi: #mega-deste-kiyasi peak diverges from #tempo-ve-profiller Table 1 (${mezunPeak})`,
    );
  }
  check(
    guideVisible.includes(`${expectedCardsFormatted} kartlık BKA TUS paketinden`),
    `tus-calisma-rehberi: final CTA card count diverges from catalog.json (${expectedCardsFormatted})`,
  );
  check(
    indexHtml.includes(`Günde ${summaryPace} yeni kartla ilk turu ${summaryFinish}. günde bitirirsin; bu, günde ortalama ${summaryAvgDur} demek`),
    `index.html: HomePlan summary diverges from #hizli-ozet (${summaryPace} new/day, day ${summaryFinish}, ${summaryAvgDur})`,
  );
  const llmsTxt = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
  const llmsFull = fs.readFileSync(path.join(DIST, 'llms-full.txt'), 'utf8');
  check(
    llmsTxt.includes(`${expectedCardsFormatted} kartlık BKA TUS`),
    `llms.txt: card count diverges from catalog.json (${expectedCardsFormatted})`,
  );
  check(
    llmsFull.includes(`${expectedCardsFormatted} kart`) &&
    llmsFull.includes(`(${summaryDays} gün):** ${summaryPace} yeni/gün`) &&
    llmsFull.includes(`ilk tur ${summaryFinish}. günde biter`) &&
    llmsFull.includes(`ortalama ${summaryAvgCards} kart (${summaryAvgDur}/gün)`),
    `tus-calisma-rehberi: #hizli-ozet (${summaryPace}/gün, ${summaryFinish}. gün, ${summaryAvgCards} kart, ${summaryAvgDur}) diverges from llms-full.txt`,
  );
}

// Verify every source path declared in src/data/pages.ts exists on disk.
const pagesSrc = fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/pages.ts'), 'utf8');
const repoRoot = path.resolve(WEBSITE_ROOT, '..');
for (const match of pagesSrc.matchAll(/'(website\/src\/[^']+)'/g)) {
  check(fs.existsSync(path.join(repoRoot, match[1])), `pages.ts: non-existent source path "${match[1]}"`);
}
check(
  searchIndex.some((entry) => entry.url === '/tus-calisma-rehberi/') &&
  searchIndex.some((entry) => entry.url === '/tus-calisma-rehberi/#zorluklar') &&
  searchIndex.some((entry) => entry.url === '/tus-calisma-rehberi/#tus-takvimi'),
  'arama-index.json: missing TUS Çalışma Rehberi pillar and section entries',
);

const puanHtml = fs.readFileSync(path.join(DIST, 'puan-hesapla/index.html'), 'utf8');
check(puanHtml.includes('%5 Puan Kesintisi Kuralı'), 'puan-hesapla: missing %5 Puan Kesintisi Kuralı');
check(!puanHtml.includes('%2 Puan Kesintisi'), 'puan-hesapla: stale %2 Puan Kesintisi found');
check(puanHtml.includes('id="puan-kesinti"'), 'puan-hesapla: missing interactive #puan-kesinti checkbox');
check(puanHtml.includes('data-score-warn role="alert"'), 'puan-hesapla: validation warning must carry role="alert"');
check(puanHtml.includes('Klinik puanı: %40 Temel + %60 Klinik; Temel puanı: %60 Temel + %40 Klinik'), 'puan-hesapla: missing accurate weight footnote');

const refHtml = fs.readFileSync(path.join(DIST, 'referanslar/index.html'), 'utf8');
check(refHtml.includes('for="ref-pre"'), 'referanslar: checkbox label must explicitly associate via for="ref-pre"');

verifySearchOutput({ dist: DIST, htmlFiles, check });
verifyBrandOutput({ dist: DIST, htmlFiles, check });
verifyRehberContent({ dist: DIST, check });

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
