import fs from 'node:fs';
import path from 'node:path';
import { GUIDE_CATEGORIES } from '../src/data/rehber/types.ts';
import { REHBER_PART_1 } from '../src/data/rehber/part1.ts';
import { REHBER_PART_2 } from '../src/data/rehber/part2.ts';
import { REHBER_PART_3 } from '../src/data/rehber/part3.ts';
import { REHBER_PART_4 } from '../src/data/rehber/part4.ts';
import { REHBER_PART_5 } from '../src/data/rehber/part5.ts';
import { REHBER_PART_6 } from '../src/data/rehber/part6.ts';
import { REHBER_PART_7 } from '../src/data/rehber/part7.ts';

const ALL_ARTICLES = [
  ...REHBER_PART_1,
  ...REHBER_PART_2,
  ...REHBER_PART_3,
  ...REHBER_PART_4,
  ...REHBER_PART_5,
  ...REHBER_PART_6,
  ...REHBER_PART_7,
].sort((a, b) => a.order - b.order);

const stripMd = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '');
const wordCount = (s) => stripMd(s).trim().split(/\s+/).filter(Boolean).length;

const BACKSTAGE_LEAKS = [
  { re: /bu\s+sayfa\s+güncellenecek/i, label: 'backstage update promise ("bu sayfa güncellenecek")' },
  { re: /güncelleyeceğiz/i, label: 'backstage update promise ("güncelleyeceğiz")' },
  { re: /yeniden\s+(?:kontrol\s+edilip\s+güncellenecek|doğrulanacak)/i, label: 'backstage verification promise' },
  { re: /\[DOĞRULA/i, label: 'unresolved [DOĞRULA] marker' },
  { re: /Ne\s+yapabilirsiniz\?/i, label: 'siz-dili heading "Ne yapabilirsiniz?" (use "Ne yapabilirsin?")' },
  { re: />\s*(?:Markalı|Yumuşak|Markasız)\s*<|·\s*(?:Markalı|Yumuşak|Markasız)\b/, label: 'internal editorial tone tag exposed in visible UI' },
];

/**
 * Facts that were once written wrong or went stale (docs/WEBSITE_CONTENT_RULES.md §5.3).
 * Checked in every article, old and new, so a corrected error cannot come back.
 */
const KNOWN_WRONG = [
  { re: /1\.442|788 program/, label: 'stale 2026/2 ek kontenjan (ÖSYM corrected it to 774 programs / 1.416 seats on 23 Nov 2026)' },
  { re: /kılavuzun andığı YÖKDİL/i, label: 'the 2026/2 guide does not name YÖKDİL (it names YDS, Bakanlık/YÖK exams and TÖMER TIPDİL)' },
  { re: /240 soruluk/i, label: 'unsourced "240 soruluk" exam-format claim' },
  { re: /yalnızca\s+ilgili durumu takip eden ilk TUS/i, label: '%5 kesinti: training-in-progress applies to every exam, not only the first' },
  { re: /soruların yaklaşık %5’inin güncel sağlık/i, label: '%5 güncel sağlık applies to the Klinik test only' },
];

const STRICT_BANNED = [
  { re: /\bsunar\b/i, label: 'banned verb "sunar"' },
  { re: /\bsağlar\b/i, label: 'banned verb "sağlar"' },
  { re: /imkân tanır/i, label: 'banned phrase "imkân tanır"' },
  { re: /olanak verir/i, label: 'banned phrase "olanak verir"' },
  { re: /öne çıkar/i, label: 'banned phrase "öne çıkar"' },
  { re: /\bgerçekleştirilir\b/i, label: 'banned verb "gerçekleştirilir"' },
  { re: /\bkapsamlı\b/i, label: 'banned filler "kapsamlı"' },
  { re: /\beksiksiz\b/i, label: 'banned filler "eksiksiz"' },
  { re: /\bmodern\b/i, label: 'banned filler "modern"' },
  { re: /\byenilikçi\b/i, label: 'banned filler "yenilikçi"' },
  { re: /\bgüçlü\b/i, label: 'banned filler "güçlü"' },
  { re: /\beşsiz\b/i, label: 'banned filler "eşsiz"' },
  { re: /\ben iyi\b/i, label: 'banned filler "en iyi"' },
  { re: /başarıya giden yol/i, label: 'banned cliché' },
  { re: /altın öneri/i, label: 'banned cliché' },
  { re: /hayalindeki branş/i, label: 'banned cliché' },
  { re: /bu sayede/i, label: 'banned transition "bu sayede"' },
  { re: /\bböylece\b/i, label: 'banned transition "böylece"' },
  { re: /\bkısacası\b/i, label: 'banned transition "kısacası"' },
  { re: /unutma ki/i, label: 'banned transition "unutma ki"' },
  { re: /adaylarımız|değerli hekimler/i, label: 'banned formal address' },
  { re: /\bsiz\b|\bsizin\b|yapabilirsiniz|edebilirsiniz/i, label: 'siz-dili in prose' },
  { re: /&/, label: 'ampersand "&"' },
  { re: /!/, label: 'exclamation mark "!"' },
];

/** Enforces docs/WEBSITE_CONTENT_RULES.md across /rehber/ source data and emitted HTML. */
export function verifyRehberContent({ dist, check }) {
  const seenSlugs = new Set();
  const seenOrders = new Set();

  for (const a of ALL_ARTICLES) {
    check(!seenSlugs.has(a.slug), `rehber/${a.slug}: duplicate slug`);
    check(!seenOrders.has(a.order), `rehber/${a.slug}: duplicate order ${a.order}`);
    seenSlugs.add(a.slug);
    seenOrders.add(a.order);

    check(GUIDE_CATEGORIES.includes(a.category), `rehber/${a.slug}: invalid category "${a.category}"`);
    check(a.seoTitle.length <= 58, `rehber/${a.slug}: seoTitle ${a.seoTitle.length} chars (max 58)`);
    check(a.seoDescription.length >= 90 && a.seoDescription.length <= 160, `rehber/${a.slug}: seoDescription ${a.seoDescription.length} chars (90–160)`);
    check(a.actionSteps.length >= 3 && a.actionSteps.length <= 5, `rehber/${a.slug}: actionSteps count ${a.actionSteps.length} (expected 3–5)`);
    check(a.sources.length >= 2, `rehber/${a.slug}: expected >= 2 sources`);
    check(a.relatedLinks.length >= 3, `rehber/${a.slug}: expected >= 3 relatedLinks`);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date().toISOString().slice(0, 10);
    check(iso.test(a.published ?? '') && iso.test(a.updated ?? ''), `rehber/${a.slug}: published/updated must be ISO dates`);
    check(a.published <= a.updated && a.updated <= today, `rehber/${a.slug}: dates must satisfy published <= updated <= today`);
    for (const src of a.sources) {
      check(/^https:\/\//.test(src.url) || /^\/(?!\/)/.test(src.url), `rehber/${a.slug}: source URL must be https:// or site-relative: ${src.url}`);
    }
    const articleText = JSON.stringify(a);
    check(!/https?:\/\/(?:www\.)?tusankim\.com/.test(articleText), `rehber/${a.slug}: link own pages site-relative (/referanslar/), not via an absolute tusankim.com URL`);
    for (const rule of KNOWN_WRONG) {
      check(!rule.re.test(articleText), `rehber/${a.slug}: ${rule.label}`);
    }

    const allSourceUrls = a.sources.map((s) => s.url).join(' ') + ' ' + a.truthParagraphs.join(' ');
    check(!/TR,14991|TR,15070/.test(allSourceUrls), `rehber/${a.slug}: dead 404 ÖSYM URL (TR,14991/TR,15070)`);

    // Strict schema & voice rules for all new/revised articles (order >= 9)
    if (a.order >= 9) {
      const mainParts = [
        a.questionH1,
        a.directAnswer,
        ...a.whyMisconceived,
        ...a.truthParagraphs,
        a.table.caption,
        ...a.table.headers,
        ...a.table.rows.flat(),
        ...a.actionSteps,
        a.boundaryNote,
      ];
      const mainText = mainParts.map(stripMd).join(' ');
      const words = wordCount(mainText);
      check(words >= 600 && words <= 900, `rehber/${a.slug}: main body has ${words} words (expected 600–900)`);
      check(a.questionH1.length <= 75, `rehber/${a.slug}: questionH1 exceeds 75 chars (${a.questionH1.length})`);

      const proseBlocks = [
        a.directAnswer,
        ...a.whyMisconceived,
        ...a.truthParagraphs,
        ...a.actionSteps,
        a.boundaryNote,
        ...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
      ];
      for (const block of proseBlocks) {
        const clean = stripMd(block);
        const sents = clean
          .replace(/(\d)\.\s/g, '$1_DOT_ ')
          .replace(/\bmd\.\s/g, 'md_DOT_ ')
          .split(/(?<=[.?])\s+/)
          .map((s) => s.replace(/_DOT_/g, '.'));
        for (const s of sents) {
          const wc = wordCount(s);
          check(wc <= 25, `rehber/${a.slug}: sentence has ${wc} words (>25): "${s.slice(0, 70)}..."`);
        }
      }

      const fullNewText = [mainText, ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join(' ');
      for (const rule of STRICT_BANNED) {
        check(!rule.re.test(fullNewText), `rehber/${a.slug}: ${rule.label}`);
      }
      check(!/henüz\s+(?:yayımlanmadı|açıklanmadı)/i.test(fullNewText), `rehber/${a.slug}: backstage "henüz yayımlanmadı/açıklanmadı" text leaked into copy`);
    }

    // Check emitted HTML for each article
    const htmlPath = path.join(dist, 'rehber', a.slug, 'index.html');
    check(fs.existsSync(htmlPath), `rehber/${a.slug}: built HTML missing`);
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf8');
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    for (const leak of BACKSTAGE_LEAKS) {
      check(!leak.re.test(visible), `rehber/${a.slug}: ${leak.label}`);
    }
    check(!/`[^`]+`/.test(visible), `rehber/${a.slug}: raw markdown backticks leaked into HTML`);
    check(!/TR,14991|TR,15070/.test(visible), `rehber/${a.slug}: dead ÖSYM URL in built HTML`);
    check(visible.includes('id="hizli-cevap"'), `rehber/${a.slug}: missing #hizli-cevap direct answer block`);
    check(visible.includes('id="action-heading">Ne yapmalısın?</h2>'), `rehber/${a.slug}: missing sen-dili heading "Ne yapmalısın?"`);

    const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .flatMap((m) => { try { return [JSON.parse(m[1])]; } catch { return []; } });
    const artSchema = schemas.find((s) => s['@type'] === 'Article');
    check(artSchema?.datePublished === a.published && artSchema?.dateModified === a.updated, `rehber/${a.slug}: Article dates differ from the article's published/updated`);
    check(Boolean(artSchema?.speakable?.cssSelector?.includes('#hizli-cevap')), `rehber/${a.slug}: missing Article SpeakableSpecification`);
    if (a.faq?.length) {
      const faqSchema = schemas.find((s) => s['@type'] === 'FAQPage');
      check(faqSchema?.mainEntity?.length === a.faq.length, `rehber/${a.slug}: FAQPage JSON-LD count mismatch`);
    }
  }

  // Check /rehber/ index hub page
  const hubHtml = fs.readFileSync(path.join(dist, 'rehber/index.html'), 'utf8');
  const hubVisible = hubHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const leak of BACKSTAGE_LEAKS) {
    check(!leak.re.test(hubVisible), `rehber/index.html: ${leak.label}`);
  }
  check(hubVisible.includes('data-rehber-topics'), 'rehber/index.html: missing topic jump list');
  check(!/rounded-full/.test(hubVisible), 'rehber/index.html: pills are not part of the plain look');
  for (const cat of GUIDE_CATEGORIES) {
    if (!ALL_ARTICLES.some((a) => a.category === cat)) continue;
    check(hubVisible.includes(`>${cat}</h2>`), `rehber/index.html: missing section heading for category "${cat}"`);
  }

  console.log(`[verify-rehber] Audited ${ALL_ARTICLES.length} articles (schema, word count, sentence length, zero backstage leaks, JSON-LD).`);
}
