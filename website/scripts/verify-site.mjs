import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..');
const DIST = path.join(WEBSITE_ROOT, 'dist');
const PUBLIC_DIR = path.join(WEBSITE_ROOT, 'public');

function loadTsExports(absPath, mocks = {}) {
  const source = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const context = {
    module: mod,
    exports: mod.exports,
    require: (specifier) => {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
        return mocks[specifier];
      }
      throw new Error(`Unexpected import "${specifier}" while loading ${absPath}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, context, { filename: absPath });
  return mod.exports;
}

const fmtTrInt = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtTrDec1 = (n) => Number(n).toFixed(1).replace('.', ',');

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

const BRANCH_SLUGS = [
  'anatomi',
  'fizyoloji-histoloji-embriyoloji',
  'biyokimya',
  'mikrobiyoloji',
  'patoloji',
  'farmakoloji',
  'dahiliye',
  'pediatri',
  'genel-cerrahi',
  'kadin-dogum',
  'kucuk-stajlar',
];

const REHBER_SLUGS = [
  'tusta-kac-kart-calisilmali',
  'tus-icin-fsrs-6-nedir',
  'tus-icin-anki-uyumlu-sistem',
  'tus-puani-nasil-hesaplanir',
  '2027-tus-tarihleri-ve-calisma-plani',
  'tus-calisirken-dogru-bilinen-7-yanlis',
  'tusankim-ucretsiz-mi-nasil-kullanilir',
];

// 2. Check required routes exist
const requiredFiles = [
  'index.html',
  'referanslar/index.html',
  ...BRANCH_SLUGS.map((s) => `referanslar/${s}/index.html`),
  'rehber/index.html',
  ...REHBER_SLUGS.map((s) => `rehber/${s}/index.html`),
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
  'llms.txt',
  'llms-full.txt',
  'arama-index.json',
  'data/references.json',
  'favicon.ico',
  'favicon.svg',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'apple-touch-icon.png',
  'images/app-mark.png',
  'images/app-mark-128.webp',
  'images/app-mark-128.png',
  'images/og-home.png',
  'images/og-referanslar.png',
  'images/og-puan-hesapla.png',
  'images/og-yardim.png',
  'images/og-kurucu.png',
  'images/og-sss.png',
  'images/og-destek.png',
];
for (const rf of requiredFiles) {
  check(fs.existsSync(path.join(DIST, rf)), `Missing required built file: ${rf}`);
}
check(!fs.existsSync(path.join(DIST, 'favicon.png')), 'Stale grayscale favicon.png must be removed');
check(!fs.existsSync(path.join(DIST, 'images/og.svg')), 'Stale SVG OG image images/og.svg must be removed');
check(!fs.existsSync(path.join(WEBSITE_ROOT, 'src/assets/app-mark.png')), 'Dead duplicate src/assets/app-mark.png must stay removed');

// 2b. Asset weight, EXIF-free & color favicon invariants
const webpLogoSize = fs.existsSync(path.join(DIST, 'images/app-mark-128.webp'))
  ? fs.statSync(path.join(DIST, 'images/app-mark-128.webp')).size
  : Infinity;
const pngLogoSize = fs.existsSync(path.join(DIST, 'images/app-mark-128.png'))
  ? fs.statSync(path.join(DIST, 'images/app-mark-128.png')).size
  : Infinity;
check(webpLogoSize <= 10 * 1024, `images/app-mark-128.webp too large (${webpLogoSize} B > 10 KB)`);
check(pngLogoSize <= 15 * 1024, `images/app-mark-128.png too large (${pngLogoSize} B > 15 KB)`);
if (fs.existsSync(path.join(DIST, 'images/app-mark.png'))) {
  const masterBuf = fs.readFileSync(path.join(DIST, 'images/app-mark.png'));
  check(!masterBuf.includes(Buffer.from('eXIf')), 'images/app-mark.png must not contain an eXIf chunk');
}
for (const iconRel of ['favicon-32x32.png', 'favicon-48x48.png', 'apple-touch-icon.png']) {
  const iconPath = path.join(DIST, iconRel);
  if (fs.existsSync(iconPath)) {
    const colorType = fs.readFileSync(iconPath)[25];
    check(colorType === 2 || colorType === 6, `${iconRel}: expected RGB/RGBA color PNG (colorType 2 or 6), got ${colorType}`);
  }
}

// 3. Check CSS preservation & no low-contrast belif leftovers
const cssFiles = files.filter((f) => f.endsWith('.css'));
check(cssFiles.length > 0, 'Expected at least one built CSS file');
const allCss = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
check(allCss.includes('backdrop-filter:') && allCss.includes('-webkit-backdrop-filter:'), 'Built CSS must preserve both backdrop-filter and -webkit-backdrop-filter');
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
check(
  htmlFiles.length === 50,
  `Expected 50 HTML pages (10 core + 21 help guides + 11 branches + 8 rehber), got ${htmlFiles.length}`,
);

const r3Bans = [
  { re: /wa\.me/i, label: 'Forbidden WhatsApp wa.me link' },
  { re: /905000000000/, label: 'Forbidden placeholder phone number 905000000000' },
  { re: /\bWhatsApp\b/i, label: 'Forbidden WhatsApp reference' },
  { re: /instagram\.com\/tusankim/i, label: 'Unverified Instagram @tusankim placeholder' },
  { re: /youtube\.com\/@tusankim/i, label: 'Unverified YouTube @tusankim placeholder' },
  { re: /TusAnkiM Kurucu & Editör Ekibi/i, label: 'Stale generic founder identity' },
  { re: /7\/24\s*(?:WhatsApp|Destek)/i, label: 'Unverified 7/24 support SLA' },
  { re: /\bappStoreUrl\b/i, label: 'Forbidden appStoreUrl placeholder' },
  { re: /apps\.apple\.com/i, label: 'Unverified App Store URL' },
  { re: /play\.google\.com/i, label: 'Unverified Play Store URL' },
  { re: /\btel:/i, label: 'Forbidden tel: link' },
];

const forbiddenText = [
  { re: /Cloze-AnKingMaster/i, label: 'Cloze-AnKingMaster' },
  { re: /Sansa\s*Pro/i, label: 'Sansa Pro' },
  { re: /\bbelif\b/i, label: 'belif leftover' },
  { re: /\bBeymen\b/i, label: 'Beymen leftover' },
  { re: /facebook-domain-verification/i, label: 'Facebook verification leftover' },
  { re: /fonts\.googleapis\.com|fonts\.gstatic\.com/i, label: 'External Google Fonts call' },
  { re: /<iframe\b/i, label: 'Forbidden <iframe>' },
  { re: /\son(?:click|change|input|submit)=/i, label: 'Inline JS event handler' },
  { re: /text-ink\/45/i, label: 'Low-contrast text-ink/45' },
  ...r3Bans,
];

for (const hf of htmlFiles) {
  const rel = path.relative(DIST, hf);
  const html = fs.readFileSync(hf, 'utf8');

  check(/<html\b[^>]*\blang="tr"/.test(html), `${rel}: missing <html lang="tr">`);
  check(html.includes('href="#icerik"') && html.includes('id="icerik"'), `${rel}: missing skip link target #icerik`);
  check(html.includes('TusAnkiM bağımsız bir projedir'), `${rel}: missing independent-product disclaimer`);

  // Strip <script> blocks for markup-only structural checks (template literals inside scripts have JS expressions)
  const htmlNoScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

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
    check(!/src="\/images\/app-mark\.png"/i.test(img), `${rel}: UI <img> must use lightweight /images/app-mark-128.{webp,png}, not 1024px /images/app-mark.png`);
  }

  // Raster PNG OG + Twitter meta & favicon links
  const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] ?? '';
  const twImg = html.match(/<meta name="twitter:image" content="([^"]+)"/i)?.[1] ?? '';
  check(ogImg.endsWith('.png') && twImg.endsWith('.png'), `${rel}: og:image (${ogImg}) and twitter:image (${twImg}) must be raster .png`);
  check(/<meta property="og:image:type" content="image\/png"/i.test(html), `${rel}: missing og:image:type="image/png"`);
  check(/<meta name="twitter:title" content="[^"]+"/i.test(html), `${rel}: missing twitter:title`);
  check(/<meta name="twitter:description" content="[^"]+"/i.test(html), `${rel}: missing twitter:description`);
  check(html.includes('href="/favicon.ico"') && html.includes('href="/apple-touch-icon.png"'), `${rel}: missing favicon.ico or apple-touch-icon.png link`);

  if (rel === '404.html') {
    check(!/<meta property="og:url"/i.test(html), '404.html: noindex page must not emit og:url');
    check(!html.includes('application/ld+json'), '404.html: noindex page must not emit site JSON-LD');
  } else {
    check(html.includes('"@type":"ContactPoint"'), `${rel}: Organization JSON-LD missing ContactPoint`);
    check(html.includes('"@type":"BreadcrumbList"'), `${rel}: indexable page missing BreadcrumbList JSON-LD`);
    const decodeEntities = (s) =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    const rawTitle = decodeEntities((html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '').trim());
    const rawDesc = decodeEntities((html.match(/<meta name="description" content="([^"]+)"/i)?.[1] ?? '').trim());
    check(rawTitle.length <= 60, `${rel}: <title> exceeds 60 chars (${rawTitle.length}): "${rawTitle}"`);
    check(
      rawDesc.length >= 90 && rawDesc.length <= 160,
      `${rel}: <meta description> outside 90-160 chars (${rawDesc.length}): "${rawDesc}"`,
    );
  }

  // Forbidden content/patterns (checked across full HTML including scripts)
  for (const f of forbiddenText) {
    check(!f.re.test(html), `${rel}: forbidden pattern "${f.label}"`);
  }

  // Internal href resolution & zero raw .md links
  const hrefs = [...htmlNoScripts.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href.startsWith('#') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
    check(!/\.md(?:$|[?#])/.test(href), `${rel}: un-rewritten Markdown link "${href}"`);
    const cleanPath = href.split(/[?#]/)[0];
    if (!cleanPath || cleanPath === '/') continue;
    const stripped = cleanPath.replace(/^\/+/, '');
    const candidateFile = path.join(DIST, stripped);
    const candidateIndex = path.join(DIST, stripped, 'index.html');
    check(
      fs.existsSync(candidateFile) || fs.existsSync(candidateIndex),
      `${rel}: broken internal link "${href}"`,
    );
  }
}

// 5. Verify sitemap.xml + <lastmod> / JSON-LD dateModified sync + image sitemap
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
check(
  sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),
  'sitemap.xml must declare xmlns:image namespace',
);
const urlEntries = [
  ...sitemap.matchAll(
    /<url><loc>([^<]+)<\/loc>(?:<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>)?(?:<image:image>[\s\S]*?<\/image:image>)*<\/url>/g,
  ),
];
const sitemapImages = [...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((m) => m[1]);
check(sitemapImages.length >= 49, `sitemap.xml expected >= 49 <image:loc> entries, found ${sitemapImages.length}`);
check(
  sitemapImages.every((u) => u.startsWith('https://tusankim.com/images/') && u.endsWith('.png')),
  'All sitemap <image:loc> entries must point to https://tusankim.com/images/*.png',
);
const locs = urlEntries.map((m) => m[1]);
const sitemapLastmod = new Map(urlEntries.map((m) => [m[1], m[2] ?? null]));
check(
  locs.length === 49,
  `sitemap.xml expected 49 URLs (10 core pages + 21 help guides + 11 branches + 7 rehber articles), found ${locs.length}`,
);
check(!locs.some((u) => u.includes('/404')), 'sitemap.xml must not include 404');
check(locs.every((u) => u.startsWith('https://tusankim.com/') && u.endsWith('/')), 'All sitemap URLs must use https://tusankim.com/ and trailing slash');
const withLastmod = urlEntries.filter((m) => Boolean(m[2])).length;

// 5b. Verify Vercel host protection & immutable caching
const websiteVercel = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'vercel.json'), 'utf8'));
const hasImmutableAstro = websiteVercel.headers?.some(
  (h) => h.source === '/_astro/(.*)' && h.headers?.some((x) => x.key === 'Cache-Control' && x.value.includes('immutable')),
);
const hasWildcardPreviewNoindex = websiteVercel.headers?.some(
  (h) =>
    h.missing?.some((m) => m.type === 'host' && m.value === 'tusankim.com') &&
    h.headers?.some((x) => x.key === 'X-Robots-Tag' && x.value.includes('noindex')),
);
check(Boolean(hasImmutableAstro), 'website/vercel.json must set immutable Cache-Control on /_astro/(.*)');
check(Boolean(hasWildcardPreviewNoindex), 'website/vercel.json must send X-Robots-Tag: noindex on all non-tusankim.com hosts');
check(withLastmod === 49, `sitemap.xml expected 49/49 <lastmod> dates, found ${withLastmod}`);

for (const hf of htmlFiles) {
  const rel = path.relative(DIST, hf);
  if (rel === '404.html') continue;
  const html = fs.readFileSync(hf, 'utf8');
  const routePath = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '');
  const expectedMod = sitemapLastmod.get('https://tusankim.com' + routePath);
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const b of ldBlocks) {
    const obj = JSON.parse(b[1]);
    if (obj.dateModified) {
      check(
        obj.dateModified === expectedMod,
        `${rel}: JSON-LD dateModified (${obj.dateModified}) != sitemap.xml <lastmod> (${expectedMod})`,
      );
    }
  }
}

