import fs from 'node:fs';
import path from 'node:path';

// Group 3 checks exercise the generated HTML/JSON, rather than source-code spelling.
export function verifySearchOutput({ dist, htmlFiles, check }) {
  const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
  const markup = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const decode = (value) => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) =>
    String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  const schemas = (html, file) => [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try { return [JSON.parse(match[1])]; }
      catch { check(false, `${file}: invalid JSON-LD`); return []; }
    });
  const byType = (list, type) => list.find((schema) => schema['@type'] === type);
  const dated = (schema, file) => {
    for (const key of ['datePublished', 'dateModified']) {
      check(/^\d{4}-\d{2}-\d{2}$/.test(schema?.[key] ?? ''), `${file}: missing ${key} from content history (fetch full git history)`);
    }
    if (schema?.datePublished && schema?.dateModified) {
      check(schema.datePublished <= schema.dateModified, `${file}: publication follows modification`);
    }
  };
  const localResource = (url, file) => {
    try {
      const parsed = new URL(url);
      check(parsed.origin === 'https://tusankim.com', `${file}: non-canonical asset URL ${url}`);
      check(fs.existsSync(path.join(dist, parsed.pathname)), `${file}: missing asset ${url}`);
    } catch { check(false, `${file}: missing/invalid asset URL`); }
  };

  for (const file of htmlFiles) {
    const rel = path.relative(dist, file);
    const html = fs.readFileSync(file, 'utf8');
    const list = schemas(html, rel);
    if (rel === '404.html') {
      check(/name="robots" content="noindex,nofollow"/.test(html), '404: missing noindex');
      check(!/property="og:|name="twitter:|rel="canonical"/.test(html), '404: canonical/social metadata returned');
      check(list.length === 0, '404: structured data returned');
      continue;
    }
    const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '');
    const description = decode(html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '');
    check(title.length > 0 && title.length <= 58, `${rel}: title has ${title.length} characters (maximum 58)`);
    check(description.length >= 90 && description.length <= 160, `${rel}: description has ${description.length} characters (90–160)`);
    if (['index.html', 'puan-hesapla/index.html', 'yardim/temel-kavramlar/index.html'].includes(rel)) {
      check(description.length >= 120 && description.length <= 155, `${rel}: targeted description must be 120–155 characters`);
    }
    check(Boolean(byType(list, 'BreadcrumbList')), `${rel}: missing BreadcrumbList`);
    if (rel.startsWith('yardim/') && rel !== 'yardim/index.html') {
      const article = byType(list, 'TechArticle');
      check(Boolean(article?.author?.['@id'] && article?.publisher?.['@id']), `${rel}: article needs author and publisher`);
      dated(article, rel);
    }
  }

  const home = read('index.html');
  const homeMarkup = markup(home);
  const elements = (homeMarkup.match(/<[a-z][a-z0-9-]*(?=[\s>])/gi) || []).length;
  const bytes = Buffer.byteLength(home);
  check(elements < 1300, `home: ${elements} elements exceeds the 1,300 element budget`);
  // The landing page (hero, proof, demo, study pace, references, tools, access, usage, FAQ)
  // shares a 72 KB static HTML budget (about 13 KB gzipped).
  check(bytes < 72000, `home: ${bytes} bytes exceeds the 72 KB HTML budget`);
  check(!/\bdata-cards=|\bdata-fsrs=/.test(home), 'home: bulk demo/simulation JSON was embedded again');
  check(home.includes('data-cards-url="/data/demo-cards.json"'), 'home: missing external demo data URL');
  check(home.includes('data-demo-retry'), 'home: external demo failure needs a retry action');
  check(home.includes('href="/sss/"'), 'home: missing link to full FAQ');
  for (const id of ['ekosistem', 'fsrs', 'kronometre', 'anki', 'neden-tusankim', 'fiyatlandirma', 'kullanim']) {
    check(homeMarkup.includes(`id="${id}"`), `home: missing requested product section #${id}`);
  }
  for (const file of htmlFiles) {
    const visible = markup(fs.readFileSync(file, 'utf8'));
    check(!/href="https?:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(visible), `${path.relative(dist, file)}: disabled WhatsApp link was rendered`);
    check(!visible.includes('id="whatsapp-heading"'), `${path.relative(dist, file)}: disabled WhatsApp support was rendered`);
  }

  const app = byType(schemas(home, 'home'), 'SoftwareApplication');
  check(Boolean(app?.publisher?.['@id'] && app?.featureList?.length && app?.softwareHelp?.url), 'home: incomplete application metadata');
  localResource(app?.screenshot, 'home screenshot');
  check(homeMarkup.includes(`href="${new URL(app?.screenshot ?? 'https://tusankim.com/').pathname}"`), 'home: screenshot must be accessible to visitors');
  check(app?.offers?.price === 0 && app?.offers?.priceCurrency === 'TRY', 'home: current free beta offer must be 0 TRY');
  const launchNote = decode(homeMarkup.replace(/<[^>]+>/g, ' ')).match(/Planlanan lansman:[^.]+\.[^.]+\./)?.[0];
  check(/beta/i.test(app?.offers?.name ?? ''), 'home: current offer must explicitly name beta access');
  check(Boolean(launchNote) === /Planlanan lansman:/.test(app?.offers?.description ?? ''), 'home: launch pricing visibility differs between page and schema');
  if (launchNote) check(app.offers.description.includes(launchNote), 'home: visible planned pricing differs from schema');

  const faqs = JSON.parse(fs.readFileSync(path.join(dist, '../src/data/faqs.json'), 'utf8'));
  const faqHtml = read('sss/index.html');
  const faq = byType(schemas(faqHtml, 'sss'), 'FAQPage');
  check(faq?.mainEntity?.length === faqs.items.length, 'sss: full FAQ schema lost questions');
  check(!byType(schemas(home, 'home'), 'FAQPage'), 'home: full FAQ schema must remain on /sss/');
  for (const tab of faqs.tabs) {
    check(faqs.items.filter((item) => item.cat === tab.key && homeMarkup.includes(item.q)).length <= 2,
      `home: more than two FAQ questions duplicated from ${tab.key}`);
  }

  const demo = JSON.parse(read('data/demo-cards.json'));
  const sourceDemo = JSON.parse(fs.readFileSync(path.join(dist, '../src/data/generated/demo-cards.json'), 'utf8'));
  check(demo.length === 11 && new Set(demo.map((card) => card.ders)).size === 11, 'demo: expected all 11 subjects');
  for (const [index, card] of demo.entries()) {
    check(JSON.stringify(card.parts) === JSON.stringify(sourceDemo[index]?.parts) && card.extra === sourceDemo[index]?.extra,
      `demo: card ${index} content changed in transit`);
  }
  check(!/Cloze-AnKingMaster|<img|<script|"reaId"/i.test(JSON.stringify(demo)), 'demo: unsafe content in external JSON');
  const tablet = read('kart-denemesi/index.html');
  check(tablet.includes('data-decks-url="/data/demo-decks.json"') && tablet.includes('data-demo-retry'), 'tablet demo: cards must load from /data/demo-decks.json with a retry action');
  check(!tablet.includes('data-demo-payload'), 'tablet demo: card JSON was embedded in the page again');
  const deckDemo = JSON.parse(read('data/demo-decks.json'));
  check(deckDemo.cards.length === 44 && new Set(deckDemo.cards.map((card) => card.deckId)).size === 11, 'tablet demo: expected 4 cards in each of 11 decks');
  check(!/Cloze-AnKingMaster|<img|<script|"reaId"|\[sound:/i.test(JSON.stringify(deckDemo)), 'tablet demo: unsafe content in external JSON');

  const calculator = byType(schemas(read('puan-hesapla/index.html'), 'calculator'), 'WebApplication');
  check(Boolean(calculator?.author?.['@id'] && calculator?.publisher?.['@id']), 'calculator: missing author/publisher');
  dated(calculator, 'calculator');

  const refs = read('referanslar/index.html');
  const dataset = byType(schemas(refs, 'references'), 'Dataset');
  check(dataset?.temporalCoverage === '2024/2026', 'references: missing 2024–2026 coverage');
  check(dataset?.distribution?.['@type'] === 'DataDownload' && dataset?.distribution?.encodingFormat === 'application/json', 'references: missing JSON distribution');
  localResource(dataset?.distribution?.contentUrl, 'references distribution');
  check(markup(refs).includes('href="/data/references.json"'), 'references: JSON download must be visible');
  for (const [file, type] of [['destek/index.html', 'ContactPage'], ['gizlilik/index.html', 'WebPage'], ['kullanim-kosullari/index.html', 'WebPage']]) {
    const page = byType(schemas(read(file), file), type);
    check(Boolean(page?.url && page?.isPartOf), `${file}: missing ${type} identity`);
  }
  console.log(`[verify-search] Home: ${bytes.toLocaleString('en-US')} HTML bytes, ${elements} elements; Group 3 metadata/schema checks executed.`);
}
