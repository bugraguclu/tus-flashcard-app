// Two-way sync between an iPhone and a browser, each with its own SQLite collection, driven by the
// app's real lib/ code against the real sync service (docs/HESAP_SENKRON.md §6, §9.1).
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../db', () => ({
    getDB: () => holder.db,
    flushDatabaseWrites: async () => {},
    readOnlyTabMessage: () => null,
    dbIndexAllCards() {},
    dbUpsertFtsCard() {},
    isPrimaryTab: () => true,
}));

import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, DEFAULT_DECKS, checksumField, type AnkiCard } from '../models';
import { sortFieldText } from '../noteChecksum';
import { createNote, getAnkiCard, getNote, saveNote, setCardFlag, suspendCard, buryCard, deleteNotes } from '../noteStore';
import { createDeck, getAllDecks, renameDeck, saveDeck } from '../deckStore';
import { saveDeckConfig, getDeckConfig } from '../deckPresets';
import { saveNoteType } from '../noteTypeStore';
import { answerStudyCard, undoAnswer } from '../studyAnswer';
import { setNoteTags } from '../noteTagStore';
import { insertStudySession, deleteStudySession } from '../stopwatchStore';
import { settings as studySettings } from '../../test/studyQueueFixtures';
import { SyncWorld, TestClient, syncUntilQuiet } from '../../test/syncHarness';
import { collectionSnapshot } from '../../test/syncSnapshot';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let world: SyncWorld;
let phone: TestClient;
let web: TestClient;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });

/** What a fresh install writes before the learner does anything. */
function freshInstall(client: TestClient): void {
    client.run(() => {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
        for (const deck of DEFAULT_DECKS) saveDeck({ ...deck });
        for (const noteType of BUILTIN_NOTE_TYPES) saveNoteType(noteType);
    });
}

beforeEach(async () => {
    world = new SyncWorld();
    phone = new TestClient(SQL, world, holder, 'phone');
    web = new TestClient(SQL, world, holder, 'web');
    freshInstall(phone);
    freshInstall(web);
});
afterEach(() => {
    phone.close();
    web.close();
});

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;

async function linkBoth(): Promise<void> {
    await phone.link();
    await web.link();
    await syncUntilQuiet([phone, web]);
}

function expectConverged(): void {
    expect(web.run(() => collectionSnapshot(web.db))).toEqual(phone.run(() => collectionSnapshot(phone.db)));
}

describe('content created on one device', () => {
    it('reaches the other device with the same ids, fields, tags and deck', async () => {
        const created = phone.run(() => {
            const deck = createDeck('Anatomi::Kemikler');
            return createNote(BASIC, ['Femur', 'Uyluk kemiği'], deck.id, ['ortopedi']);
        });
        await linkBoth();
        web.run(() => {
            expect(getNote(created.note.id)).toMatchObject({ guid: created.note.guid, fields: ['Femur', 'Uyluk kemiği'], tags: ['ortopedi'] });
            expect(getAnkiCard(created.cards[0].id)).toMatchObject({ noteId: created.note.id, type: 0, queue: 0 });
            expect(getAllDecks().map((deck) => deck.name).sort()).toEqual(['Anatomi', 'Anatomi::Kemikler', 'Varsayılan']);
        });
        expectConverged();
    });

    it('sends nothing for the defaults every fresh install has', async () => {
        await linkBoth();
        expect(world.serverObjects()).toEqual([]);
    });
});