// 6. Verify arama-index.json
const searchIndexRaw = fs.readFileSync(path.join(DIST, 'arama-index.json'), 'utf8');
for (const ban of r3Bans) {
  check(!ban.re.test(searchIndexRaw), `arama-index.json: forbidden R3 pattern "${ban.label}"`);
}
const searchIndex = JSON.parse(searchIndexRaw);
check(Array.isArray(searchIndex) && searchIndex.length >= 50, `arama-index.json expected >= 50 entries, got ${searchIndex.length}`);

// 7. Verify public/data/references.json integrity
const refData = JSON.parse(fs.readFileSync(path.join(DIST, 'data/references.json'), 'utf8'));
check(refData.kayitlar.length === 1195, `dist/data/references.json expected 1195 records, got ${refData.kayitlar.length}`);
const refRaw = JSON.stringify(refData);
check(!/Cloze-AnKingMaster|<img|<script|"reaId"/i.test(refRaw), 'dist/data/references.json contains forbidden fields/markup');

// 8. Round 2 regression checks (ARIA, TUS regulation accuracy, contrast, keyboard, tap targets)
const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
check(indexHtml.includes('aria-labelledby="demo-tab-0"'), 'index.html: LiveCardDemo missing role="tabpanel" aria-labelledby="demo-tab-0"');
check(!indexHtml.includes('opacity-90" data-int-easy'), 'index.html: LiveCardDemo Easy grade interval must not use opacity-90 (drops contrast below 4.5:1 AA)');
check(indexHtml.includes('1.195') && indexHtml.includes('1.108'), 'index.html: Reference summary missing tr-TR formatted 1.195 / 1.108');
check(indexHtml.includes('76 / 200') && indexHtml.includes('82/200'), 'index.html: Reference summary missing 76 / 200 vs 82/200 pre-exam distinction');
check(indexHtml.includes('tabindex="0" role="region" aria-label="TUS referans özeti tablosu"'), 'index.html: Reference summary table container must be keyboard-scrollable region');

