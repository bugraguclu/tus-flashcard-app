// Build per-user server databases in the revised layout, measure them, and set up the load test.
//   node gen.mjs <dir> <loadUsers>   (each load user is a 4.8 MB copy of the typical collection)
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { mkdirSync, rmSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { USER_SCHEMA, KIND } from './schema.mjs';

const DIR = process.argv[2];
const LOAD_USERS = Number(process.argv[3] ?? 300);
rmSync(DIR, { recursive: true, force: true });
mkdirSync(join(DIR, 'collections'), { recursive: true });

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
const T0 = 1_780_000_000_000;
const hlc = (ms) => ms * 1000 + ri(0, 3);

function schedGroup(cid, reviewed) {
    const lrt = Math.floor(T0 / 1000) + ri(0, 30_000_000);
    const v = { type: reviewed ? 2 : 1, queue: reviewed ? 2 : 1, due: ri(20_000, 21_000), ivl: ri(1, 400), factor: ri(100, 1000),
        reps: ri(1, 30), lapses: ri(0, 5), left: 0, lastReview: lrt * 1000 + ri(0, 999) };
    if (reviewed) v.ankiData = JSON.stringify({ s: +(rand() * 400 + 0.5).toFixed(4), d: +(rand() * 9 + 1).toFixed(4), dr: 0.9, lrt });
    return [v, hlc(lrt * 1000), ri(0, 2)];
}

function cardFields(cid, deckId, reviewed) {
    const sched = schedGroup(cid, reviewed);
    return { sched, place: [{ deckId, odid: 0, odue: 0 }, sched[1] - ri(1, 9e9), sched[2]], flag: [rand() < 0.15 ? ri(1, 3) : 0, sched[1] - ri(1, 9e9), 0], susp: [0, 0, 0] };
}

const WORDS = ['arter', 'ven', 'sinir', 'kas', 'enzim', 'reseptör', 'inhibitör', '<b>', '</b>', '<br>', '{{c1::', '}}', 'hipofiz', 'tiroid', 'böbrek', 'karaciğer', 'ilaç', 'doz', 'yan', 'etki'];
const field = (n) => { const out = []; while (out.join(' ').length < n) out.push(WORDS[ri(0, WORDS.length - 1)]); return out.join(' '); };

function build(path, p) {
    const db = new DatabaseSync(path);
    db.exec(USER_SCHEMA);
    const ins = db.prepare('INSERT INTO objects (kind, id, ident, usn, fields) VALUES (?, ?, ?, 1, ?)');
    const insRev = db.prepare('INSERT INTO revlog (id, cid, ckind, usn, del, flags, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)');
    const wire = { objs: [], revs: [] };
    const add = (kind, id, ident, fields) => { const f = JSON.stringify(fields); ins.run(kind, id, ident, f); wire.objs.push([kind, id, ident, fields]); };
    db.exec('BEGIN');
    const cardRefs = [];
    for (let i = 0; i < p.catalogCards; i++) { const cid = 1_600_000_000_000 + i * 7; add(KIND.catalogCard, cid, null, cardFields(cid, 8_000_000_000_001 + (i % 12), true)); cardRefs.push([cid, 1]); }
    for (let i = 0; i < p.ownNotes; i++) {
        const nid = T0 + i * 60_000;
        const front = field(Math.floor(p.noteChars * 0.35)); const back = field(Math.floor(p.noteChars * 0.65));
        const h = hlc(nid);
        add(KIND.note, nid, randomBytes(8).toString('base64url').slice(0, 10), { fields: [[front, back], h, 0], tags: [['anatomi', 'zor'], h, 0], notetype: [1, h, 0] });
        for (let o = 0; o < (rand() < 0.8 ? 1 : 2); o++) { const cid = nid + o + 1; add(KIND.card, cid, `${nid}:${o}`, cardFields(cid, 1_790_000_000_000 + (i % p.decks), rand() < 0.7)); cardRefs.push([cid, 0]); }
    }
    for (let i = 0; i < p.decks; i++) { const h = hlc(T0); add(KIND.deck, 1_790_000_000_000 + i, null, { name: [`TUS::Ders ${i}::Konu ${i}`, h, 0], preset: [1, h, 0], desc: ['', h, 0], collapsed: [false, h, 0] }); }
    for (let i = 0; i < 3; i++) add(KIND.preset, i + 1, null, { config: [{ name: `Ayar ${i}`, pad: 'x'.repeat(560) }, hlc(T0), 0] });
    const settings = {}; for (let i = 0; i < 40; i++) settings[`pref${i}`] = [i % 3 ? true : 'x'.repeat(30), hlc(T0), 0];
    add(KIND.settings, 'app', null, settings);
    add(KIND.plan, 'p1', null, { plan: ['s'.repeat(3_000), hlc(T0), 0] });
    const subjects = ['Anatomi', 'Fizyoloji', 'Biyokimya', 'Mikrobiyoloji', 'Patoloji', 'Farmakoloji', 'Dahiliye', 'Pediatri', 'Genel Cerrahi', 'Kadın Doğum'];
    for (let i = 0; i < p.sessions; i++) {
        const start = T0 + i * 28_800_000;
        add(KIND.session, start, null, { session: [{ subject: subjects[ri(0, 9)], pass: ri(1, 3), startMs: start, endMs: start + 5_400_000, studyMs: 4_800_000, breakMs: 600_000, source: 'timer', kind: 'pass', breakCount: ri(0, 3), note: rand() < 0.8 ? '' : 'Kitap 3. bölüm tekrar' }, hlc(start), 0] });
    }
    let rid = T0;
    for (let i = 0; i < p.reviews; i++) {
        rid += rand() < 0.97 ? [4_000, 7_000, 9_000, 12_000, 20_000][ri(0, 4)] : ri(3_600_000, 50_000_000);
        const [cid, ckind] = cardRefs.length ? cardRefs[ri(0, cardRefs.length - 1)] : [1_600_000_000_000 + ri(0, 9_575) * 7, 1];
        const typ = [0, 1, 1, 1, 1, 1, 1, 2][ri(0, 7)]; const ivl = typ === 0 ? -[60, 600][ri(0, 1)] : ri(1, 400);
        const row = [rid, cid, ckind, rand() < 0.03 ? 1 : 0, [1, 2, 3, 3, 3, 3, 4][ri(0, 6)], ivl, Math.max(0, ivl - ri(0, 30)), ri(100, 1000), Math.min(60_000, Math.floor(-Math.log(rand() + 1e-9) * 9_000) + 1_500), typ];
        insRev.run(...row); wire.revs.push(row);
    }
    db.prepare("UPDATE meta SET v = 1 WHERE k = 'usn'").run();
    db.exec('COMMIT');
    db.exec('VACUUM');
    db.close();
    const gz = gzipSync(JSON.stringify(wire), { level: 6 }).length;
    return { sqlite: statSync(path).size, gzip: gz, objects: wire.objs.length, reviews: wire.revs.length };
}

const PROFILES = {
    light: { catalogCards: 1_500, ownNotes: 20, noteChars: 500, reviews: 3_000, sessions: 60, decks: 15 },
    typical: { catalogCards: 6_000, ownNotes: 300, noteChars: 700, reviews: 37_500, sessions: 500, decks: 40 },
    heavy: { catalogCards: 9_575, ownNotes: 2_000, noteChars: 900, reviews: 120_000, sessions: 900, decks: 120 },
};
const sizes = {};
for (const [name, p] of Object.entries(PROFILES)) {
    const r = build(join(DIR, `${name}.sqlite`), p);
    sizes[name] = r;
    console.log(`${name.padEnd(8)} sqlite ${(r.sqlite / 1e6).toFixed(2)} MB  first upload gzip ${(r.gzip / 1e6).toFixed(2)} MB  objects ${r.objects}  reviews ${r.reviews}`);
}
const mix = 0.4 * sizes.light.sqlite + 0.45 * sizes.typical.sqlite + 0.15 * sizes.heavy.sqlite;
console.log(`1,000 users (40/45/15 mix): ${(mix * 1000 / 1e9).toFixed(2)} GB structured`);

// Load-test fleet: accounts.sqlite with hashed tokens, and one typical collection per user.
const accounts = new DatabaseSync(join(DIR, 'accounts.sqlite'));
accounts.exec('PRAGMA journal_mode = WAL; CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL);');
const addSession = accounts.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)');
const tokens = [];
for (let u = 0; u < LOAD_USERS; u++) {
    const userId = `u${String(u).padStart(4, '0')}`;
    copyFileSync(join(DIR, 'typical.sqlite'), join(DIR, 'collections', `${userId}.sqlite`));
    const devices = [];
    for (const device of ['ios', 'web']) {
        const token = randomBytes(32).toString('base64url');
        addSession.run(createHash('sha256').update(token).digest('hex'), userId, `${userId}-${device}`, Date.now() + 86_400_000);
        devices.push({ device: `${userId}-${device}`, token });
    }
    tokens.push({ userId, devices });
}
accounts.close();
writeFileSync(join(DIR, 'tokens.json'), JSON.stringify(tokens));
console.log(`load fleet: ${LOAD_USERS} users x 2 devices`);
