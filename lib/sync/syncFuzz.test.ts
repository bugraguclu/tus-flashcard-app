// Randomized sync (docs/HESAP_SENKRON.md §9.1), on the app's real code: an iPhone and two
// browsers make random changes, lose requests and replies, go offline, and one browser loses its
// whole local copy. After everyone syncs until quiet, the five invariants of the design must hold.
// SYNC_FUZZ_RUNS=500 runs more; a failing seed is printed so it can be replayed with SYNC_FUZZ_SEED.
import initSqlJs from 'sql.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../db', () => ({
    getDB: () => holder.db,
    flushDatabaseWrites: async () => {},
    readOnlyTabMessage: () => null,
    dbIndexAllCards() {},
    dbUpsertFtsCard() {},
    isPrimaryTab: () => true,
}));

import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, DEFAULT_DECKS, checksumField, type CardFlag } from '../models';
import { sortFieldText } from '../noteChecksum';
import { buryCard, createNote, getAnkiCard, getNote, saveNote, setCardFlag, suspendCard, deleteNotes, saveAnkiCard } from '../noteStore';
import { createDeck, getAllDecks, renameDeck, saveDeck } from '../deckStore';
import { getDeckConfig, saveDeckConfig } from '../deckPresets';
import { saveNoteType } from '../noteTypeStore';
import { answerStudyCard, undoAnswer } from '../studyAnswer';
import { setNoteTags } from '../noteTagStore';
import { deleteStudySession, insertStudySession } from '../stopwatchStore';
import { restoreQueueFromType } from '../ankiState';
import { settings as studySettings } from '../../test/studyQueueFixtures';
import { SyncWorld, TestClient, syncUntilQuiet } from '../../test/syncHarness';
import { collectionSnapshot } from '../../test/syncSnapshot';

const RUNS = Number(process.env.SYNC_FUZZ_RUNS ?? 25);
const STEPS = Number(process.env.SYNC_FUZZ_STEPS ?? 70);
const FIXED_SEED = process.env.SYNC_FUZZ_SEED ? Number(process.env.SYNC_FUZZ_SEED) : null;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
// A bury lasts until the day ends on each device's own clock (§6.2), and the browsers' clocks
// drift up to 90 minutes, so near a day rollover (any hour from 00:00 to 11:00 here) two devices
// rightly disagree on a buried card's queue for that long. The wall clock is moved to 18:00 today,
// far from every rollover, so the run checks convergence and not the time it happens to run at.
// It keeps running: a frozen clock would pile every stamp onto one millisecond.
beforeAll(() => {
    const realNow = Date.now.bind(Date);
    const evening = new Date(realNow());
    evening.setHours(18, 0, 0, 0);
    const shift = evening.getTime() - realNow();
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + shift);
});
afterAll(() => { vi.restoreAllMocks(); });

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
const DECK_NAMES = ['Anatomi', 'Fizyoloji', 'Anatomi::Kemik', 'Patoloji', 'Farmakoloji::Otonom'];
const TAGS = ['kardiyo', 'leech', 'acil', 'tekrar'];

function freshInstall(client: TestClient): void {
    client.run(() => {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
        for (const deck of DEFAULT_DECKS) saveDeck({ ...deck });
        for (const noteType of BUILTIN_NOTE_TYPES) saveNoteType(noteType);
    });
}

interface Ledger {
    /** Answers given and not undone: revlog id → card id. */
    answers: Map<number, number>;
    /** Sessions saved and not deleted. */
    sessions: Set<number>;
    /** Which device made each answer and session, for a device that loses its storage. */
    madeBy: Map<string, TestClient>;
}

const clients: TestClient[] = [];
afterEach(() => {
    for (const client of clients.splice(0)) client.close();
});