const puanHtml = fs.readFileSync(path.join(DIST, 'puan-hesapla/index.html'), 'utf8');
check(puanHtml.includes('%5 Puan Kesintisi Kuralı'), 'puan-hesapla: missing %5 Puan Kesintisi Kuralı');
check(!puanHtml.includes('%2 Puan Kesintisi'), 'puan-hesapla: stale %2 Puan Kesintisi found');
check(puanHtml.includes('id="puan-kesinti"'), 'puan-hesapla: missing interactive #puan-kesinti checkbox');
check(puanHtml.includes('data-score-warn role="alert"'), 'puan-hesapla: validation warning must carry role="alert"');
check(puanHtml.includes('Temel puanı: %70 Temel + %30 Klinik; Klinik puanı: %50 Temel + %50 Klinik'), 'puan-hesapla: missing accurate weight footnote');

const refHtml = fs.readFileSync(path.join(DIST, 'referanslar/index.html'), 'utf8');
check(refHtml.includes('for="ref-pre"'), 'referanslar: checkbox label must explicitly associate via for="ref-pre"');
check(refHtml.includes('12 ders') && refHtml.includes('11 ÖSYM TUS branşı'), 'referanslar: missing 12 ders vs 11 ÖSYM TUS branşı distinction');

// 9. Group 4 checks (R1: 21 help guides, R2: 11 branches + 7 rehber + terminology, R3: founder identity)
const kurucuHtml = fs.readFileSync(path.join(DIST, 'kurucu/index.html'), 'utf8');
check(
  kurucuHtml.includes('Uzm. Dr. Muhammet Kürşat Güçlü') &&
    kurucuHtml.includes('İzmir Çiğli') &&
    kurucuHtml.includes('KBB'),
  'kurucu/index.html: missing physician identity (Uzm. Dr. Muhammet Kürşat Güçlü, İzmir Çiğli, KBB)',
);
check(
  indexHtml.includes('Uzm. Dr. Muhammet Kürşat Güçlü'),
  'index.html: missing physician identity in Organization JSON-LD / founder teaser',
);

const helpGuideHtmlFiles = htmlFiles.filter(
  (f) => relPath(f).startsWith('yardim/') && relPath(f) !== 'yardim/index.html',
);
function relPath(f) {
  return path.relative(DIST, f);
}
check(helpGuideHtmlFiles.length === 21, `Expected 21 help guide HTML files, found ${helpGuideHtmlFiles.length}`);
for (const hf of helpGuideHtmlFiles) {
  const rel = relPath(hf);
  const html = fs.readFileSync(hf, 'utf8');
  check(html.includes('Son güncelleme:'), `${rel}: missing visible Son güncelleme`);
  check(html.includes('Uzm. Dr. Muhammet Kürşat Güçlü'), `${rel}: missing physician review signature`);
  check(
    /<a\b[^>]*href="https:\/\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/i.test(html),
    `${rel}: missing external https:// authority link`,
  );
}

