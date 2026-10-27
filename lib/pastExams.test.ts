/**
 * Installing the past TUS exams must only ever add: the learner's own rows stay as they were, an
 * interrupted install leaves nothing behind, and a second run brings back only what is missing.
 * These run the real installer on a small pack in the real format and the app's SQLite schema. The
 * full pack is not in git (the questions are ÖSYM's); when a local build has it, it is checked too.
 */

import { existsSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({
    db: null as any,
    media: new Map<string, Uint8Array>(),
    failFtsAfter: Number.POSITIVE_INFINITY,
    ftsWrites: 0,
    packBytes: new Uint8Array() as Uint8Array<ArrayBufferLike>,
    manifest: null as any,
}));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {
        holder.ftsWrites += 1;
        if (holder.ftsWrites > holder.failFtsAfter) throw new Error('disk full');
    },
}));
vi.mock('expo-asset', () => ({
    Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: 'file://cikmis-tus.zip', uri: 'file://cikmis-tus.zip' }) },
}));
vi.mock('./pastExamAsset', () => ({ loadBundledPastExamPack: () => ({ manifest: holder.manifest, assetModule: 0 }) }));
vi.mock('./files', () => ({
    readUriBytes: async () => holder.packBytes,
    getLegacyFileSystem: () => ({ cacheDirectory: null }),
}));
vi.mock('./mediaStore', () => ({
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, bytes); },
}));

import {
    PAST_EXAM_DECK_CONFIG_ID,
    countInstalledPastExamQuestions,
    getPastExamProgress,
    installPastExams,
} from './pastExams';
import {
    PAST_EXAM_PACK_FORMAT,
    PAST_EXAM_ROOT_DECK,
    buildPastExamManifest,
    parsePastExamPack,
    pastExamDeckName,
    type PastExamManifest,
    type PastExamQuestion,
} from './pastExamPack';
import { TUS_QUESTION_NOTE_TYPE_ID } from './tusQuestionCard';

const NOW = Date.UTC(2026, 9, 26, 9, 0, 0);
const LEARNER = { deckId: 42, noteId: 4242, cardId: 424242 };

