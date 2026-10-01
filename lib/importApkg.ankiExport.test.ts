// Imports real packages exported by Anki 26.05. test/fixtures/anki-26.05-modern.apkg is Anki's
// default export (a zstd-compressed schema-18 collection.anki21b, media and manifest zstd-compressed
// too); anki-26.05-legacy.apkg is the same collection exported with "Support older Anki versions".
// anki-26.05-apkg.json is Anki's own record of that collection. All three are written by
// scripts/anki-oracle/gen_apkg.py; its docstring has the command that re-records them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { decompress } from 'fzstd';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    dbDeleteFtsCard: () => {},
}));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
}));

import type { Database } from 'sql.js';
import { extractCollectionBytes, hardenAndValidateAnkiReader, importApkg } from './importApkg';
import { ankiDueDayToLocal } from './importApkgProgress';
import { openSqlJsReader } from './webDb';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { getAllDeckConfigs, getAllDecks, saveDeck, saveDeckConfig } from './deckManager';
import { DEFAULT_DECK_CONFIG, DEFAULT_DECKS } from './models';

const FIXTURES = path.resolve(__dirname, '../test/fixtures');
const MODERN = 'anki-26.05-modern.apkg';
const LEGACY = 'anki-26.05-legacy.apkg';
const anki = JSON.parse(readFileSync(path.join(FIXTURES, 'anki-26.05-apkg.json'), 'utf8'));
const NOW_MS = anki.meta.exportedAtMs;
const ROLLOVER_HOUR = 4;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

function resetCollection() {
    holder.db = createAppDb(SQL);
    holder.media.clear();
}

beforeEach(resetCollection);