const tusCardsHtml = fs.readFileSync(path.join(DIST, 'yardim/tus-kartlari/index.html'), 'utf8');
check(
  tusCardsHtml.includes('12 dersten') && tusCardsHtml.includes('11 resmî TUS branşı'),
  'yardim/tus-kartlari/index.html: missing 12 ders vs 11 branş terminology note',
);

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const extractMeta = (html) => {
  const title = decodeEntities(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '');
  const desc = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '');
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) =>
    JSON.parse(m[1]),
  );
  return { title, desc, lds };
};

const verifyDatasetSchema = (rel, html) => {
  const { lds } = extractMeta(html);
  const ds = lds.find((o) => o['@type'] === 'Dataset');
  check(Boolean(ds), `${rel}: missing Dataset JSON-LD`);
  if (ds) {
    check(
      ds.creator?.name === 'Uzm. Dr. Muhammet Kürşat Güçlü' &&
        ds.creator?.address?.addressLocality === 'Çiğli' &&
        ds.creator?.address?.addressRegion === 'İzmir' &&
        Boolean(ds.publisher?.['@id']?.endsWith('/#organization')),
      `${rel}: Dataset JSON-LD missing full founder creator/address or publisher`,
    );
  }
};

verifyDatasetSchema('referanslar/index.html', refHtml);
const kurucuMeta = extractMeta(kurucuHtml);
check(
  kurucuMeta.desc.length >= 90 && kurucuMeta.desc.length <= 160,
  `kurucu/index.html: meta description length ${kurucuMeta.desc.length} outside 90..160`,
);

for (const slug of BRANCH_SLUGS) {
  const rel = `referanslar/${slug}/index.html`;
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  const meta = extractMeta(html);
  check(meta.title.length <= 60, `${rel}: title length ${meta.title.length} > 60`);
  check(meta.desc.length >= 90 && meta.desc.length <= 160, `${rel}: meta description length ${meta.desc.length} outside 90..160`);
  verifyDatasetSchema(rel, html);
  check(html.includes('Son güncelleme:'), `${rel}: missing visible Son güncelleme`);
  check(html.includes('Uzm. Dr. Muhammet Kürşat Güçlü'), `${rel}: missing physician review signature`);
  check(html.includes('12 ders') && html.includes('11 resmî TUS branşı'), `${rel}: missing 12 ders vs 11 branş note`);
  check(
    /<a\b[^>]*href="https:\/\/www\.osym\.gov\.tr\/[^"]+"[^>]*target="_blank"/i.test(html),
    `${rel}: missing ÖSYM external authority link`,
  );
}

for (const slug of REHBER_SLUGS) {
  const rel = `rehber/${slug}/index.html`;
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  const meta = extractMeta(html);
  check(meta.title.length <= 60, `${rel}: title length ${meta.title.length} > 60 (${meta.title})`);
  check(meta.desc.length >= 90 && meta.desc.length <= 160, `${rel}: meta description length ${meta.desc.length} outside 90..160`);
  check(html.includes('Son güncelleme:'), `${rel}: missing visible Son güncelleme`);
  check(html.includes('Uzm. Dr. Muhammet Kürşat Güçlü'), `${rel}: missing physician review signature`);
  check(html.includes('Neden böyle sanılıyor?'), `${rel}: missing 8-part schema section "Neden böyle sanılıyor?"`);
  check(html.includes('Doğrusu'), `${rel}: missing 8-part schema section "Doğrusu"`);
  check(html.includes('Ne yapabilirsiniz?'), `${rel}: missing 8-part schema section "Ne yapabilirsiniz?"`);
  check(html.includes('Sınır uyarısı'), `${rel}: missing 8-part schema section "Sınır uyarısı"`);
  check(html.includes('<table'), `${rel}: missing HTML comparison table`);
  const truthMatch = html.match(/<section[^>]*aria-labelledby="truth-heading"[^>]*>([\s\S]*?)<\/section>/i);
  check(
    Boolean(truthMatch && /<a\b[^>]*href="https:\/\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/i.test(truthMatch[1])),
    `${rel}: missing inline external https:// citation inside "Doğrusu" section`,
  );
  const h1Text = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  check(h1Text.includes('?'), `${rel}: H1 must be phrased as a question ("${h1Text}")`);
  const articleHtml = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
  const articleWords = decodeEntities(articleHtml.replace(/<[^>]+>/g, ' ')).trim().split(/\s+/).filter(Boolean).length;
  check(
    articleWords >= 600 && articleWords <= 900,
    `${rel}: <article> word count ${articleWords} outside 600..900 target`,
  );
  check(
    /<a\b[^>]*href="https:\/\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/i.test(html),
    `${rel}: missing external https:// authority link`,
  );
}

// 10. Verify robots.txt AI crawlers & LLM references
const robotsPath = path.join(DIST, 'robots.txt');
if (fs.existsSync(robotsPath)) {
  const robotsText = fs.readFileSync(robotsPath, 'utf8');
  const stanzas = robotsText.trim().split(/\r?\n\s*\r?\n/);
  const hasAllowBlock = (agent) =>
    stanzas.some((block) => {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      return lines.some((l) => l === `User-agent: ${agent}`) &&
        lines.some((l) => l === 'Allow: /') &&
        !lines.some((l) => /^Disallow:\s*\//i.test(l));
    });

  check(hasAllowBlock('*'), 'robots.txt: missing User-agent: * with Allow: /');
  const requiredAiBots = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'Google-Extended',
    'ClaudeBot',
    'Claude-SearchBot',
    'PerplexityBot',
    'Perplexity-User',
    'Applebot-Extended',
    'CCBot',
  ];
  for (const bot of requiredAiBots) {
    check(hasAllowBlock(bot), `robots.txt: missing explicit User-agent: ${bot} + Allow: / stanza`);
  }
  check(/^Sitemap:\s*https:\/\/tusankim\.com\/sitemap\.xml$/m.test(robotsText), 'robots.txt: missing Sitemap: https://tusankim.com/sitemap.xml');
  check(robotsText.includes('# LLM summary: https://tusankim.com/llms.txt'), 'robots.txt: missing # LLM summary: https://tusankim.com/llms.txt');
}

// 11. Verify IndexNow key file & monorepo-safe workflow consistency
const configExports = loadTsExports(path.join(WEBSITE_ROOT, 'src/config.ts'));
const pagesExports = loadTsExports(path.join(WEBSITE_ROOT, 'src/data/pages.ts'), {
  '../config': configExports,
});
const { SITE, SOCIAL, PRICING_MODE } = configExports;

const publicKeyFiles = fs.existsSync(PUBLIC_DIR)
  ? fs.readdirSync(PUBLIC_DIR).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f))
  : [];
