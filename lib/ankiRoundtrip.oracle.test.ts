// Repeated package round trips through Anki itself: Anki builds a learner's collection, then the app
// imports and exports it, Anki imports that export and exports it again, and so on. After every
// pass Anki's own view of the package (scripts/anki-oracle/roundtrip.py) must equal its view of the
// first one: nothing lost, changed or added on the way through the app.
//
// It needs Anki.app and the oracle host, so it runs only on request:
//   (cd scripts/anki-oracle && ./build-host.sh)
//   ANKI_ORACLE_CYCLES=100 npx vitest run lib/ankiRoundtrip.oracle.test.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbGetSchemaVersion: () => 10,
    initDB: () => {},
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    isPrimaryTab: () => true,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} } }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
    listStoredMediaFilenames: async () => [...holder.media.keys()],
}));

import { openSqlJsReader } from './webDb';
import { buildAnkiExport } from './exportAnkiPackage';
import { importPackageWithBackup } from './packageImportWorkflow';
import { exportAllData } from './backupData';
import type { BackupDeps } from './backup';
import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG } from './models';
import { createDeck, saveDeckConfig } from './deckManager';
import { createNote, saveNoteType } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';

const CYCLES = Number(process.env.ANKI_ORACLE_CYCLES ?? 0);
const ORACLE = path.resolve(__dirname, '../scripts/anki-oracle');
const ROLLOVER_HOUR = 4;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let work: string;

function oracle(...args: string[]): void {
    execFileSync(path.join(ORACLE, 'run.sh'), ['roundtrip.py', ...args], { cwd: ORACLE, stdio: 'inherit' });
}

const backupDeps: BackupDeps = {
    store: { list: async () => [], read: async () => '', write: async () => {}, remove: async () => {} },
    exportData: exportAllData, setLastBackupAt: () => {}, isWriter: () => true, maxCopies: () => 1,
};

/**
 * Imports a package into an empty app collection, the way the import screen does, and exports the
 * whole collection again.
 */
async function throughApp(bytes: Uint8Array, kind: 'apkg' | 'colpkg', legacySupport: boolean): Promise<Uint8Array> {
    holder.db = createAppDb(SQL);
    holder.media.clear();
    await importPackageWithBackup(bytes, {
        subject: 'tus', topic: 'Anki', rolloverHour: ROLLOVER_HOUR,
        withScheduling: true, withDeckConfigs: true, replaceCollection: kind === 'colpkg',
        openReader: openSqlJsReader,
    }, { backupDeps });
    const artifact = await buildAnkiExport(kind, undefined, true, undefined, {
        includeScheduling: true, includeDeckConfigs: true, legacySupport,
    });
    return artifact.bytes!;
}

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    Platform.OS = 'web';
    work = mkdtempSync(path.join(tmpdir(), 'anki-roundtrip-'));
    if (CYCLES) oracle('source', path.join(work, 'source.apkg'), path.join(work, 'source.colpkg'));
});

/** A collection made in this app: its own note types, decks, preset, notes, media and reviews. */
async function appMadePackage(): Promise<Uint8Array> {
    holder.db = createAppDb(SQL);
    holder.media.clear();
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, name: 'Yoğun', newPerDay: 40, learningSteps: [1, 5, 30], easyDays: [1, 1, 1, 1, 1, 0.5, 0] });
    const [basic, reversed, cloze] = [1, 2, 3].map((id) => BUILTIN_NOTE_TYPES.find((type) => type.id === id)!);
    for (const type of [basic, reversed, cloze]) saveNoteType(type);
    const parent = createDeck('Uygulama');
    const child = createDeck('Uygulama::Alt deste', 2);
    holder.media.set('resim 1.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
    createNote(basic, ['Ön <b>yüz</b> &amp; 🫀', '<img src="resim 1.png">'], parent.id, ['etiket', 'Üst::Alt']);
    createNote(reversed, ['İki yön', 'Cevap'], child.id);
    const { cards } = createNote(cloze, ['{{c1::Bir}} ve {{c2::iki}}', 'Ek'], child.id, ['cloze']);
    const settings = { ...DEFAULT_SETTINGS };
    answerStudyCard(cards[0].id, 3, settings, 4000);
    answerStudyCard(cards[1].id, 1, settings, 9000);
    const artifact = await buildAnkiExport('apkg', undefined, true, undefined, { includeScheduling: true, includeDeckConfigs: true });
    return artifact.bytes!;
}