describe('concurrent changes to one card', () => {
    it('keeps an answer from the phone and a flag from the browser', async () => {
        const { cards } = phone.run(() => createNote(BASIC, ['Soru', 'Cevap'], 1));
        const cardId = cards[0].id;
        await linkBoth();
        phone.online = false;
        phone.run(() => answerStudyCard(cardId, 3, studySettings, 4_000));
        web.run(() => setCardFlag(cardId, 4));
        await web.sync();
        phone.online = true;
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            client.run(() => {
                const card = getAnkiCard(cardId)!;
                expect(card.flags).toBe(4);
                expect(card.type).not.toBe(0);
                expect(client.db.getAllSync('SELECT id FROM revlog')).toHaveLength(1);
            });
        }
        expectConverged();
    });

    it('keeps a suspension made on one device when the other buries the card', async () => {
        const { cards } = phone.run(() => createNote(BASIC, ['Soru', 'Cevap'], 1));
        const cardId = cards[0].id;
        await linkBoth();
        web.run(() => suspendCard(cardId));
        await web.sync();
        phone.run(() => buryCard(cardId));
        await syncUntilQuiet([phone, web]);
        // Suspension wins on the queue; the bury does not lift it.
        for (const client of [phone, web]) expect(client.run(() => getAnkiCard(cardId)!.queue)).toBe(-1);
        expectConverged();
    });

    it('keeps a bury to the day it was made on, each device going by its own day', async () => {
        const { cards } = phone.run(() => createNote(BASIC, ['Soru', 'Cevap'], 1));
        const cardId = cards[0].id;
        // The browser's clock is a day ahead: for it, the phone's bury day is already over.
        web.skewMs = 24 * 3_600_000;
        await linkBoth();
        expect(web.env.ctx.today()).toBe(phone.env.ctx.today() + 1);
        phone.run(() => buryCard(cardId));
        await syncUntilQuiet([phone, web]);
        expect(phone.run(() => getAnkiCard(cardId)!.queue)).toBe(-3);
        expect(web.run(() => getAnkiCard(cardId)!.queue)).toBe(0);
        // The browser shows the card again without sending that back: the phone keeps its bury.
        const pushed = await web.sync();
        expect(pushed?.pushed).toBe(0);
        await phone.sync();
        expect(phone.run(() => getAnkiCard(cardId)!.queue)).toBe(-3);
    });

    it('takes back an answer undone on the phone everywhere, keeping no stray review', async () => {
        const { cards } = phone.run(() => createNote(BASIC, ['Soru', 'Cevap'], 1));
        const cardId = cards[0].id;
        await linkBoth();
        const result = phone.run(() => answerStudyCard(cardId, 3, studySettings, 2_000));
        await phone.sync();
        await web.sync();
        expect(web.db.getAllSync('SELECT id FROM revlog')).toHaveLength(1);
        phone.run(() => undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects));
        await syncUntilQuiet([phone, web]);
        expect(web.db.getAllSync('SELECT id FROM revlog')).toHaveLength(0);
        expect(web.run(() => getAnkiCard(cardId))).toMatchObject({ type: 0, queue: 0, reps: 0 });
        expectConverged();
    });
});

describe('notes', () => {
    it('merges edits to different fields and tags made on both devices', async () => {
        const { note } = phone.run(() => createNote(BASIC, ['Ön', 'Arka'], 1, ['a']));
        await linkBoth();
        phone.run(() => {
            const current = getNote(note.id)!;
            const fields = ['Ön (telefon)', current.fields[1]];
            saveNote({ ...current, fields, sfld: sortFieldText(fields, 0), csum: checksumField(fields[0]), mod: Math.floor(Date.now() / 1000), usn: -1 });
            setNoteTags(note.id, ['a', 'leech']);
        });
        web.run(() => {
            const current = getNote(note.id)!;
            const fields = [current.fields[0], 'Arka (web)'];
            saveNote({ ...current, fields, sfld: sortFieldText(fields, 0), csum: checksumField(fields[0]), mod: Math.floor(Date.now() / 1000), usn: -1 });
            setNoteTags(note.id, ['a', 'kardiyo']);
        });
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            const merged = client.run(() => getNote(note.id)!);
            expect(merged.fields).toEqual(['Ön (telefon)', 'Arka (web)']);
            expect([...merged.tags].sort()).toEqual(['a', 'kardiyo', 'leech']);
        }
        expectConverged();
    });

    it('deletes a note on both devices even when the other edited it meanwhile', async () => {
        const { note, cards } = phone.run(() => createNote(BASIC, ['Ön', 'Arka'], 1));
        await linkBoth();
        phone.run(() => deleteNotes([note.id]));
        web.run(() => setCardFlag(cards[0].id, 2));
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            expect(client.run(() => getNote(note.id))).toBeNull();
            expect(client.run(() => getAnkiCard(cards[0].id))).toBeNull();
        }
        expectConverged();
    });
});

describe('decks', () => {
    it('puts a subdeck made on the browser under a parent renamed on the phone', async () => {
        const parent = phone.run(() => createDeck('Fizyoloji'));
        await linkBoth();
        phone.run(() => renameDeck(parent.id, 'Fizyoloji (TUS)'));
        web.run(() => createDeck('Fizyoloji::Kalp'));
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            expect(client.run(() => getAllDecks().map((deck) => deck.name).sort())).toEqual(['Fizyoloji (TUS)', 'Fizyoloji (TUS)::Kalp', 'Varsayılan']);
        }
        expectConverged();
    });

    it('merges two decks made with the same name offline into the older one, cards and all', async () => {
        await linkBoth();
        phone.online = false;
        const phoneCard = phone.run(() => {
            const deck = createDeck('Patoloji');
            return createNote(BASIC, ['telefon', ''], deck.id).cards[0].id;
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const webCard = web.run(() => {
            const deck = createDeck('Patoloji');
            return createNote(BASIC, ['web', ''], deck.id).cards[0].id;
        });
        await web.sync();
        phone.online = true;
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            const decks = client.run(() => getAllDecks().filter((deck) => deck.name === 'Patoloji'));
            expect(decks).toHaveLength(1);
            const kept = decks[0].id;
            expect(client.run(() => getAnkiCard(phoneCard)!.deckId)).toBe(kept);
            expect(client.run(() => getAnkiCard(webCard)!.deckId)).toBe(kept);
        }
        expectConverged();
    });
});