check(publicKeyFiles.length === 1, `Expected exactly 1 32-char lowercase hex IndexNow key file in website/public/, found ${publicKeyFiles.length}`);

let indexNowKey = '';
if (publicKeyFiles.length === 1) {
  const keyFile = publicKeyFiles[0];
  indexNowKey = keyFile.slice(0, 32);
  const distKeyPath = path.join(DIST, keyFile);
  check(fs.existsSync(distKeyPath), `Missing built IndexNow key file: dist/${keyFile}`);
  if (fs.existsSync(distKeyPath)) {
    const distKeyContent = fs.readFileSync(distKeyPath, 'utf8');
    check(
      distKeyContent === indexNowKey,
      `dist/${keyFile}: content must equal "${indexNowKey}" with no trailing newline or whitespace (got length ${distKeyContent.length})`,
    );
  }

  const workflowPath = path.join(REPO_ROOT, '.github/workflows/indexnow.yml');
  check(fs.existsSync(workflowPath), 'Missing .github/workflows/indexnow.yml');
  if (fs.existsSync(workflowPath)) {
    const wf = fs.readFileSync(workflowPath, 'utf8');
    check(wf.includes(`KEY: ${indexNowKey}`), `.github/workflows/indexnow.yml: KEY does not match ${keyFile}`);
    check(wf.includes(`HOST: ${SITE.domain}`), `.github/workflows/indexnow.yml: missing HOST: ${SITE.domain}`);
    check(/^\s*workflow_dispatch:/m.test(wf), '.github/workflows/indexnow.yml: missing workflow_dispatch trigger');
    check(/^\s*deployment_status:/m.test(wf), '.github/workflows/indexnow.yml: missing deployment_status trigger');
    check(
      wf.includes("github.event.deployment_status.state == 'success'"),
      ".github/workflows/indexnow.yml: missing deployment_status.state == 'success' filter",
    );
    check(
      wf.includes("startsWith(github.event.deployment.environment, 'Production')"),
      ".github/workflows/indexnow.yml: missing startsWith(deployment.environment, 'Production') filter",
    );
    check(
      wf.includes(`environment_url == 'https://${SITE.domain}'`),
      `.github/workflows/indexnow.yml: missing strict environment_url filter for https://${SITE.domain}`,
    );
  }
}

