import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-asset', () => ({ Asset: { fromModule: vi.fn() } }));

import {
    BKA_CATALOG_EXPECTED,
    BKA_TRIAL_CARDS_PER_SUBJECT,
    BKA_TRIAL_TOTAL_CARDS,
    buildBkaTrialCatalog,
    readBkaCatalog,
} from './bkaCatalog';
import { renderCardHtml } from './templates';

describe('bundled BKA catalog', () => {
    it('preserves the verified package structure and every source card', async () => {
        const bytes = readFileSync('assets/catalog/bka-tus-complete.apkg');
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
            'c262c9cc304abbfe716bb4d25c0d892101e35ca64d5dfee781b0f65e38d37d08',
        );
        const zip = await JSZip.loadAsync(bytes);
        const collection = await zip.file('collection.anki21')!.async('uint8array');
        const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
        const db = new SQL.Database(collection);

        const reader = {
            getAllSync<T = any>(sql: string, ...params: any[]): T[] {
                const result = db.exec(sql, params.length ? params : undefined);
                if (!result.length) return [];
                return result[0].values.map((values) => Object.fromEntries(
                    result[0].columns.map((column, index) => [column, values[index]]),
                ) as T);
            },
            getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
                return this.getAllSync<T>(sql, ...params)[0] ?? null;
            },
        };

        const snapshot = readBkaCatalog(reader);
        expect(snapshot.notes).toHaveLength(BKA_CATALOG_EXPECTED.notes);
        expect(snapshot.cards).toHaveLength(BKA_CATALOG_EXPECTED.cards);
        expect(snapshot.decks.filter((deck) => !deck.name.includes('::'))).toHaveLength(BKA_CATALOG_EXPECTED.rootDecks);
        expect(snapshot.decks.length - BKA_CATALOG_EXPECTED.rootDecks).toBeGreaterThan(100);
        expect(snapshot.noteTypes).toHaveLength(BKA_CATALOG_EXPECTED.noteTypes);
        expect(Object.keys(JSON.parse(await zip.file('media')!.async('text')))).toHaveLength(BKA_CATALOG_EXPECTED.media);
        expect(snapshot.cards.every((card) => card.type === 0 && card.queue === 0)).toBe(true);
        expect(snapshot.subjects.map((subject) => subject.name)).toEqual([
            'Deneme ve Soru',
            'Anatomi',
            'FHE',
            'Biyokimya',
            'Mikrobiyoloji',
            'Patoloji',
            'Farmakoloji',
            'Dahiliye',
            'Pediatri',
            'Genel Cerrahi',
            'Küçük Stajlar',
            'Kadın Doğum',
        ]);

        const sourceCardIds = new Set(
            reader.getAllSync<{ id: number }>('SELECT id FROM cards').map((row) => Number(row.id)),
        );
        expect(new Set(snapshot.cards.map((card) => card.id))).toEqual(sourceCardIds);

        // Compare every content/scheduling field carried by the app, not only totals. A digest
        // keeps failures readable even though the collection contains thousands of long notes.
        const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
        const sourceNotes = reader.getAllSync<any>(
            'SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags FROM notes ORDER BY id',
        ).map((row) => ({
            id: Number(row.id), guid: row.guid, noteTypeId: Number(row.mid), mod: Number(row.mod),
            usn: Number(row.usn), tags: String(row.tags ?? '').trim().split(/\s+/).filter(Boolean),
            fields: String(row.flds ?? '').split('\x1f'), sfld: String(row.sfld ?? ''),
            csum: Number(row.csum), flags: Number(row.flags ?? 0),
        }));
        const installedNotes = snapshot.notes.map(({ id, guid, noteTypeId, mod, usn, tags, fields, sfld, csum, flags }) => (
            { id, guid, noteTypeId, mod, usn, tags, fields, sfld, csum, flags }
        ));
        expect(digest(installedNotes)).toBe(digest(sourceNotes));

        const sourceCards = reader.getAllSync<any>(
            `SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps,
                    lapses, "left" AS "left", odue, odid, flags FROM cards ORDER BY id`,
        ).map((row) => ({
            id: Number(row.id), noteId: Number(row.nid), sourceDeckId: Number(row.did), ord: Number(row.ord),
            mod: Number(row.mod), usn: Number(row.usn), type: Number(row.type), queue: Number(row.queue),
            due: Number(row.due), ivl: Number(row.ivl), factor: Number(row.factor), reps: Number(row.reps),
            lapses: Number(row.lapses), left: Number(row.left), odue: Number(row.odue), odid: Number(row.odid),
            flags: Number(row.flags),
        }));
        const installedCards = snapshot.cards.map(({
            id, noteId, sourceDeckId, ord, mod, usn, type, queue, due, ivl, factor, reps,
            lapses, left, odue, odid, flags,
        }) => ({
            id, noteId, sourceDeckId, ord, mod, usn, type, queue, due, ivl, factor, reps,
            lapses, left, odue, odid, flags,
        }));
        expect(digest(installedCards)).toBe(digest(sourceCards));

        const manifest = JSON.parse(await zip.file('media')!.async('text')) as Record<string, string>;
        expect(new Set(Object.values(manifest)).size).toBe(BKA_CATALOG_EXPECTED.media);
        for (const entry of Object.keys(manifest)) {
            expect(zip.file(entry), `missing media entry ${entry}`).not.toBeNull();
        }

        const clozeType = snapshot.noteTypes.find((type) => type.kind === 'cloze')!;
        const clozeNote = snapshot.notes.find((note) => note.noteTypeId === clozeType.id)!;
        const clozeCard = snapshot.cards.find((card) => card.noteId === clozeNote.id)!;
        const questionHtml = renderCardHtml(clozeType, clozeNote, 0, 'question', { clozeOrd: clozeCard.ord + 1 });
        expect(questionHtml).toContain('class="cloze-blank"');
        expect(questionHtml.toLowerCase()).not.toContain('<script');
        expect(questionHtml).not.toContain('{{edit:cloze:');

        const noteWithExtra = snapshot.notes.find((note) => (
            note.noteTypeId === clozeType.id && note.fields[1]?.trim().length > 0
        ))!;
        const extraCard = snapshot.cards.find((card) => card.noteId === noteWithExtra.id)!;
        const answerHtml = renderCardHtml(clozeType, noteWithExtra, 0, 'answer', { clozeOrd: extraCard.ord + 1 });
        expect(answerHtml).toContain('id=extra');
        expect(answerHtml).not.toContain('{{hint:');
        expect(answerHtml.toLowerCase()).not.toContain('<script');

        const trial = buildBkaTrialCatalog(snapshot);
        expect(trial.cards).toHaveLength(BKA_TRIAL_TOTAL_CARDS);
        expect(trial.cards.every((card) => sourceCardIds.has(card.id))).toBe(true);
        for (const subject of snapshot.subjects) {
            expect(trial.cards.filter((card) => card.sourceDeckId === subject.deckId)).toHaveLength(BKA_TRIAL_CARDS_PER_SUBJECT);
            expect(subject.topics.length).toBeGreaterThan(0);
        }
        expect(trial.notes.every((note) => trial.cards.some((card) => card.noteId === note.id))).toBe(true);
        db.close();
    });
});