describe('settings and presets', () => {
    it('merges different learning settings, keeps screen settings on each device', async () => {
        const meta = (client: TestClient) => JSON.parse(client.db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'tus_app_settings_meta_v1'")?.value ?? '{}');
        const write = (client: TestClient, patch: Record<string, unknown>) => client.db.runSync(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('tus_app_settings_meta_v1', ?)",
            JSON.stringify({ ...meta(client), ...patch }),
        );
        await linkBoth();
        write(phone, { dayRolloverHour: 6, themeMode: 'dark' });
        write(web, { learnAheadMinutes: 5, themeMode: 'light' });
        await syncUntilQuiet([phone, web]);
        expect(meta(phone)).toMatchObject({ dayRolloverHour: 6, learnAheadMinutes: 5, themeMode: 'dark' });
        expect(meta(web)).toMatchObject({ dayRolloverHour: 6, learnAheadMinutes: 5, themeMode: 'light' });
    });

    it('does not let a newly linked browser overwrite the phone’s preset with its defaults', async () => {
        phone.run(() => saveDeckConfig({ ...getDeckConfig(1), newPerDay: 55, mod: Math.floor(Date.now() / 1000) }));
        await phone.link();
        await phone.sync();
        await web.link();
        await syncUntilQuiet([phone, web]);
        expect(web.run(() => getDeckConfig(1).newPerDay)).toBe(55);
        expect(phone.run(() => getDeckConfig(1).newPerDay)).toBe(55);
    });
});

describe('Kronometre', () => {
    it('carries sessions and their deletion', async () => {
        await linkBoth();
        const start = Date.now() - 3_600_000;
        const session = phone.run(() => insertStudySession({ subject: 'Anatomi', kind: 'pass', pass: 1, startMs: start, endMs: start + 1_800_000, studyMs: 1_800_000, breakMs: 0, breakCount: 0, note: '' }, 'timer'));
        await syncUntilQuiet([phone, web]);
        expect(web.db.getAllSync('SELECT subject FROM study_sessions')).toEqual([{ subject: 'Anatomi' }]);
        web.run(() => deleteStudySession(session.id));
        await syncUntilQuiet([phone, web]);
        expect(phone.db.getAllSync('SELECT id FROM study_sessions')).toEqual([]);
    });
});

describe('clocks', () => {
    it('lets a later edit win even when that device’s clock is two hours behind', async () => {
        const { cards } = phone.run(() => createNote(BASIC, ['Soru', 'Cevap'], 1));
        const cardId = cards[0].id;
        web.skewMs = -2 * 3_600_000;
        await linkBoth();
        phone.run(() => setCardFlag(cardId, 1));
        await phone.sync();
        await web.sync();
        // The browser saw the phone's flag, then changed it: its change must win.
        web.run(() => setCardFlag(cardId, 5));
        await syncUntilQuiet([phone, web]);
        expect(phone.run(() => getAnkiCard(cardId)!.flags)).toBe(5);
    });
});

describe('identity', () => {
    it('keeps both notes when two devices gave different notes the same id', async () => {
        await linkBoth();
        const id = Date.now() + 10_000_000;
        const make = (client: TestClient, text: string) => client.run(() => {
            const { note, cards } = createNote(BASIC, [text, ''], 1);
            client.db.runSync("UPDATE notes SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", id, id, note.id);
            client.db.runSync("UPDATE anki_cards SET noteId = ?, data = json_set(data, '$.noteId', ?) WHERE noteId = ?", id, id, note.id);
            return cards[0].id;
        });
        make(phone, 'telefonun notu');
        make(web, 'webin notu');
        await syncUntilQuiet([phone, web]);
        for (const client of [phone, web]) {
            const texts = client.db.getAllSync<{ data: string }>('SELECT data FROM notes').map((row) => JSON.parse(row.data).fields[0]).sort();
            expect(texts).toEqual(['telefonun notu', 'webin notu']);
        }
        expectConverged();
    });
});

export type { AnkiCard };