// 12. Drift Guard for llms.txt & llms-full.txt (source data <-> dist parity)
const catalogData = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/generated/catalog.json'), 'utf8'));
const refsSummary = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/generated/references-summary.json'), 'utf8'));
const fsrsCurves = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/generated/fsrs-curves.json'), 'utf8'));
const offerData = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/offer.json'), 'utf8'));
const examsData = JSON.parse(fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/exams.json'), 'utf8'));

const sitemapSet = new Set(locs);
const staticEndpoints = new Set([
  `https://${SITE.domain}/llms.txt`,
  `https://${SITE.domain}/llms-full.txt`,
  `https://${SITE.domain}/sitemap.xml`,
  `https://${SITE.domain}/robots.txt`,
  `https://${SITE.domain}/arama-index.json`,
  `https://${SITE.domain}/data/references.json`,
  ...(indexNowKey ? [`https://${SITE.domain}/${indexNowKey}.txt`] : []),
]);

const megaScope = fsrsCurves.scopes.find((s) => s.id === 'mega');
const finDays60 = fsrsCurves.matrix?.all?.['180']?.['60']?.fin;
const allDay270Min = fsrsCurves.matrix?.all?.['270']?.['60']?.pts?.at(-1)?.[2];
const megaDay270Min = fsrsCurves.matrix?.mega?.['270']?.['60']?.pts?.at(-1)?.[2];
const desiredRetentionPct = Math.round(Number(fsrsCurves.desiredRetention) * 100);
const coreSitemapUrls = pagesExports.sitemapPages().map((p) => `https://${SITE.domain}${pagesExports.link(p.path)}`);

function parseMarkdownTables(raw) {
  const lines = raw.split(/\r?\n/);
  const tables = [];
  const sepRe = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;
  const splitRow = (line) =>
    line
      .trim()
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/\*\*/g, '').replace(/`/g, ''));

  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i].trim();
    const sepLine = lines[i + 1].trim();
    if (headerLine.startsWith('|') && sepRe.test(sepLine)) {
      const headers = splitRow(headerLine);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      tables.push({ headers, rows });
      i = j - 1;
    }
  }
  return tables;
}

const branchSlugMap = new Map([
  ['Anatomi', 'anatomi'],
  ['Fizyoloji-Histoloji-Embriyoloji', 'fizyoloji-histoloji-embriyoloji'],
  ['Biyokimya', 'biyokimya'],
  ['Mikrobiyoloji', 'mikrobiyoloji'],
  ['Patoloji', 'patoloji'],
  ['Farmakoloji', 'farmakoloji'],
  ['Dahiliye', 'dahiliye'],
  ['Pediatri', 'pediatri'],
  ['Genel Cerrahi', 'genel-cerrahi'],
  ['Kadın Doğum', 'kadin-dogum'],
  ['Küçük Stajlar', 'kucuk-stajlar'],
]);

const checkLlmsDoc = (filename, { requireFullBreakdown, maxLines }) => {
  const filePath = path.join(DIST, filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const flat = raw.replace(/\r?\n>\s*/g, ' ').replace(/\s+/g, ' ');
  const plain = flat.replace(/`/g, '');

  // Structure & Turkish sanity
  check(raw.startsWith('# TusAnkiM'), `${filename}: must begin with "# TusAnkiM" H1 (llmstxt.org)`);
  check(/^>\s+\S+/m.test(raw), `${filename}: missing blockquote summary ("> ...")`);
  check(/[ğüşıöçĞÜŞİÖÇ]/.test(raw), `${filename}: expected Turkish content`);
  if (maxLines) {
    const lineCount = raw.split(/\r?\n/).length;
    check(lineCount <= maxLines, `${filename}: expected concise <= ${maxLines} lines, got ${lineCount}`);
  }

  // Hard bans (WhatsApp placeholder, stale figures, template leaks)
  const llmsForbidden = [
    ...r3Bans,
    { re: /822\s*\/\s*1\.?195/, label: 'stale 822/1195 ratio' },
    { re: /%77[,.]5|77[,.]5\s*%/, label: 'stale %77,5 ratio' },
    { re: /%2\s*Puan\s*Kesintisi/i, label: 'stale %2 Puan Kesintisi' },
    { re: /bağımsız hekim editör doğrulamasıyla tek tek incelenmiştir/i, label: 'premature physician verification claim' },
    { re: /bir önceki yıl TUS'a yerleşen adaylar için/i, label: 'inaccurate %5 deduction rule' },
    { re: /Cloze-AnKingMaster/i, label: 'Cloze-AnKingMaster' },
    { re: /"reaId"|reaId/i, label: 'reaId' },
    { re: /\bbelif\b/i, label: 'belif leftover' },
    { re: /\bBeymen\b/i, label: 'Beymen leftover' },
    { re: /<script\b/i, label: '<script> tag' },
    { re: /<img\b/i, label: '<img> tag' },
  ];
  for (const rule of llmsForbidden) {
    check(!rule.re.test(raw), `${filename}: forbidden pattern "${rule.label}"`);
  }

  // Independent product disclaimer & boundaries
  check(plain.includes(SITE.disclaimer), `${filename}: missing exact disclaimer "${SITE.disclaimer}"`);
  check(plain.includes('ÖSYM') && plain.includes('tıbbi tavsiye'), `${filename}: missing ÖSYM / medical-advice boundary`);
  check(plain.includes('Yakında') && plain.includes('Android'), `${filename}: missing Yakında platform boundary`);

  // Catalog numbers (catalog.json) with contextual anchoring
  check(plain.includes(fmtTrInt(catalogData.totals.cards)), `${filename}: missing catalog cards ${fmtTrInt(catalogData.totals.cards)}`);
  check(plain.includes(fmtTrInt(catalogData.totals.notes)), `${filename}: missing catalog notes ${fmtTrInt(catalogData.totals.notes)}`);
  check(
    plain.includes(`${catalogData.totals.courses} ders`) || plain.includes(`${catalogData.totals.courses} katalog dersi`),
    `${filename}: missing ${catalogData.totals.courses} courses count`,
  );
  check(
    new RegExp(`\\b${catalogData.totals.topicSubdecks}\\s+(?:konu\\s+)?alt\\s+deste`, 'i').test(plain),
    `${filename}: missing anchored ${catalogData.totals.topicSubdecks} topicSubdecks (alt deste)`,
  );
  check(plain.includes(fmtTrInt(catalogData.totals.temelCards)), `${filename}: missing temelCards ${fmtTrInt(catalogData.totals.temelCards)}`);
  check(plain.includes(fmtTrInt(catalogData.totals.klinikCards)), `${filename}: missing klinikCards ${fmtTrInt(catalogData.totals.klinikCards)}`);
  check(plain.includes(fmtTrInt(catalogData.totals.karmaCards)), `${filename}: missing karmaCards ${fmtTrInt(catalogData.totals.karmaCards)}`);

  // 12 catalog courses vs 11 ÖSYM branches + FHE distinction
  check(
    plain.includes(`${refsSummary.dersler.length} ÖSYM`) &&
      plain.includes('FHE') &&
      plain.includes('Fizyoloji-Histoloji-Embriyoloji') &&
      plain.includes('Deneme ve Soru'),
    `${filename}: must explicitly distinguish ${catalogData.totals.courses} catalog courses vs ${refsSummary.dersler.length} ÖSYM branches (FHE = Fizyoloji-Histoloji-Embriyoloji, Deneme ve Soru excluded)`,
  );

  // Reference evidence (references-summary.json) with contextual anchoring
  const ov = refsSummary.overall;
  const pre = refsSummary.preExam2026_2;
  check(plain.includes(fmtTrInt(ov.soru)), `${filename}: missing overall.soru ${fmtTrInt(ov.soru)}`);
  check(plain.includes(`${ov.destek}/${fmtTrInt(ov.soru)}`), `${filename}: missing ${ov.destek}/${fmtTrInt(ov.soru)}`);
  check(plain.includes(`%${fmtTrDec1(ov.destekOran)}`), `${filename}: missing %${fmtTrDec1(ov.destekOran)}`);
  check(
    new RegExp(`(?:\\b${ov.dogrudan}\\s+Doğrudan|Doğrudan\\s*\\(${ov.dogrudan}\\s+soru\\))`, 'i').test(plain) &&
      new RegExp(`(?:\\b${ov.dolayli}\\s+Dolaylı|Dolaylı\\s*\\(${ov.dolayli}\\s+soru\\))`, 'i').test(plain),
    `${filename}: missing anchored Doğrudan (${ov.dogrudan}) / Dolaylı (${ov.dolayli})`,
  );
  check(plain.includes(`${fmtTrInt(ov.konuKapsami)}/${fmtTrInt(ov.soru)}`), `${filename}: missing ${fmtTrInt(ov.konuKapsami)}/${fmtTrInt(ov.soru)}`);
  check(plain.includes(`%${fmtTrDec1(ov.konuKapsamiOran)}`), `${filename}: missing %${fmtTrDec1(ov.konuKapsamiOran)}`);
  check(
    new RegExp(`\\b${ov.konu}\\s+(?:yalnız\\s+konu|soru)`, 'i').test(plain) &&
      new RegExp(`\\b${ov.yok}\\s+(?:soruda\\s+)?referans\\s+yok`, 'i').test(plain),
    `${filename}: missing anchored konu (${ov.konu}) / yok (${ov.yok})`,
  );

  // 2026/2 pre-exam a78ae1f (76/200) vs current (82/200)
  check(
    plain.includes(pre.commit) &&
      plain.includes(pre.date) &&
      plain.includes(`${pre.preExamEvet}/200`) &&
      plain.includes('%38,0') &&
      plain.includes(`${pre.supportedCurrent}/200`) &&
      plain.includes('%41,0') &&
      plain.includes(`${pre.topicCoverage}/200`) &&
      plain.includes('%96,0'),
    `${filename}: missing 2026/2 pre-exam ${pre.commit} (${pre.preExamEvet}/200 %38,0) vs current (${pre.supportedCurrent}/200 %41,0, ${pre.topicCoverage}/200 %96,0) distinction`,
  );

  // FSRS-6 metrics (fsrs-curves.json) with anchored dk/gün checks
  check(plain.includes('FSRS-6'), `${filename}: missing FSRS-6`);
  check(plain.includes(`%${desiredRetentionPct}`), `${filename}: missing %${desiredRetentionPct} desired retention`);
  check(plain.includes(`${finDays60} gün`), `${filename}: missing ${finDays60} gün completion horizon`);
  check(megaScope && plain.includes(fmtTrInt(megaScope.cards)), `${filename}: missing mega deck comparison ${fmtTrInt(megaScope?.cards)}`);
  check(
    allDay270Min != null && new RegExp(`\\b${allDay270Min}\\s+dk/gün`, 'i').test(plain),
    `${filename}: missing anchored FSRS 270d load ${allDay270Min} dk/gün`,
  );
  check(
    megaDay270Min != null && new RegExp(`\\b${megaDay270Min}\\s+dk/gün`, 'i').test(plain),
    `${filename}: missing anchored mega deck 270d load ${megaDay270Min} dk/gün`,
  );

  // PRICING_MODE alignment (config.ts + offer.json) on backtick-normalized plain text
  if (PRICING_MODE === 'launch-promo') {
    const launchTier = offerData.tiers.find((t) => t.id === 'launch');
    check(/\b200\s+kart/i.test(plain) && plain.includes('₺0'), `${filename}: launch-promo missing anchored 200 kart free tier (₺0)`);
    check(launchTier && plain.includes(launchTier.price) && plain.includes(launchTier.oldPrice), `${filename}: launch-promo missing ${launchTier?.price} / ${launchTier?.oldPrice}`);
    check(plain.includes('7 gün'), `${filename}: launch-promo missing 7 gün refund guarantee`);
    check(/açık\s+önizleme/i.test(plain) && /(?:önizleme|beta)/i.test(plain), `${filename}: launch-promo missing open-preview transparency phrasing (Açık önizleme / beta)`);
  } else if (PRICING_MODE === 'free-beta') {
    check(plain.includes(offerData.freeBeta.badge) && plain.includes('₺0'), `${filename}: free-beta missing Açık Beta / ₺0`);
    check(!plain.includes('PRICING_MODE: launch-promo') && !/\(launch-promo\)/i.test(plain), `${filename}: free-beta must not label pricing mode as launch-promo`);
    check(!plain.includes('Lansman fiyatı'), `${filename}: free-beta must not advertise Lansman fiyatı`);
    check(!/Tam Erişim\s*\([^)]*₺50\s*\/\s*ay/i.test(plain), `${filename}: free-beta must not advertise launch-promo active charge`);
  }

  // Official contact & platform URLs (bidirectional with config.ts SOCIAL)
  check(plain.includes(SITE.email), `${filename}: missing SITE.email (${SITE.email})`);
  check(plain.includes(SITE.webAppUrl), `${filename}: missing SITE.webAppUrl (${SITE.webAppUrl})`);
  check(plain.includes(SITE.githubIssuesUrl), `${filename}: missing SITE.githubIssuesUrl`);
  for (const s of SOCIAL) {
    check(plain.includes(s.url), `${filename}: missing SOCIAL url ${s.url}`);
  }
  const activeSocialUrls = new Set(SOCIAL.map((s) => s.url));
  const socialUrlRe = /https?:\/\/(?:www\.)?(?:instagram\.com|youtube\.com|x\.com|twitter\.com|t\.me|linkedin\.com|tiktok\.com)\/[^\s)>\]"'`]+/gi;
  for (const m of raw.matchAll(socialUrlRe)) {
    const foundSocial = m[0].replace(/[.,;:]+$/, '');
    check(activeSocialUrls.has(foundSocial), `${filename}: unverified social URL "${foundSocial}" not present in config.ts SOCIAL`);
  }

  // Bidirectional URL parity vs sitemap.xml & pages.ts (exact Set membership, reject http://)
  const escapedHost = SITE.domain.replace(/\./g, '\\.');
  const foundUrls = [...raw.matchAll(new RegExp(`https?://${escapedHost}[^\\s)>\\]"'\`]*`, 'g'))]
    .map((m) => m[0].replace(/[.,;:]+$/, ''));
  const foundUrlSet = new Set(foundUrls);

  for (const coreUrl of coreSitemapUrls) {
    check(foundUrlSet.has(coreUrl), `${filename}: missing core page URL ${coreUrl}`);
  }
  for (const loc of locs) {
    check(foundUrlSet.has(loc), `${filename}: missing sitemap URL ${loc}`);
  }
  check(foundUrlSet.size >= locs.length, `${filename}: expected >= ${locs.length} unique site URLs, found ${foundUrlSet.size}`);
  for (const u of foundUrlSet) {
    if (staticEndpoints.has(u)) continue;
    check(
      u.startsWith('https://') && sitemapSet.has(u),
      `${filename}: URL "${u}" is insecure or does not match any live trailing-slash URL in sitemap.xml`,
    );
  }

  // Full row-level reference tables, branch link summaries & post-exam QIDs required in llms-full.txt
  if (requireFullBreakdown) {
    const tables = parseMarkdownTables(raw);
    const catalogTable = tables.find((t) => t.headers[0] === 'Ders (Katalog)');
    const examTable = tables.find((t) => t.headers[0] === 'Sınav');
    const subjectTable = tables.find((t) => t.headers[0] === 'ÖSYM TUS Branşı');

    check(Boolean(catalogTable), `${filename}: missing catalog Markdown table`);
    if (catalogTable) {
      check(
        catalogTable.rows.length === catalogData.courses.length,
        `${filename}: catalog table expected ${catalogData.courses.length} rows, got ${catalogTable.rows.length}`,
      );
      for (const c of catalogData.courses) {
        const row = catalogTable.rows.find((cells) => cells[0] === c.name || cells[0].startsWith(`${c.name} (`));
        check(
          Boolean(row) &&
            row.length >= 5 &&
            row[1].toLowerCase() === c.group.toLowerCase() &&
            row[2] === fmtTrInt(c.cards) &&
            row[3] === fmtTrInt(c.notes) &&
            row[4] === String(c.topicSubdecks),
          `${filename}: catalog table mismatch for "${c.name}" (expected group=${c.group}, cards=${fmtTrInt(c.cards)}, notes=${fmtTrInt(c.notes)}, subdecks=${c.topicSubdecks})`,
        );
      }
    }

    const checkRefRow = (table, label, expected) => {
      const row = table.rows.find((cells) => cells[0] === label);
      check(
        Boolean(row) &&
          row.length === 10 &&
          row[1] === fmtTrInt(expected.soru) &&
          row[2] === fmtTrInt(expected.dogrudan) &&
          row[3] === fmtTrInt(expected.dolayli) &&
          row[4] === fmtTrInt(expected.destek) &&
          row[5] === `%${fmtTrDec1(expected.destekOran)}` &&
          row[6] === fmtTrInt(expected.konu) &&
          row[7] === fmtTrInt(expected.konuKapsami) &&
          row[8] === `%${fmtTrDec1(expected.konuKapsamiOran)}` &&
          row[9] === fmtTrInt(expected.yok),
        `${filename}: reference table row mismatch for "${label}"`,
      );
    };

    check(Boolean(examTable), `${filename}: missing byExam Markdown table`);
    if (examTable) {
      check(
        examTable.rows.length === refsSummary.byExam.length + 1,
        `${filename}: byExam table expected ${refsSummary.byExam.length + 1} rows (6 exams + Toplam), got ${examTable.rows.length}`,
      );
      for (const e of refsSummary.byExam) {
        checkRefRow(examTable, e.sinav, e);
      }
      checkRefRow(examTable, 'Toplam', refsSummary.overall);
    }

    check(Boolean(subjectTable), `${filename}: missing bySubject Markdown table`);
    if (subjectTable) {
      check(
        subjectTable.rows.length === refsSummary.bySubject.length,
        `${filename}: bySubject table expected ${refsSummary.bySubject.length} rows, got ${subjectTable.rows.length}`,
      );
      for (const s of refsSummary.bySubject) {
        checkRefRow(subjectTable, s.ders, s);
      }
    }

    const rawLines = raw.split(/\r?\n/);
    for (const s of refsSummary.bySubject) {
      const slug = branchSlugMap.get(s.ders);
      const courseName = s.ders === 'Fizyoloji-Histoloji-Embriyoloji' ? 'FHE' : s.ders;
      const course = catalogData.courses.find((c) => c.name === courseName);
      const branchUrl = `https://${SITE.domain}/referanslar/${slug}/`;
      const branchLine = rawLines.find((l) => l.includes(branchUrl));
      const branchPlain = branchLine ? branchLine.replace(/`/g, '') : '';
      check(
        Boolean(branchLine && course) &&
          branchPlain.includes(`${s.destek}/${s.soru}`) &&
          branchPlain.includes(`%${fmtTrDec1(s.destekOran)}`) &&
          branchPlain.includes(`%${fmtTrDec1(s.konuKapsamiOran)}`) &&
          branchPlain.includes(`${fmtTrInt(course.cards)} kart`),
        `${filename}: branch link summary mismatch for ${s.ders} (${branchUrl})`,
      );
    }

    const rozetTr = { DOGRUDAN: 'DOĞRUDAN', DOLAYLI: 'DOLAYLI' };
    const preStateTr = { hayir: 'hayır', kismen: 'kısmen', evet: 'evet' };
    for (const q of pre.postExamEdited) {
      const qLine = rawLines.find((l) => l.includes(q.qid));
      const qPlain = qLine ? qLine.replace(/`/g, '') : '';
      const expectedRozet = rozetTr[q.rozet] ?? q.rozet;
      const expectedPre = preStateTr[q.sinavOncesiSurumde] ?? q.sinavOncesiSurumde;
      check(
        Boolean(qLine) &&
          qPlain.includes(q.ders) &&
          qPlain.includes(expectedRozet) &&
          qPlain.includes(`sınav öncesi sürümde: ${expectedPre}`),
        `${filename}: postExamEdited entry mismatch for ${q.qid} (${q.ders}, ${expectedRozet}, ${expectedPre})`,
      );
    }

    for (const ex of examsData.exams) {
      check(plain.includes(ex.examDateLabel), `${filename}: missing 2027 exam date ${ex.examDateLabel}`);
    }
  }
};

checkLlmsDoc('llms.txt', { requireFullBreakdown: false, maxLines: 140 });
checkLlmsDoc('llms-full.txt', { requireFullBreakdown: true, maxLines: null });

if (failures.length) {
  console.error(`[verify-site] FAILED (${failures.length} issues):`);
  for (const msg of failures) console.error(`  - ${msg}`);
  process.exit(1);
}

console.log(
  `[verify-site] PASSED: ${htmlFiles.length} HTML pages, ${locs.length} sitemap URLs, ` +
  `${searchIndex.length} search entries, ${refData.kayitlar.length} reference records, ` +
  `llms.txt/llms-full.txt Drift Guard, robots.txt AI crawlers, IndexNow (${indexNowKey}) & all WCAG/MWG/CSP/integrity checks green.`
);
