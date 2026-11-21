import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..');

const MANIFEST_PATH = path.join(REPO_ROOT, 'assets/catalog/bka-manifest.json');
const APKG_PATH = path.join(REPO_ROOT, 'assets/catalog/bka-tus-complete.apkg');
const REFERANSLAR_PATH = path.join(REPO_ROOT, 'docs/kartlar/referans-sistemi-2026-10-26/referanslar.json');

const OUT_GENERATED = path.join(WEBSITE_ROOT, 'src/data/generated');
const OUT_PUBLIC_DATA = path.join(WEBSITE_ROOT, 'public/data');

fs.mkdirSync(OUT_GENERATED, { recursive: true });
fs.mkdirSync(OUT_PUBLIC_DATA, { recursive: true });

const OSYM_ARCHIVE_URL = 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html';

const SUBJECT_GROUP = {
  'bka-anatomi': 'temel',
  'bka-fhe': 'temel',
  'bka-biyokimya': 'temel',
  'bka-mikrobiyoloji': 'temel',
  'bka-patoloji': 'temel',
  'bka-farmakoloji': 'temel',
  'bka-dahiliye': 'klinik',
  'bka-pediatri': 'klinik',
  'bka-genel-cerrahi': 'klinik',
  'bka-kucuk-stajlar': 'klinik',
  'bka-kadin-dogum': 'klinik',
  'bka-deneme-ve-soru': 'karma',
};

const DERS_ORDER = [
  'Anatomi',
  'Fizyoloji-Histoloji-Embriyoloji',
  'Biyokimya',
  'Mikrobiyoloji',
  'Patoloji',
  'Farmakoloji',
  'Dahiliye',
  'Pediatri',
  'Genel Cerrahi',
  'Kadın Doğum',
  'Küçük Stajlar',
];

const DEMO_CANDIDATES = [
  { qid: '2026/2-T005', nid: 1622380317207, shortDers: 'Anatomi' },
  { qid: '2026/2-T016', nid: 1603884173708, shortDers: 'FHE' },
  { qid: '2026/2-T033', nid: 1611058912037, shortDers: 'Biyokimya' },
  { qid: '2026/2-T050', nid: 1604266319660, shortDers: 'Mikrobiyoloji' },
  { qid: '2026/2-T067', nid: 1604579032901, shortDers: 'Patoloji' },
  { qid: '2026/2-T094', nid: 1604750706413, shortDers: 'Farmakoloji' },
  { qid: '2026/2-K004', nid: 1604993745353, shortDers: 'Dahiliye' },
  { qid: '2026/2-K037', nid: 1605268859586, shortDers: 'Pediatri', activeCloze: 2 },
  { qid: '2026/2-K075', nid: 1608384395749, shortDers: 'Genel Cerrahi' },
  { qid: '2026/2-K095', nid: 1606067047662, shortDers: 'Kadın Doğum' },
  { qid: '2026/2-K083', nid: 1604405937273, shortDers: 'Küçük Stajlar' },
];

const ENTITY_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&rarr;': '→',
  '&larr;': '←',
  '&uarr;': '↑',
  '&darr;': '↓',
  '&beta;': 'β',
  '&alpha;': 'α',
  '&gamma;': 'γ',
  '&mu;': 'μ',
  '&ge;': '≥',
  '&le;': '≤',
  '&plusmn;': '±',
  '&ndash;': '–',
  '&mdash;': '—',
};

function decodeEntities(str) {
  return String(str ?? '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos|rarr|larr|uarr|darr|beta|alpha|gamma|mu|ge|le|plusmn|ndash|mdash);/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function stripForbiddenMeta(str) {
  return str
    .replace(/Cloze-AnKingMaster/gi, '')
    .replace(/Basic \(type in the answer\)-26ee6/gi, '')
    .replace(/\[sound:[^\]]+\]/gi, '');
}

function sanitizeCardText(rawHtml, { keepCloze = false } = {}) {
  let s = stripForbiddenMeta(String(rawHtml ?? ''));
  s = s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);

  if (!keepCloze) {
    s = s.replace(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_, ans) => ans.trim());
  }

  s = s
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[-]{4,}/g, ' · ')
    .trim();

  return s;
}

function makeExcerpt(rawF0, rawF1, maxLen = 210) {
  let main = sanitizeCardText(rawF0, { keepCloze: false })
    .replace(/\n+/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:\s*·\s*){2,}/g, ' · ')
    .trim();

  if (main.length < 48 && rawF1) {
    const back = sanitizeCardText(rawF1, { keepCloze: false })
      .replace(/\n+/g, ' · ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (back) {
      main = main ? `${main} → ${back}` : back;
    }
  }

  if (main.length > maxLen) {
    return main.slice(0, maxLen - 1).replace(/\s+\S*$/, '').trim() + '…';
  }
  return main;
}