function fixture(name: string): Uint8Array {
    return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

/** Imports package bytes through the web build's own reader, the path the bug report came from. */
function importPackage(bytes: Uint8Array, fileName: string, withScheduling = true) {
    return importApkg(bytes, {
        subject: 'tus', topic: 'Anki', nowMs: NOW_MS, rolloverHour: ROLLOVER_HOUR, fileName, withScheduling,
        openReader: openSqlJsReader,
    });
}

function importFixture(name: string) {
    return importPackage(fixture(name), name);
}

/** The legacy export with its collection edited, as the scripts/anki-oracle probes edited it. */
async function editedLegacyFixture(edit: (collection: Database) => void): Promise<Uint8Array> {
    const zip = await JSZip.loadAsync(fixture(LEGACY));
    const collection = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    edit(collection);
    zip.file('collection.anki21', collection.export());
    collection.close();
    return zip.generateAsync({ type: 'uint8array' });
}

/** What a fresh install starts with, including the default deck an Anki Default deck must not duplicate. */
function seedFreshInstall() {
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
    for (const deck of DEFAULT_DECKS) saveDeck(deck);
}

function cardsPerDeck(): Record<string, number> {
    const cards = getAllAnkiCards();
    return Object.fromEntries(getAllDecks().map((deck) => [deck.name, cards.filter((card) => card.deckId === deck.id).length]));
}

/** Where Anki's due number lands: a day for reviews, a timestamp for learning, a position for new cards. */
function expectedDue(card: any): number {
    if (card.queue === 1) return card.due * 1000;
    if (card.type === 2 || card.queue === 3) return ankiDueDayToLocal(card.due, anki.meta.crt, NOW_MS, ROLLOVER_HOUR);
    return card.due;
}

/** Everything an import wrote, minus the copy of the source record and the package it came from. */
function importedCollection() {
    const own = <T extends object>(records: T[]) => records.map((record) => {
        const { ankiRaw: _raw, sourcePackageId: _package, ...rest } = record as any;
        return rest;
    });
    return {
        noteTypes: own(getAllNoteTypes()),
        notes: own(getAllNotes()),
        decks: own(getAllDecks()),
        deckConfigs: own(getAllDeckConfigs()),
        cards: own(getAllAnkiCards()),
        revlog: holder.db.getAllSync('SELECT * FROM revlog ORDER BY id'),
        media: [...holder.media.keys()].filter((name) => name in anki.media).sort(),
    };
}

describe('a package exported by Anki 26.05', () => {
    it('reaches the readers as a rollback-journal database, which SQLite can open from memory', async () => {
        // sql.js copes with Anki's WAL-mode header; an expo-sqlite database deserialized on iOS
        // fails every query on it with "unable to open database file".
        const zip = await JSZip.loadAsync(fixture(MODERN));
        const written = decompress(await zip.file('collection.anki21b')!.async('uint8array'));
        expect([written[18], written[19]]).toEqual([2, 2]);
        const expected = Buffer.from(written);
        expected[18] = 1;
        expected[19] = 1;

        expect(Buffer.from(await extractCollectionBytes(fixture(MODERN))).equals(expected)).toBe(true);
    });

    it('passes validation although its schema orders names with a collation only Anki has', async () => {
        const reader = await openSqlJsReader(await extractCollectionBytes(fixture(MODERN)));
        expect(() => reader.getAllSync('PRAGMA quick_check(1)')).toThrow(/no such collation sequence: unicase/);
        const imported = ['col', 'notes', 'cards', 'revlog', 'notetypes', 'fields', 'templates', 'decks', 'deck_config'];
        // NOT INDEXED: left to itself, SQLite counts the rows of `decks` through its unicase name index.
        const rowCounts = () => imported.map((table) => reader.getFirstSync(`SELECT COUNT(*) AS count FROM ${table} NOT INDEXED`).count);
        const before = rowCounts();

        hardenAndValidateAnkiReader(reader);

        expect(reader.getAllSync('PRAGMA quick_check')).toEqual([{ quick_check: 'ok' }]);
        expect(rowCounts()).toEqual(before);
        reader.close();
    });

    it('imports the default (modern) export with its structure, scheduling, history and media', async () => {
        const result = await importFixture(MODERN);

        expect(result).toMatchObject({
            totalNotes: anki.notes.length, added: anki.notes.length, cardsImported: anki.cards.length,
            structurePreserved: true, progressReviews: anki.revlog.length,
            mediaImported: Object.keys(anki.media).length, mediaSkipped: 0,
        });

        // Reached through the notes, because the app's built-in Basic type shares a name with Anki's.
        const notes = getAllNotes();
        const noteTypes = getAllNoteTypes();
        const typeOfNote = (guid: string) => noteTypes.find((type) => type.id === notes.find((note) => note.guid === guid)?.noteTypeId);
        for (const expected of anki.notetypes) {
            const { guid } = anki.notes.find((note: any) => note.notetype === expected.name);
            expect(typeOfNote(guid)).toMatchObject({
                name: expected.name,
                kind: expected.type === 1 ? 'cloze' : 'standard',
                css: expected.css,
                sortFieldIdx: expected.sortf,
                fields: expected.fields,
                templates: expected.templates,
            });
        }

        expect(notes.map((note) => ({ guid: note.guid, notetype: typeOfNote(note.guid)?.name, fields: note.fields, tags: note.tags })))
            .toEqual(expect.arrayContaining(anki.notes.map(({ guid, notetype, fields, tags }: any) => ({ guid, notetype, fields, tags }))));
        expect(notes).toHaveLength(anki.notes.length);

        const decks = getAllDecks();
        const configs = getAllDeckConfigs();
        for (const expected of anki.decks) {
            const deck = decks.find((candidate) => candidate.name === expected.name);
            expect(deck).toMatchObject({ description: expected.desc, collapsed: expected.collapsed, isFiltered: false });
            expect(configs.find((config) => config.id === deck?.configId)?.name).toBe(expected.config);
        }
        for (const expected of anki.configs) {
            expect(configs.find((config) => config.name === expected.name)).toMatchObject({
                newPerDay: expected.new.perDay,
                learningSteps: expected.new.delays,
                graduatingIvl: expected.new.ints[0],
                easyIvl: expected.new.ints[1],
                startingEase: expected.new.initialFactor,
                insertionOrder: expected.new.order === 0 ? 'random' : 'sequential',
                buryNewSiblings: expected.new.bury,
                maxReviewsPerDay: expected.rev.perDay,
                easyBonus: expected.rev.ease4,
                hardIvl: expected.rev.hardFactor,
                ivlModifier: expected.rev.ivlFct,
                maxIvl: expected.rev.maxIvl,
                buryReviewSiblings: expected.rev.bury,
                relearningSteps: expected.lapse.delays,
                newIvlPercent: expected.lapse.mult,
                minIvl: expected.lapse.minInt,
                leechThreshold: expected.lapse.leechFails,
                leechAction: expected.lapse.leechAction === 0 ? 'suspend' : 'tag',
                buryInterdayLearningSiblings: expected.buryInterdayLearning,
                maxAnswerSecs: expected.maxTaken,
                showTimer: expected.timer === 1,
                stopTimerOnAnswer: expected.stopTimerOnAnswer,
                autoPlayAudio: expected.autoplay,
                skipQuestionWhenReplayingAnswer: !expected.replayq,
                waitForAudio: expected.waitForAudio,
                secondsToShowQuestion: expected.secondsToShowQuestion,
                secondsToShowAnswer: expected.secondsToShowAnswer,
                easyDays: expected.easyDaysPercentages,
                desiredRetention: expected.desiredRetention,
                historicalRetention: expected.sm2Retention,
            });
        }
        // The enum-valued options, under the names proto/anki/deck_config.proto gives these numbers.
        expect(configs.find((config) => config.name === 'Kardiyoloji ayarları')).toMatchObject({
            newReviewOrder: 'after',
            interdayLearningMix: 'before',
            newCardSortOrder: 'randomNoteThenTemplate',
            reviewSortOrder: 'intervalsDesc',
            newCardGatherOrder: 'deckThenRandomNotes',
            questionAction: 'showReminder',
            answerAction: 'good',
            fsrsParams: anki.configs.find((config: any) => config.name === 'Kardiyoloji ayarları').fsrsParams6,
        });

        const cards = getAllAnkiCards();
        const deckName = new Map(decks.map((deck) => [deck.id, deck.name]));
        for (const expected of anki.cards) {
            const note = notes.find((candidate) => candidate.guid === expected.guid);
            const card = cards.find((candidate) => candidate.noteId === note?.id && candidate.ord === expected.ord);
            expect(card).toMatchObject({
                type: expected.type, queue: expected.queue, due: expectedDue(expected), ivl: expected.ivl,
                factor: expected.factor, reps: expected.reps, lapses: expected.lapses, left: expected.left,
                flags: expected.flags, ankiData: expected.data,
            });
            expect(deckName.get(card!.deckId)).toBe(expected.deck);
        }

        const cardByAnkiId = new Map(anki.cards.map((expected: any) => {
            const note = notes.find((candidate) => candidate.guid === expected.guid);
            return [expected.id, cards.find((candidate) => candidate.noteId === note?.id && candidate.ord === expected.ord)?.id];
        }));
        expect(holder.db.getAllSync('SELECT id, cardId, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id'))
            .toEqual(anki.revlog.map(({ cid, ...entry }: any) => ({ ...entry, cardId: cardByAnkiId.get(cid) })));

        for (const [name, base64] of Object.entries<string>(anki.media)) {
            expect(Buffer.from(holder.media.get(name) ?? []).toString('base64')).toBe(base64);
        }
    });

    it('imports the same collection from the modern and the legacy export', async () => {
        await importFixture(LEGACY);
        const legacy = importedCollection();
        resetCollection();
        await importFixture(MODERN);

        expect(importedCollection()).toEqual(legacy);
        expect(legacy.notes).toHaveLength(anki.notes.length);
    });
});

// Every expectation here is the deck list Anki 26.05 produced from the same package, imported
// through scripts/anki-oracle into a collection whose Default deck was renamed to this app's name.
describe('the decks an Anki package brings into a collection', () => {
    beforeEach(seedFreshInstall);

    it.each([MODERN, LEGACY])('leaves out the empty Default deck every package carries (%s)', async (name) => {
        await importFixture(name);
        const recorded: Record<string, number> = {};
        for (const card of anki.cards) recorded[card.deck] = (recorded[card.deck] ?? 0) + 1;
        expect(cardsPerDeck()).toEqual({ ...recorded, Varsayılan: 0 });
    });

    it('leaves out any other deck that holds no card', async () => {
        const bytes = await editedLegacyFixture((collection) => {
            const decks = JSON.parse(String(collection.exec('SELECT decks FROM col')[0].values[0][0]));
            const child = Object.values<any>(decks).find((deck) => deck.name.includes('::'));
            decks[1700000000001] = { ...child, id: 1700000000001, name: 'TUS Örnek::Boş alt' };
            decks[1700000000002] = { ...child, id: 1700000000002, name: 'Boş kök' };
            collection.run('UPDATE col SET decks = ?', [JSON.stringify(decks)]);
        });
        await importPackage(bytes, 'empty-decks.apkg');
        expect(getAllDecks().map((deck) => deck.name).sort()).toEqual(['TUS Örnek', 'TUS Örnek::Kardiyoloji', 'Varsayılan']);
    });

    it('brings a Default deck that holds a card along with its progress, and files the card here without it', async () => {
        const bytes = await editedLegacyFixture((collection) => {
            collection.run('UPDATE cards SET did = 1 WHERE id = (SELECT MIN(id) FROM cards)');
        });
        await importPackage(bytes, 'default-card.apkg', true);
        expect(cardsPerDeck()).toEqual({ Default: 1, 'TUS Örnek': 1, 'TUS Örnek::Kardiyoloji': 5, Varsayılan: 0 });

        resetCollection();
        seedFreshInstall();
        await importPackage(bytes, 'default-card.apkg', false);
        expect(cardsPerDeck()).toEqual({ 'TUS Örnek': 1, 'TUS Örnek::Kardiyoloji': 5, Varsayılan: 1 });
    });
});
