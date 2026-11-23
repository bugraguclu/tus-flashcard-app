// The paid catalog under sync (docs/HESAP_SENKRON.md §4.1, §4.4, §6.4): only the learner's own
// state travels, keyed by the package's ids; the catalog's content never leaves the device; a
// device without the catalog keeps what it receives until the catalog is installed; uninstalling
// it is not a deletion.
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

import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, DEFAULT_DECKS } from '../models';
import { getAnkiCard, getNote, setCardFlag } from '../noteStore';
import { saveDeck } from '../deckStore';
import { saveDeckConfig } from '../deckPresets';
import { saveNoteType } from '../noteTypeStore';
import { answerStudyCard } from '../studyAnswer';
import { setNoteTags } from '../noteTagStore';
import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID } from '../catalogRows';
import { settings as studySettings } from '../../test/studyQueueFixtures';
import { SyncWorld, TestClient, syncUntilQuiet } from '../../test/syncHarness';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let world: SyncWorld;
let phone: TestClient;
let web: TestClient;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });

const PACKAGE = { preset: 900, deck: 901, noteType: 902, note: 903, card: 904 };
const SECRET_FIELD = 'Paket içeriği: femur boynu kırığı';

function freshInstall(client: TestClient): void {
    client.run(() => {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
        for (const deck of DEFAULT_DECKS) saveDeck({ ...deck });
        for (const noteType of BUILTIN_NOTE_TYPES) saveNoteType(noteType);
    });
}

/** Writes the catalog as its installer does; `deckId` may differ when a learner row took the id. */
function installCatalog(client: TestClient, deckId = PACKAGE.deck): void {
    const db = client.db;
    const pack = { catalogPack: CATALOG_PACK_ID };
    db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CATALOG_INSTALL_KEY, 'full');
    db.runSync('INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)', PACKAGE.preset, JSON.stringify({ ...DEFAULT_DECK_CONFIG, id: PACKAGE.preset, name: 'BKA', mod: 1_700_000_000, ...pack }));
    db.runSync('INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', deckId, 'BKA TUS', JSON.stringify({
        id: deckId, name: 'BKA TUS', configId: PACKAGE.preset, mod: 1_700_000_000, usn: -1, description: '', collapsed: false, isFiltered: false,
        ...pack, ...(deckId !== PACKAGE.deck ? { catalogSourceId: PACKAGE.deck } : {}),
    }));
    db.runSync('INSERT OR REPLACE INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', PACKAGE.noteType, 'BKA', JSON.stringify({
        ...BUILTIN_NOTE_TYPES[0], id: PACKAGE.noteType, name: 'BKA', mod: 1_700_000_000, ...pack,
    }));
    db.runSync('INSERT OR REPLACE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, ?, ?, 0, -1, 0)',
        PACKAGE.note, PACKAGE.noteType, SECRET_FIELD, ' anatomi ', JSON.stringify({
            id: PACKAGE.note, guid: 'catalog-guid-1', noteTypeId: PACKAGE.noteType, mod: 1_700_000_000, usn: -1, tags: ['anatomi'],
            fields: [SECRET_FIELD, 'Gizli cevap'], sfld: SECRET_FIELD, csum: 0, flags: 0, catalogPackageTags: ['anatomi'], ...pack,
        }));
    db.runSync(`INSERT OR REPLACE INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
        VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)`, PACKAGE.card, PACKAGE.note, deckId, JSON.stringify({
        id: PACKAGE.card, noteId: PACKAGE.note, deckId, ord: 0, mod: 1_700_000_000, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0,
        reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
    }));
}

function uninstallCatalog(client: TestClient): void {
    for (const table of ['anki_cards', 'notes', 'decks', 'deck_configs', 'note_types']) {
        client.db.runSync(`DELETE FROM ${table} WHERE instr(data, ?) > 0 OR id IN (?, ?, ?, ?, ?)`, CATALOG_PACK_ID, ...Object.values(PACKAGE));
    }
    client.db.runSync('DELETE FROM settings WHERE key = ?', CATALOG_INSTALL_KEY);
}

beforeEach(() => {
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

describe('catalog progress', () => {
    it('carries answers, flags and the learner’s tags, never the catalog’s content', async () => {
        installCatalog(phone);
        installCatalog(web, 77_777); // a learner deck held the package's id on this device
        await phone.link();
        await web.link();
        await syncUntilQuiet([phone, web]);
        // An untouched catalog sends no card or note; its deck and preset options go up with the
        // package's own time, so any choice the learner makes later wins over them.
        const untouched = world.serverObjects();
        expect(untouched.filter((object) => object.k !== 'cdeck' && object.k !== 'cpreset')).toEqual([]);
        for (const object of untouched) for (const group of Object.values(object.f)) expect(group[1]).toBeLessThanOrEqual(1_700_000_000 * 1_000_000);

        phone.run(() => {
            answerStudyCard(PACKAGE.card, 3, studySettings, 3_000);
            setCardFlag(PACKAGE.card, 2);
            setNoteTags(PACKAGE.note, ['anatomi', 'kendi-etiketim']);
        });
        await syncUntilQuiet([phone, web]);

        web.run(() => {
            const card = getAnkiCard(PACKAGE.card)!;
            expect(card).toMatchObject({ flags: 2, reps: 1, deckId: 77_777 });
            expect(card.type).not.toBe(0);
            expect(getNote(PACKAGE.note)!.tags.sort()).toEqual(['anatomi', 'kendi-etiketim']);
        });
        const serverText = JSON.stringify(world.serverObjects());
        expect(serverText).not.toContain(SECRET_FIELD);
        expect(serverText).not.toContain('Gizli cevap');
        expect(world.serverObjects().map((object) => object.k).sort()).toEqual(['ccard', 'cdeck', 'cnote', 'cpreset', 'rev']);
    });

    it('keeps progress for a device that installs the catalog later, and the install does not override it', async () => {
        installCatalog(phone);
        await phone.link();
        phone.run(() => answerStudyCard(PACKAGE.card, 4, studySettings, 2_000));
        await phone.sync();

        await web.link();
        await web.sync();
        expect(web.db.getAllSync('SELECT kind FROM sync_parked').map((row: any) => row.kind).sort()).toEqual(['ccard', 'cdeck', 'cpreset']);

        installCatalog(web);
        await syncUntilQuiet([phone, web]);
        expect(web.run(() => getAnkiCard(PACKAGE.card))).toMatchObject({ reps: 1 });
        expect(phone.run(() => getAnkiCard(PACKAGE.card))).toMatchObject({ reps: 1 });
        expect(web.db.getAllSync('SELECT kind FROM sync_parked')).toEqual([]);
    });

    it('does not delete anything elsewhere when a device uninstalls the catalog', async () => {
        installCatalog(phone);
        installCatalog(web);
        await phone.link();
        await web.link();
        phone.run(() => setCardFlag(PACKAGE.card, 5));
        await syncUntilQuiet([phone, web]);

        uninstallCatalog(phone);
        await syncUntilQuiet([phone, web]);
        expect(web.run(() => getAnkiCard(PACKAGE.card))).toMatchObject({ flags: 5 });
        expect(web.run(() => getNote(PACKAGE.note))).not.toBeNull();
        expect(JSON.stringify(world.serverObjects())).not.toContain('"del"');
    });
});