function seedLearner(db: SyncDb): void {
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        LEARNER.deckId, 'Kendi Destem',
        JSON.stringify({ id: LEARNER.deckId, name: 'Kendi Destem', sortOrder: 0, configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false }),
    );
    db.runSync(
        'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        LEARNER.noteId, 'Kendi sorum', '', JSON.stringify({ id: LEARNER.noteId, guid: 'learner', noteTypeId: 1, fields: ['Kendi sorum', 'Kendi cevabım'], tags: [] }),
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, ?, 0, -1, 0)`,
        LEARNER.cardId, LEARNER.noteId, LEARNER.deckId,
        JSON.stringify({ id: LEARNER.cardId, noteId: LEARNER.noteId, deckId: LEARNER.deckId, type: 0, queue: 0, due: 7 }),
    );
}

const count = (db: SyncDb, sql: string, ...params: unknown[]) => Number(db.getFirstSync<{ n: number }>(sql, ...params)!.n);

function deckByName(db: SyncDb, name: string): { id: number; sortOrder: number; configId: number; collapsed: boolean } {
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', name);
    if (!row) throw new Error(`no deck ${name}`);
    return JSON.parse(row.data);
}

/** Exams of the test pack, newest first, with how many questions each has. */
const FIXTURE_EXAMS = [[2026, 2, 4], [2026, 1, 5], [2025, 1, 3], [2010, 2, 2], [2000, 1, 2]] as const;
const FIXTURE_IMAGES = ['tus-cikmis-0a1b2c3d4e5f6071.png', 'tus-cikmis-8192a3b4c5d6e7f8.png'];

function fixtureQuestions(): PastExamQuestion[] {
    const questions: PastExamQuestion[] = [];
    for (const [year, exam, total] of FIXTURE_EXAMS) {
        for (let number = 1; number <= total; number += 1) {
            const id = questions.length + 1;
            const image = year === 2026 && exam === 1 && number <= 2 ? `<br><img src="${FIXTURE_IMAGES[number - 1]}">` : '';
            questions.push({
                id, year, exam, number,
                course: number % 2 === 1 ? 'Anatomi' : 'Dahiliye',
                unit: number % 2 === 1 ? 'Eklemler' : 'Kardiyoloji',
                stem: `Soru ${id} metni${image}`,
                options: ['A', 'B', 'C', 'D', 'E'].map((letter) => `Seçenek ${letter}`),
                answer: 'C',
            });
        }
    }
    return questions;
}

async function buildFixturePack(): Promise<{ bytes: Uint8Array; manifest: PastExamManifest }> {
    const pack = parsePastExamPack({ format: PAST_EXAM_PACK_FORMAT, questions: fixtureQuestions() });
    const zip = new JSZip();
    zip.file('questions.json', JSON.stringify(pack));
    FIXTURE_IMAGES.forEach((name, index) => zip.file(String(index), new Uint8Array([0x89, 0x50, 0x4e, 0x47, index])));
    zip.file('media', JSON.stringify(Object.fromEntries(FIXTURE_IMAGES.map((name, index) => [String(index), name]))));
    return {
        bytes: await zip.generateAsync({ type: 'uint8array' }),
        manifest: buildPastExamManifest(pack, FIXTURE_IMAGES.length, 'fixture'),
    };
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    const fixture = await buildFixturePack();
    holder.packBytes = fixture.bytes;
    holder.manifest = fixture.manifest;
});

beforeEach(() => {
    holder.db = createAppDb(SQL);
    holder.media.clear();
    holder.failFtsAfter = Number.POSITIVE_INFINITY;
    holder.ftsWrites = 0;
    seedLearner(holder.db);
});

const LOCAL_PACK = 'assets/catalog/cikmis-tus.zip';
const LOCAL_MANIFEST = 'assets/catalog/cikmis-tus-manifest.json';

describe.skipIf(!existsSync(LOCAL_PACK) || !existsSync(LOCAL_MANIFEST))('locally built Çıkmış TUS Denemeleri pack', () => {
    it('matches the manifest the deck list shows before it is installed', async () => {
        const manifest = JSON.parse(readFileSync(LOCAL_MANIFEST, 'utf8')) as PastExamManifest;
        const zip = await JSZip.loadAsync(readFileSync(LOCAL_PACK));
        const pack = parsePastExamPack(JSON.parse(await zip.file('questions.json')!.async('string')));
        expect(pack.questions).toHaveLength(manifest.questions);
        expect(manifest.exams.reduce((sum, exam) => sum + exam.questions, 0)).toBe(manifest.questions);
        expect(buildPastExamManifest(pack, manifest.media, manifest.version)).toEqual(manifest);
        const mediaNames = new Set(Object.values(JSON.parse(await zip.file('media')!.async('string')) as Record<string, string>));
        expect(mediaNames.size).toBe(manifest.media);
        // Every figure a question shows travels with the pack; none is fetched from the network.
        for (const question of pack.questions) {
            for (const html of [question.stem, ...question.options]) {
                for (const [, src] of html.matchAll(/<img[^>]*src="([^"]+)"/g)) expect(mediaNames.has(src)).toBe(true);
                expect(html).not.toMatch(/https?:\/\//);
            }
        }
    });
});

describe('installPastExams', () => {
    it('adds one deck per exam and every question, leaving the learner’s rows alone', async () => {
        const result = await installPastExams(NOW);
        const db = holder.db as SyncDb;

        expect(result).toMatchObject({ added: holder.manifest.questions, kept: 0, decks: FIXTURE_EXAMS.length + 1, media: FIXTURE_IMAGES.length });
        expect(countInstalledPastExamQuestions()).toBe(holder.manifest.questions);
        expect(count(db, 'SELECT COUNT(*) AS n FROM anki_cards WHERE noteId <> ?', LEARNER.noteId)).toBe(holder.manifest.questions);
        expect(count(db, 'SELECT COUNT(*) AS n FROM note_types WHERE id = ?', TUS_QUESTION_NOTE_TYPE_ID)).toBe(1);
        expect(count(db, 'SELECT COUNT(*) AS n FROM deck_configs WHERE id = ?', PAST_EXAM_DECK_CONFIG_ID)).toBe(1);
        expect(holder.media.size).toBe(holder.manifest.media);

        const learnerCard = JSON.parse(db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', LEARNER.cardId)!.data);
        expect(learnerCard).toMatchObject({ deckId: LEARNER.deckId, due: 7 });
        expect(db.getFirstSync('SELECT id FROM notes WHERE id = ?', LEARNER.noteId)).not.toBeNull();

        // The newest exam is listed first, and every exam deck uses the unlimited preset.
        const root = deckByName(db, PAST_EXAM_ROOT_DECK);
        expect(root.collapsed).toBe(true);
        const newest = deckByName(db, pastExamDeckName(2026, 2));
        const oldest = deckByName(db, pastExamDeckName(2000, 1));
        expect(newest.sortOrder).toBe(0);
        expect(oldest.sortOrder).toBe(FIXTURE_EXAMS.length - 1);
        expect(newest.configId).toBe(PAST_EXAM_DECK_CONFIG_ID);
        const config = JSON.parse(db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', PAST_EXAM_DECK_CONFIG_ID)!.data);
        expect(config).toMatchObject({ newPerDay: 9999, maxReviewsPerDay: 9999, insertionOrder: 'sequential' });

        // Within an exam the questions come in booklet order, after the learner's own new card.
        const examCards = db.getAllSync<{ due: number; data: string }>(
            `SELECT c.due AS due, n.data AS data FROM anki_cards c JOIN notes n ON n.id = c.noteId
             WHERE c.deckId = ? ORDER BY c.due`,
            newest.id,
        );
        expect(examCards).toHaveLength(4);
        expect(examCards[0].due).toBeGreaterThan(7);
        const numbers = examCards.map((row) => JSON.parse(row.data).fields[10] as string);
        expect(numbers[0]).toBe('2026-2 TUS · Soru 1');
        expect(numbers[3]).toBe('2026-2 TUS · Soru 4');
        const first = JSON.parse(examCards[0].data);
        expect(first.tags).toEqual(['Çıkmış_TUS::2026_2', 'Temel_Bilimler', 'Ders::Anatomi', 'Konu::Anatomi::Eklemler']);
        expect(first.fields[6]).toBe('C');
        expect(first.guid).toMatch(/^tus-cikmis-\d+$/);
    });

    it('is repeatable: a second run adds nothing, and keeps a studied card as it is', async () => {
        await installPastExams(NOW);
        const db = holder.db as SyncDb;
        const studied = db.getFirstSync<{ id: number; data: string }>(
            'SELECT id, data FROM anki_cards WHERE deckId = ? ORDER BY due LIMIT 1',
            deckByName(db, pastExamDeckName(2025, 1)).id,
        )!;
        const card = { ...JSON.parse(studied.data), type: 2, queue: 2, ivl: 12, reps: 4 };
        db.runSync('UPDATE anki_cards SET type = 2, queue = 2, ivl = 12, reps = 4, data = ? WHERE id = ?', JSON.stringify(card), studied.id);

        const again = await installPastExams(NOW + 60_000);
        expect(again).toMatchObject({ added: 0, kept: holder.manifest.questions, decks: 0 });
        expect(count(db, 'SELECT COUNT(*) AS n FROM decks')).toBe(FIXTURE_EXAMS.length + 2);
        expect(JSON.parse(db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', studied.id)!.data))
            .toMatchObject({ type: 2, ivl: 12, reps: 4 });
    });

    it('brings back only a deleted exam', async () => {
        await installPastExams(NOW);
        const db = holder.db as SyncDb;
        const deck = deckByName(db, pastExamDeckName(2010, 2));
        db.runSync('DELETE FROM notes WHERE id IN (SELECT noteId FROM anki_cards WHERE deckId = ?)', deck.id);
        db.runSync('DELETE FROM anki_cards WHERE deckId = ?', deck.id);
        db.runSync('DELETE FROM decks WHERE id = ?', deck.id);

        const result = await installPastExams(NOW + 60_000);
        const removed = (holder.manifest as PastExamManifest).exams.find((exam) => exam.year === 2010 && exam.exam === 2)!.questions;
        expect(result).toMatchObject({ added: removed, kept: holder.manifest.questions - removed, decks: 1 });
        expect(count(db, 'SELECT COUNT(*) AS n FROM anki_cards WHERE deckId = ?', deckByName(db, pastExamDeckName(2010, 2)).id)).toBe(removed);
    });

    it('leaves the collection unchanged when writing fails part-way', async () => {
        holder.failFtsAfter = 10;
        await expect(installPastExams(NOW)).rejects.toThrow('disk full');
        const db = holder.db as SyncDb;
        expect(countInstalledPastExamQuestions()).toBe(0);
        expect(count(db, 'SELECT COUNT(*) AS n FROM decks')).toBe(1);
        expect(count(db, 'SELECT COUNT(*) AS n FROM anki_cards')).toBe(1);
        expect(count(db, 'SELECT COUNT(*) AS n FROM note_types')).toBe(0);
    });

    it('points questions at a renamed image when the learner already has a different file of that name', async () => {
        const zip = await JSZip.loadAsync(holder.packBytes);
        const taken = (JSON.parse(await zip.file('media')!.async('string')) as Record<string, string>)['0'];
        holder.media.set(taken, new Uint8Array([1, 2, 3]));

        await installPastExams(NOW);
        const db = holder.db as SyncDb;
        const notes = db.getAllSync<{ data: string }>('SELECT data FROM notes WHERE noteTypeId = ?', TUS_QUESTION_NOTE_TYPE_ID)
            .map((row) => JSON.parse(row.data).fields.join(''));
        expect(notes.some((html) => html.includes(`src="${taken}"`))).toBe(false);
        const renamed = [...holder.media.keys()].find((name) => name !== taken && name.startsWith(taken.replace(/\.[^.]+$/, '')));
        expect(renamed).toBeDefined();
        expect(notes.some((html) => html.includes(`src="${renamed}"`))).toBe(true);
        expect([...holder.media.get(taken)!]).toEqual([1, 2, 3]);
    });
});

describe('getPastExamProgress', () => {
    it('counts the latest answer of each question: Tekrar is wrong, other grades right, new is blank', async () => {
        await installPastExams(NOW);
        const db = holder.db as SyncDb;
        const deck = deckByName(db, pastExamDeckName(2026, 1));
        const cards = db.getAllSync<{ id: number }>('SELECT id FROM anki_cards WHERE deckId = ? ORDER BY due LIMIT 4', deck.id);
        const review = (cardId: number, id: number, ease: number, type = 0) => db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 1, 0, 2500, 5000, ?)',
            id, cardId, ease, type,
        );
        const answered = (cardId: number) => db.runSync('UPDATE anki_cards SET type = 1 WHERE id = ?', cardId);
        // Right first, then wrong on a later pass: the later answer counts.
        review(cards[0].id, 1, 3); review(cards[0].id, 2, 1); answered(cards[0].id);
        review(cards[1].id, 3, 1); review(cards[1].id, 4, 4); answered(cards[1].id);
        review(cards[2].id, 5, 2); answered(cards[2].id);
        // Reset to new after an answer: blank again.
        review(cards[3].id, 6, 3); review(cards[3].id, 7, 0, 4);

        expect(getPastExamProgress([deck.id])).toEqual({ correct: 2, wrong: 1, blank: 2, total: 5 });
        expect(getPastExamProgress([])).toEqual({ correct: 0, wrong: 0, blank: 0, total: 0 });
    });
});