describe.skipIf(!CYCLES)('package round trips through Anki', () => {
    for (const kind of ['apkg', 'colpkg'] as const) {
        it(`keeps a .${kind} unchanged over ${CYCLES} app → Anki passes`, async () => {
            const command = kind === 'apkg' ? 'cycle' : 'colpkg';
            const file = (name: string) => path.join(work, `${kind}-${name}`);
            oracle(command, path.join(work, `source.${kind}`), file('0.anki'), file('base.json'), 'latest');
            const expected = JSON.parse(readFileSync(file('base.json'), 'utf8'));
            expect(expected.wrongChecksums).toEqual([]);
            let current = new Uint8Array(readFileSync(file('0.anki')));
            for (let pass = 1; pass <= CYCLES; pass++) {
                const legacy = pass % 2 === 0;
                writeFileSync(file(`${pass}.app`), await throughApp(current, kind, legacy));
                oracle(command, file(`${pass}.app`), file(`${pass}.anki`), file(`${pass}.json`), legacy ? 'legacy' : 'latest');
                const actual = JSON.parse(readFileSync(file(`${pass}.json`), 'utf8'));
                expect(actual, `pass ${pass} (${work})`).toEqual(expected);
                current = new Uint8Array(readFileSync(file(`${pass}.anki`)));
            }
        }, 600_000 + CYCLES * 20_000);
    }

    it(`keeps a collection made here unchanged over ${CYCLES} passes`, async () => {
        const file = (name: string) => path.join(work, `made-${name}`);
        writeFileSync(file('0.app'), await appMadePackage());
        oracle('cycle', file('0.app'), file('0.anki'), file('base.json'), 'latest');
        const expected = JSON.parse(readFileSync(file('base.json'), 'utf8'));
        // What the app made arrives in Anki as it was made.
        expect(expected.notes.map((note: unknown[]) => [note[4], note[5]])).toEqual([
            [' etiket Üst::Alt ', 'Ön <b>yüz</b> &amp; 🫀\x1f<img src="resim 1.png">'],
            ['', 'İki yön\x1fCevap'],
            [' cloze ', '{{c1::Bir}} ve {{c2::iki}}\x1fEk'],
        ]);
        expect(expected.decks.map((deck: any) => [deck.name, deck.conf])).toEqual([['Uygulama', 'Default'], ['Uygulama::Alt deste', 'Yoğun']]);
        expect(expected.presets.find((preset: any) => preset.name === 'Yoğun')).toMatchObject({
            new: { perDay: 40, delays: [1, 5, 30] }, easyDaysPercentages: [1, 1, 1, 1, 1, 0.5, 0],
        });
        expect(expected.revlog).toHaveLength(2);
        expect(expected.wrongChecksums).toEqual([]);
        expect(Object.keys(expected.media)).toEqual(['resim 1.png']);
        let current = new Uint8Array(readFileSync(file('0.anki')));
        for (let pass = 1; pass <= CYCLES; pass++) {
            writeFileSync(file(`${pass}.app`), await throughApp(current, 'apkg', pass % 2 === 0));
            oracle('cycle', file(`${pass}.app`), file(`${pass}.anki`), file(`${pass}.json`), 'latest');
            expect(JSON.parse(readFileSync(file(`${pass}.json`), 'utf8')), `pass ${pass} (${work})`).toEqual(expected);
            current = new Uint8Array(readFileSync(file(`${pass}.anki`)));
        }
    }, 600_000 + CYCLES * 20_000);
});