async function runOnce(seed: number): Promise<void> {
    const random = mulberry32(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    const world = new SyncWorld();
    const phone = new TestClient(SQL, world, holder, 'phone');
    const browser = new TestClient(SQL, world, holder, 'browser');
    const laptop = new TestClient(SQL, world, holder, 'laptop');
    const devices = [phone, browser, laptop];
    clients.push(...devices);
    // The browsers' clocks drift; the phone's is right.
    browser.skewMs = Math.round((random() - 0.5) * 2 * 90 * 60_000);
    laptop.skewMs = Math.round((random() - 0.5) * 2 * 90 * 60_000);
    const faults = { dropRequest: 0.08, dropReply: 0.1, random };
    for (const device of devices) freshInstall(device);
    const ledger: Ledger = { answers: new Map(), sessions: new Set(), madeBy: new Map() };
    const trace: string[] = [];
    const usnOf = () => world.collections.get(world.userId).usn();
    for (const device of devices) {
        await device.link();
        device.faults = faults;
    }

    const cardIds = (device: TestClient) => device.db.getAllSync<{ id: number }>('SELECT id FROM anki_cards').map((row) => Number(row.id));
    const noteIds = (device: TestClient) => device.db.getAllSync<{ id: number }>('SELECT id FROM notes').map((row) => Number(row.id));

    for (let step = 0; step < STEPS; step += 1) {
        const device = pick(devices);
        const roll = random();
        await device.run(async () => {
            const cards = cardIds(device);
            const notes = noteIds(device);
            if (roll < 0.14) {
                const deckName = pick([...DECK_NAMES, 'Varsayılan']);
                const deck = createDeck(deckName);
                createNote(BASIC, [`soru ${seed}-${step}`, `cevap ${step}`], deck.id, random() < 0.5 ? [pick(TAGS)] : []);
            } else if (roll < 0.3 && cards.length > 0) {
                const cardId = pick(cards);
                const before = getAnkiCard(cardId)!;
                if (before.queue < 0) return;
                const result = answerStudyCard(cardId, (1 + Math.floor(random() * 4)) as 1 | 2 | 3 | 4, studySettings, 3_000);
                if (random() < 0.15) {
                    undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
                } else {
                    ledger.answers.set(result.reviewLogId, cardId);
                    ledger.madeBy.set(`rev:${result.reviewLogId}`, device);
                }
            } else if (roll < 0.38 && cards.length > 0) {
                setCardFlag(pick(cards), Math.floor(random() * 8) as CardFlag);
            } else if (roll < 0.44 && cards.length > 0) {
                const cardId = pick(cards);
                const card = getAnkiCard(cardId)!;
                if (card.queue === -1 || card.queue === -2 || card.queue === -3) {
                    saveAnkiCard({ ...card, queue: restoreQueueFromType(card), mod: Math.floor(Date.now() / 1000) });
                } else if (random() < 0.5) suspendCard(cardId);
                else buryCard(cardId);
            } else if (roll < 0.52 && notes.length > 0) {
                const note = getNote(pick(notes))!;
                const tags = new Set(note.tags);
                const tag = pick(TAGS);
                if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
                setNoteTags(note.id, [...tags]);
            } else if (roll < 0.6 && notes.length > 0) {
                const note = getNote(pick(notes))!;
                const index = random() < 0.5 ? 0 : 1;
                const fields = [...note.fields];
                fields[index] = `${fields[index]}·${device.name}`;
                // As the editor saves it: the sort field and checksum follow the fields.
                saveNote({ ...note, fields, sfld: sortFieldText(fields, 0), csum: checksumField(fields[0]), mod: Math.floor(Date.now() / 1000), usn: -1 });
            } else if (roll < 0.63 && notes.length > 0) {
                deleteNotes([pick(notes)]);
            } else if (roll < 0.69) {
                const decks = getAllDecks().filter((deck) => deck.id !== 1);
                if (decks.length === 0) return;
                const deck = pick(decks);
                const target = `${pick(['Yeni', 'Eski', 'Ana'])} ${Math.floor(random() * 3)}`;
                if (getAllDecks().some((other) => other.name === target || other.name.startsWith(`${deck.name}::`))) return;
                try { renameDeck(deck.id, target); } catch { /* a name the app refuses */ }
            } else if (roll < 0.73) {
                const config = getDeckConfig(1);
                saveDeckConfig({ ...config, newPerDay: 10 + Math.floor(random() * 50), mod: Math.floor(Date.now() / 1000) });
            } else if (roll < 0.77) {
                const raw = device.db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'tus_app_settings_meta_v1'")?.value;
                const meta = raw ? JSON.parse(raw) : {};
                meta[pick(['dayRolloverHour', 'learnAheadMinutes', 'timeboxMinutes'])] = Math.floor(random() * 12);
                meta.themeMode = pick(['light', 'dark']);
                device.db.runSync("INSERT OR REPLACE INTO settings (key, value) VALUES ('tus_app_settings_meta_v1', ?)", JSON.stringify(meta));
            } else if (roll < 0.82) {
                const start = Date.now() - Math.floor(random() * 10) * 3_600_000 - step * 60_000;
                if (process.env.SYNC_FUZZ_DEBUG) console.log(step, device.name, 'insert session');
                const session = insertStudySession({
                    subject: pick(['Anatomi', 'Fizyoloji']), kind: 'pass', pass: 1, startMs: start, endMs: start + 600_000,
                    studyMs: 600_000, breakMs: 0, breakCount: 0, note: '',
                }, 'manual');
                // Sessions are tracked by their start (unique per step): ids may move after a collision.
                ledger.sessions.add(session.startMs);
                if (process.env.SYNC_FUZZ_DEBUG) console.log('   ->', session.id, session.startMs);
                ledger.madeBy.set(`sess:${session.id}:${session.startMs}`, device);
            } else if (roll < 0.84) {
                const sessions = device.db.getAllSync<{ id: number; startMs: number }>('SELECT id, startMs FROM study_sessions');
                if (sessions.length === 0) return;
                const session = pick(sessions);
                if (process.env.SYNC_FUZZ_DEBUG) console.log(step, device.name, 'delete session', session.id, session.startMs);
                deleteStudySession(Number(session.id));
                ledger.sessions.delete(Number(session.startMs));
                ledger.madeBy.set(`sessdel:${session.id}:${session.startMs}`, device);
            } else if (roll < 0.9) {
                device.online = !device.online;
            } else if (roll < 0.905 && device === browser) {
                // The browser's storage was cleared: it comes back empty and links again. What it
                // had not sent yet is gone, as it would be in a real browser.
                if (process.env.SYNC_FUZZ_DEBUG) console.log(step, 'browser cleared');
                // Matched by content: another device's session may have used the same id.
                const serverObjects = world.serverObjects();
                const answersOnServer = new Set(serverObjects.filter((object) => object.k === 'rev').map((object) => object.id));
                const startsOnServer = new Set(serverObjects
                    .filter((object) => object.k === 'sess' && object.f.r && object.f.del?.[0] !== true)
                    .map((object) => Number((object.f.r[0] as { startMs: number }).startMs)));
                for (const [key, maker] of ledger.madeBy) {
                    if (maker !== browser) continue;
                    const [kind, id, start] = key.split(':');
                    if (kind === 'rev' && !answersOnServer.has(id)) ledger.answers.delete(Number(id));
                    if (kind === 'sess' && !startsOnServer.has(Number(start))) ledger.sessions.delete(Number(start));
                    // A deletion it never sent is undone: the session is still on the server.
                    if (kind === 'sessdel' && startsOnServer.has(Number(start))) ledger.sessions.add(Number(start));
                }
                const replacement = new TestClient(SQL, world, holder, `browser${step}`);
                clients.push(replacement);
                freshInstall(replacement);
                replacement.skewMs = browser.skewMs;
                await replacement.link();
                replacement.faults = faults;
                devices[1] = replacement;
            } else {
                const sinceBefore = device.db.getFirstSync<{ v: string }>("SELECT v FROM sync_meta WHERE k = 'since'")?.v;
                const result = await device.sync();
                trace.push(`${step} ${device.name} sync ${result ? `ok pushed=${result.pushed} pulled=${result.pulled}` : 'failed'} since ${sinceBefore}->${device.db.getFirstSync<{ v: string }>("SELECT v FROM sync_meta WHERE k = 'since'")?.v} usn=${usnOf()}`);
                if (process.env.SYNC_FUZZ_DEBUG) console.log(step, device.name, 'sync', result ? `pushed ${result.pushed} reid ${result.summary.reIdentified}` : 'failed', JSON.stringify(device.db.getAllSync('SELECT id, startMs FROM study_sessions')));
            }
        });
    }

    for (const device of devices) {
        device.online = true;
        device.faults = null;
    }
    await syncUntilQuiet(devices, 12);
    if (process.env.SYNC_FUZZ_DEBUG) {
        console.log('server', JSON.stringify(world.serverObjects().filter((object) => object.k === 'sess')));
        for (const device of devices) console.log(device.name, JSON.stringify(device.db.getAllSync('SELECT id, startMs FROM study_sessions')), JSON.stringify(device.db.getAllSync("SELECT * FROM sync_shadow WHERE kind = 'sess'")));
    }

    // 1. Every device holds the same learning data.
    const reference = devices[0].run(() => collectionSnapshot(devices[0].db));
    for (const device of devices.slice(1)) {
        const snapshot = device.run(() => collectionSnapshot(device.db));
        if (JSON.stringify(snapshot) !== JSON.stringify(reference)) {
            let same = true;
            try { expect(snapshot).toEqual(reference); } catch { same = false; }
            if (same) continue;
            console.log('server usn', world.collections.get(world.userId).usn());
            const differing = snapshot.cards
                .filter((card: any) => JSON.stringify(card) !== JSON.stringify(reference.cards.find((other: any) => other.id === card.id)))
                .map((card: any) => String(card.id));
            const serverCards = world.serverObjects().filter((object) => differing.includes(object.id));
            console.log('cardsdiff server', JSON.stringify(serverCards));
            for (const each of devices) {
                for (const cardId of differing) {
                    console.log('cardsdiff', each.name, cardId, JSON.stringify(each.db.getFirstSync('SELECT queue, data FROM anki_cards WHERE id = ?', Number(cardId))),
                        JSON.stringify(each.db.getFirstSync("SELECT f FROM sync_shadow WHERE kind IN ('card','ccard') AND id = ?", cardId)),
                        'clock', each.env.ctx.today(), each.env.ctx.rolloverHour(), each.skewMs);
                }
            }
            console.log('trace', trace.join('\n'));
            for (const each of devices) {
                console.log(each.name, 'meta', JSON.stringify(each.db.getAllSync('SELECT * FROM sync_meta')));
                console.log(each.name, 'shadow-ids', JSON.stringify(each.db.getAllSync('SELECT kind, id, lid, ident FROM sync_shadow ORDER BY kind, id')));
            }
            for (const each of devices) {
                console.log(each.name, 'parked', JSON.stringify(each.db.getAllSync('SELECT * FROM sync_parked')));
                console.log(each.name, 'out', JSON.stringify(each.db.getAllSync('SELECT * FROM sync_out')));
                console.log(each.name, 'decks', JSON.stringify(each.db.getAllSync('SELECT id, name FROM decks')));
                console.log(each.name, 'deck shadow', JSON.stringify(each.db.getAllSync("SELECT id, lid, ident, f FROM sync_shadow WHERE kind = 'deck'")));
            }
            console.log('server decks', JSON.stringify(world.serverObjects().filter((object) => object.k === 'deck')));
        }
        expect(snapshot, `seed ${seed}: ${device.name} diverged`).toEqual(reference);
    }


    // 3. The review log is exactly the answers given minus those taken back.
    const revlog = devices[0].db.getAllSync<{ id: number; cardId: number }>('SELECT id, cardId FROM revlog');
    // Compared per card: an answer moved to a new id after an id collision is still the same answer.
    const perCard = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);
    expect(perCard(revlog.map((row) => Number(row.cardId))), `seed ${seed}: review log`).toEqual(perCard(ledger.answers.values()));

    // 4. Every Kronometre session exists exactly once.
    const sessions = devices[0].db.getAllSync<{ startMs: number }>('SELECT startMs FROM study_sessions').map((row) => Number(row.startMs));
    expect(new Set(sessions).size, `seed ${seed}: duplicate session`).toBe(sessions.length);
    expect(new Set(sessions), `seed ${seed}: sessions`).toEqual(ledger.sessions);

    // 5. Deck names are unique and no card is in a deck that does not exist.
    const deckRows = devices[0].db.getAllSync<{ id: number; name: string }>('SELECT id, name FROM decks');
    expect(new Set(deckRows.map((row) => row.name.toLowerCase())).size, `seed ${seed}: duplicate deck`).toBe(deckRows.length);
    expect(deckRows.some((row) => row.name.includes('⁣')), `seed ${seed}: duplicate mark left`).toBe(false);
    const orphans = devices[0].db.getAllSync('SELECT id FROM anki_cards WHERE deckId NOT IN (SELECT id FROM decks)');
    expect(orphans, `seed ${seed}: card in a missing deck`).toEqual([]);
    const strays = devices[0].db.getAllSync('SELECT id FROM anki_cards WHERE noteId NOT IN (SELECT id FROM notes)');
    expect(strays, `seed ${seed}: card without its note`).toEqual([]);
}

describe('randomized sync between three devices', () => {
    it(`converges and keeps every answer and session (${FIXED_SEED ?? RUNS} runs)`, async () => {
        const seeds = FIXED_SEED !== null ? [FIXED_SEED] : Array.from({ length: RUNS }, (_, index) => 1_000 + index * 7_919);
        for (const seed of seeds) {
            await runOnce(seed);
            for (const client of clients.splice(0)) client.close();
        }
    }, 600_000);
});
