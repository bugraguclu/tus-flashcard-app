// Consistency check for docs/user-guide. Usage: node scripts/check-user-guide.mjs [repo-root]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const guide = path.join(root, 'docs/user-guide');
const problems = [];
const warn = [];
const REQUIRED = ['id', 'title', 'summary', 'order', 'web_path', 'app_help', 'app_screens', 'verified_against'];
const FORBIDDEN = [
    /tam uyumlu/i, /birebir aynı/i, /fully compatible/i, /full compatibility/i, /100% compatible/i,
    /satın almayı geri yükle/i, /tek ödeme/i, /tek seferlik satın alma/i, /restore purchase/i,
    /Apple processes payments/i, /\bAnkiWeb sync\b/i,
];

function frontMatter(text, file) {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!m) { problems.push(`${file}: missing front matter`); return {}; }
    const out = {};
    let key = null;
    for (const line of m[1].split('\n')) {
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (kv) { key = kv[1]; out[key] = kv[2].replace(/\s+#.*$/, '').trim(); continue; }
        if (key && /^\s+-\s+/.test(line)) out[key] = (out[key] ? out[key] + '\n' : '') + line.trim();
    }
    for (const k of REQUIRED) if (!(k in out) || out[k] === '') problems.push(`${file}: front matter lacks ${k}`);
    if (out.summary && out.summary.length > 160) problems.push(`${file}: summary is ${out.summary.length} chars (>160)`);
    return out;
}

function anchors(text) {
    return new Set([...text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
}

function articles(lang) {
    const dir = path.join(guide, lang);
    if (!fs.existsSync(dir)) return new Map();
    const map = new Map();
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        map.set(name, { text, fm: frontMatter(text, `${lang}/${name}`), anchors: anchors(text) });
    }
    return map;
}

const tr = articles('tr');
const en = articles('en');

for (const [name, a] of tr) {
    const b = en.get(name);
    if (!b) { warn.push(`en/${name} missing (translation pending?)`); continue; }
    if (a.fm.id !== b.fm.id) problems.push(`${name}: id differs tr=${a.fm.id} en=${b.fm.id}`);
    if (a.fm.order !== b.fm.order) problems.push(`${name}: order differs`);
    const onlyTr = [...a.anchors].filter((x) => !b.anchors.has(x));
    const onlyEn = [...b.anchors].filter((x) => !a.anchors.has(x));
    if (onlyTr.length) problems.push(`${name}: anchors only in tr: ${onlyTr.join(', ')}`);
    if (onlyEn.length) problems.push(`${name}: anchors only in en: ${onlyEn.join(', ')}`);
}
for (const name of en.keys()) if (!tr.has(name)) problems.push(`en/${name} has no tr counterpart`);

// duplicate anchors inside one file
for (const [lang, set] of [['tr', tr], ['en', en]]) {
    for (const [name, a] of set) {
        const all = [...a.text.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]);
        const dup = all.filter((x, i) => all.indexOf(x) !== i);
        if (dup.length) problems.push(`${lang}/${name}: duplicate anchors ${[...new Set(dup)].join(', ')}`);
        const lines = a.text.split('\n').length;
        if (lines > 800) warn.push(`${lang}/${name}: ${lines} lines`);
        for (const re of FORBIDDEN) if (re.test(a.text)) problems.push(`${lang}/${name}: forbidden phrase ${re}`);
        // relative links between articles
        for (const m of a.text.matchAll(/\]\(([^)\s]+)\)/g)) {
            const target = m[1];
            if (/^(https?:|mailto:)/.test(target)) continue;
            const [file, anchor] = target.split('#');
            const pool = set;
            if (file === '') {
                if (anchor && !a.anchors.has(anchor)) problems.push(`${lang}/${name}: link to missing local anchor #${anchor}`);
                continue;
            }
            if (!/^\d\d-[a-z0-9-]+\.md$/.test(file)) { problems.push(`${lang}/${name}: unexpected link target ${target}`); continue; }
            const t = pool.get(file);
            if (!t) { problems.push(`${lang}/${name}: link to missing article ${file}`); continue; }
            if (anchor && !t.anchors.has(anchor)) problems.push(`${lang}/${name}: link to missing anchor ${file}#${anchor}`);
        }
    }
}

// in-app files: "tr/NN-x.md#anchor" and "en/..." references
const inApp = path.join(guide, 'in-app');
const extra = [path.join(guide, 'README.md')];
if (fs.existsSync(inApp)) for (const n of fs.readdirSync(inApp)) if (n.endsWith('.md')) extra.push(path.join(inApp, n));
for (const file of extra) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(guide, file);
    // README quotes the forbidden phrases in its own rules section.
    if (rel !== 'README.md') for (const re of FORBIDDEN) if (re.test(text)) problems.push(`${rel}: forbidden phrase ${re}`);
    for (const m of text.matchAll(/\b(tr|en)\/(\d\d-[a-z0-9-]+\.md)(?:#([a-z0-9-]+))?/g)) {
        const set = m[1] === 'tr' ? tr : en;
        const t = set.get(m[2]);
        if (!t) { (m[1] === 'en' ? warn : problems).push(`${rel}: reference to missing ${m[1]}/${m[2]}`); continue; }
        if (m[3] && !t.anchors.has(m[3])) problems.push(`${rel}: reference to missing anchor ${m[1]}/${m[2]}#${m[3]}`);
    }
    for (const m of text.matchAll(/help\?article=([a-z-]+)(?:&section=([a-z0-9-]+))?/g)) {
        const art = [...tr.values()].find((a) => a.fm.id === m[1]);
        if (!art) { problems.push(`${rel}: help link to unknown article id ${m[1]}`); continue; }
        if (m[2] && !art.anchors.has(m[2])) problems.push(`${rel}: help link to missing section ${m[1]}#${m[2]}`);
    }
}

// ids unique, orders unique
const ids = [...tr.values()].map((a) => a.fm.id);
const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dupIds.length) problems.push(`duplicate ids: ${dupIds.join(', ')}`);

console.log(`tr: ${tr.size} articles, en: ${en.size} articles`);
for (const w of warn) console.log(`warn: ${w}`);
for (const p of problems) console.log(`FAIL: ${p}`);
if (!problems.length) console.log('OK');
process.exitCode = problems.length ? 1 : 0;