function parseClozeSegments(rawHtml) {
  const clean = sanitizeCardText(rawHtml, { keepCloze: true });
  const parts = [];
  const regex = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  let lastIndex = 0;
  let match;
  let clozeCount = 0;

  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: clean.slice(lastIndex, match.index) });
    }
    const index = Number(match[1]);
    const answer = match[2].replace(/\n+/g, ' · ').trim();
    const hint = match[3] ? match[3].trim() : '';
    parts.push({ type: 'cloze', index, answer, ...(hint ? { hint } : {}) });
    clozeCount += 1;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < clean.length) {
    parts.push({ type: 'text', value: clean.slice(lastIndex) });
  }

  return { parts, clozeCount };
}

async function readApkgNotes() {
  const buf = fs.readFileSync(APKG_PATH);
  const zip = await JSZip.loadAsync(buf);
  const dbEntry = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!dbEntry) throw new Error('APKG missing collection database');

  const tmpPath = path.join(os.tmpdir(), `tusankim-web-build-${process.pid}-${Date.now()}.sqlite`);
  fs.writeFileSync(tmpPath, await dbEntry.async('nodebuffer'));

  try {
    const db = new DatabaseSync(tmpPath, { open: true, readOnly: true });
    const decksRow = db.prepare('SELECT decks FROM col').get();
    const decks = JSON.parse(decksRow.decks);

    const deckByNid = new Map();
    for (const row of db.prepare('SELECT nid, did FROM cards').all()) {
      if (!deckByNid.has(row.nid)) {
        const rawName = decks[String(row.did)]?.name ?? '';
        deckByNid.set(row.nid, rawName.replace(/\s+BKA$/i, '').trim());
      }
    }

    const notes = new Map();
    for (const row of db.prepare('SELECT id, guid, flds FROM notes').all()) {
      const flds = String(row.flds ?? '').split('\x1f');
      notes.set(Number(row.id), {
        id: Number(row.id),
        guid: String(row.guid),
        f0: flds[0] ?? '',
        f1: flds[1] ?? '',
        deck: deckByNid.get(Number(row.id)) ?? '',
      });
    }
    db.close();
    return notes;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

function buildCatalog(manifest) {
  const courses = manifest.courses
    .map((c) => {
      const subdecks = c.topics.filter((t) => t.deck === true);
      return {
        id: c.id,
        name: c.name,
        group: SUBJECT_GROUP[c.id] ?? 'karma',
        notes: c.notes,
        cards: c.cards,
        topicSubdecks: subdecks.length,
        topTopics: subdecks
          .slice()
          .sort((a, b) => b.cards - a.cards)
          .slice(0, 5)
          .map((t) => ({ name: t.name, cards: t.cards })),
      };
    })
    .sort((a, b) => b.cards - a.cards);

  const totals = {
    cards: courses.reduce((s, c) => s + c.cards, 0),
    notes: courses.reduce((s, c) => s + c.notes, 0),
    courses: courses.length,
    topicSubdecks: courses.reduce((s, c) => s + c.topicSubdecks, 0),
    temelCards: courses.filter((c) => c.group === 'temel').reduce((s, c) => s + c.cards, 0),
    klinikCards: courses.filter((c) => c.group === 'klinik').reduce((s, c) => s + c.cards, 0),
    karmaCards: courses.filter((c) => c.group === 'karma').reduce((s, c) => s + c.cards, 0),
  };

  return {
    generatedAt: '2026-10-26',
    catalogShaShort: String(manifest.sha256 ?? '').slice(0, 12),
    totals,
    courses,
  };
}

function buildReferences(rawRef, notesMap) {
  const records = rawRef.kayitlar.map((r) => {
    const firstNid = Array.isArray(r.notIds) && r.notIds.length > 0 ? Number(r.notIds[0]) : null;
    const note = firstNid ? notesMap.get(firstNid) : null;
    const kartOzet = note ? makeExcerpt(note.f0, note.f1, 210) : '';

    return {
      qid: r.qid,
      sinav: r.sinav,
      test: r.test,
      no: r.no,
      ders: r.ders,
      rozet: r.rozet,
      olculenBilgi: stripForbiddenMeta(String(r.olculenBilgi ?? '')).trim(),
      eksikAdim: stripForbiddenMeta(String(r.eksikAdim ?? '')).trim(),
      sinavOncesiSurumde: r.sinavOncesiSurumde ?? null,
      cardId: firstNid ? `BKA-${String(firstNid).slice(-6)}` : null,
      kartOzet,
    };
  });

  const summarize = (list) => {
    const total = list.length;
    let dogrudan = 0;
    let dolayli = 0;
    let konu = 0;
    let yok = 0;
    for (const r of list) {
      if (r.rozet === 'DOGRUDAN') dogrudan++;
      else if (r.rozet === 'DOLAYLI') dolayli++;
      else if (r.rozet === 'KONU') konu++;
      else yok++;
    }
    const destek = dogrudan + dolayli;
    const konuKapsami = dogrudan + dolayli + konu;
    return {
      soru: total,
      dogrudan,
      dolayli,
      destek,
      destekOran: Number(((destek / total) * 100).toFixed(1)),
      konu,
      konuKapsami,
      konuKapsamiOran: Number(((konuKapsami / total) * 100).toFixed(1)),
      yok,
    };
  };

  const sinavlar = ['2026/2', '2026/1', '2025/2', '2025/1', '2024/2', '2024/1'];

  const byExam = sinavlar.map((sinav) => {
    const rows = records.filter((r) => r.sinav === sinav);
    const bySubject = DERS_ORDER.map((ders) => {
      const sRows = rows.filter((r) => r.ders === ders);
      return { ders, ...summarize(sRows) };
    });
    return { sinav, ...summarize(rows), bySubject };
  });

  const bySubject = DERS_ORDER.map((ders) => {
    const rows = records.filter((r) => r.ders === ders);
    return { ders, ...summarize(rows) };
  });

  const rows2026_2 = records.filter((r) => r.sinav === '2026/2');
  const preExam2026_2 = {
    commit: 'a78ae1f',
    date: '21 Ağustos 2026',
    supportedCurrent: rows2026_2.filter((r) => r.rozet === 'DOGRUDAN' || r.rozet === 'DOLAYLI').length,
    preExamEvet: rows2026_2.filter((r) => r.sinavOncesiSurumde === 'evet').length,
    preExamKismen: rows2026_2.filter((r) => r.sinavOncesiSurumde === 'kismen').length,
    preExamHayir: rows2026_2.filter((r) => r.sinavOncesiSurumde === 'hayir').length,
    topicCoverage: rows2026_2.filter((r) => r.rozet !== 'YOK').length,
    postExamEdited: rows2026_2
      .filter((r) => r.sinavOncesiSurumde === 'kismen' || r.sinavOncesiSurumde === 'hayir')
      .map((r) => ({
        qid: r.qid,
        ders: r.ders,
        rozet: r.rozet,
        sinavOncesiSurumde: r.sinavOncesiSurumde,
        olculenBilgi: r.olculenBilgi,
      })),
  };

  const summary = {
    tarih: rawRef.tarih,
    katalogCommit: rawRef.katalog.commit,
    katalogShaShort: rawRef.katalog.sha256.slice(0, 12),
    sinavlar,
    dersler: DERS_ORDER,
    overall: summarize(records),
    preExam2026_2,
    byExam,
    bySubject,
    featuredSamples: records
      .filter((r) => r.sinav === '2026/2' && r.rozet === 'DOGRUDAN' && r.sinavOncesiSurumde === 'evet' && r.kartOzet.length > 20)
      .slice(0, 24),
  };

  return { records, summary };
}

function buildDemoCards(rawRef, notesMap) {
  const byQid = new Map(rawRef.kayitlar.map((r) => [r.qid, r]));
  const cards = [];

  for (const item of DEMO_CANDIDATES) {
    const ref = byQid.get(item.qid);
    const note = notesMap.get(item.nid);
    if (!ref || !note) {
      throw new Error(`Demo candidate missing: ${item.qid} / ${item.nid}`);
    }
    if (ref.rozet !== 'DOGRUDAN' || ref.sinavOncesiSurumde !== 'evet') {
      throw new Error(`Demo candidate is not pre-exam DOGRUDAN: ${item.qid}`);
    }
    const { parts, clozeCount } = parseClozeSegments(note.f0);
    if (clozeCount === 0) {
      throw new Error(`Demo candidate has no cloze deletion: ${item.qid}`);
    }
    const extraClean = note.f1 && !/<img/i.test(note.f1)
      ? sanitizeCardText(note.f1, { keepCloze: false }).replace(/\n+/g, ' ').trim()
      : '';

    cards.push({
      id: `demo-${item.qid.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      qid: ref.qid,
      sinav: ref.sinav,
      test: ref.test,
      no: ref.no,
      ders: ref.ders,
      shortDers: item.shortDers,
      deck: note.deck || item.shortDers,
      olculenBilgi: ref.olculenBilgi,
      cardId: `BKA-${String(note.id).slice(-6)}`,
      activeCloze: item.activeCloze ?? 1,
      parts,
      extra: extraClean,
      osymUrl: OSYM_ARCHIVE_URL,
      // Typical FSRS-6 first-review intervals (defaults: w0..w3)
      intervals: {
        again: '10 dk',
        hard: '1 gün',
        good: '3 gün',
        easy: '8 gün',
      },
    });
  }

  return cards;
}

function verifyOutputs(catalog, summary, records, demoCards) {
  const serialized = JSON.stringify({ catalog, summary, records, demoCards });
  const forbidden = [
    { re: /Cloze-AnKingMaster/i, label: 'Cloze-AnKingMaster leakage' },
    { re: /Basic \(type in the answer\)/i, label: 'Basic note type leakage' },
    { re: /<img\b/i, label: 'Raw <img> tag leakage' },
    { re: /<script\b/i, label: 'Raw <script> tag leakage' },
    { re: /"reaId"\s*:/i, label: 'reaId field leakage' },
    { re: /\bA\)\s+\S+[\s\S]{0,80}\bB\)\s+\S+[\s\S]{0,80}\bC\)\s+\S+/i, label: 'ÖSYM option pattern' },
  ];
  for (const check of forbidden) {
    if (check.re.test(serialized)) {
      throw new Error(`Security/integrity check failed: ${check.label}`);
    }
  }

  const assertEq = (actual, expected, name) => {
    if (actual !== expected) throw new Error(`Count mismatch for ${name}: expected ${expected}, got ${actual}`);
  };
  assertEq(catalog.totals.cards, 9575, 'catalog cards');
  assertEq(catalog.totals.notes, 7721, 'catalog notes');
  assertEq(catalog.totals.courses, 12, 'catalog courses');
  assertEq(catalog.totals.topicSubdecks, 106, 'catalog topicSubdecks');
  assertEq(records.length, 1195, 'reference records');
  assertEq(summary.overall.dogrudan, 333, 'overall DOGRUDAN');
  assertEq(summary.overall.dolayli, 188, 'overall DOLAYLI');
  assertEq(summary.overall.destek, 521, 'overall destek');
  assertEq(summary.overall.konuKapsami, 1108, 'overall konuKapsami');
  assertEq(summary.preExam2026_2.supportedCurrent, 82, '2026/2 current supported');
  assertEq(summary.preExam2026_2.preExamEvet, 76, '2026/2 pre-exam evet');
  assertEq(summary.preExam2026_2.preExamKismen, 4, '2026/2 pre-exam kismen');
  assertEq(summary.preExam2026_2.preExamHayir, 2, '2026/2 pre-exam hayir');
  assertEq(summary.preExam2026_2.topicCoverage, 192, '2026/2 topic coverage');
  assertEq(demoCards.length, 11, 'demo cards count');
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const rawRef = JSON.parse(fs.readFileSync(REFERANSLAR_PATH, 'utf8'));
  const notesMap = await readApkgNotes();

  const catalog = buildCatalog(manifest);
  const { records, summary } = buildReferences(rawRef, notesMap);
  const demoCards = buildDemoCards(rawRef, notesMap);

  verifyOutputs(catalog, summary, records, demoCards);

  fs.writeFileSync(path.join(OUT_GENERATED, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_GENERATED, 'references-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_GENERATED, 'demo-cards.json'), JSON.stringify(demoCards, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_PUBLIC_DATA, 'references.json'), JSON.stringify({
    tarih: rawRef.tarih,
    katalogCommit: rawRef.katalog.commit,
    sinavOncesi2026_2: 'a78ae1f (2026-08-21)',
    osymUrl: OSYM_ARCHIVE_URL,
    kayitlar: records,
  }));

  const refBytes = fs.statSync(path.join(OUT_PUBLIC_DATA, 'references.json')).size;
  console.log(
    `[build-data] Verified OK: ${catalog.totals.cards} cards, ${catalog.totals.notes} notes, ` +
    `${records.length} references (${summary.overall.destek} destek / ${summary.preExam2026_2.preExamEvet} 2026/2 pre-exam), ` +
    `${demoCards.length} demo cards. public/data/references.json = ${(refBytes / 1024).toFixed(1)} KB.`
  );
}

main().catch((err) => {
  console.error('[build-data] FAILED:', err);
  process.exit(1);
});
