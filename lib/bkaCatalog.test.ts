import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-asset', () => ({ Asset: { fromModule: vi.fn() } }));

import {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_EXPECTED,
    BKA_CATALOG_PACK,
    BKA_TRIAL_CARDS_PER_SUBDECK,
    BKA_TRIAL_DEFAULT_ROOT_DECK,
    buildBkaTrialCatalog,
    readBkaCatalog,
    scoreBkaTrialCard,
} from './bkaCatalog';
import { BKA_MANIFEST } from './bkaManifest';
import { classifyBkaTopicByContent, classifyBkaTopicByTag } from './bkaTaxonomy';
import { renderCardHtml } from './templates';

describe('bundled BKA catalog', () => {
    it('uses the product-facing root deck name', () => {
        expect(BKA_CATALOG_DEFAULT_ROOT_DECK).toBe('TUS Kartları');
    });

    it('ranks complete, readable trial questions above incomplete cards', () => {
        const card = { id: 1, noteId: 10, ord: 0 } as any;
        const noteType = { id: 1, kind: 'standard' } as any;
        const complete = {
            id: 10,
            noteTypeId: 1,
            fields: ['Erb-Duchenne paralizisinde en sık hangi sinir kökleri etkilenir?', 'C5 ve C6 sinir kökleri etkilenir.'],
            tags: ['Anatomi'],
        } as any;
        const incomplete = { ...complete, fields: ['Sinir?', ''] };
        expect(scoreBkaTrialCard(card, complete, noteType))
            .toBeGreaterThan(scoreBkaTrialCard(card, incomplete, noteType));
    });

    it('preserves the verified package structure and every source card', async () => {
        const bytes = readFileSync('assets/catalog/bka-tus-complete.apkg');
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(BKA_MANIFEST.sha256);
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
        expect(snapshot.noteTypes).toHaveLength(BKA_CATALOG_EXPECTED.noteTypes);
        expect(snapshot.deckConfigs[0]?.name).toBe(BKA_CATALOG_DEFAULT_ROOT_DECK);
        expect(snapshot.deckConfigs.every((config) => !/default|varsayılan/i.test(config.name))).toBe(true);
        expect(Object.keys(JSON.parse(await zip.file('media')!.async('text')))).toHaveLength(BKA_CATALOG_EXPECTED.media);
        expect(snapshot.cards.every((card) => card.type === 0 && card.queue === 0)).toBe(true);

        // The whole catalog hangs off one lockable root deck: root → 12 courses → author subdecks.
        const roots = snapshot.decks.filter((deck) => !deck.name.includes('::'));
        const courses = snapshot.decks.filter((deck) => deck.name.split('::').length === 2);
        const topics = snapshot.decks.filter((deck) => deck.name.split('::').length === 3);
        expect(roots.map((deck) => deck.name)).toEqual([BKA_CATALOG_DEFAULT_ROOT_DECK]);
        expect(courses).toHaveLength(BKA_CATALOG_EXPECTED.courseDecks);
        expect(topics).toHaveLength(BKA_CATALOG_EXPECTED.topicDecks);
        expect(snapshot.decks.every((deck) => deck.catalogPack === BKA_CATALOG_PACK)).toBe(true);
        expect(snapshot.notes.every((note) => note.catalogPack === BKA_CATALOG_PACK)).toBe(true);
        expect(snapshot.noteTypes.every((noteType) => noteType.catalogPack === BKA_CATALOG_PACK)).toBe(true);
        // A card sits in an author-labeled subdeck, or in the course deck the source gave it —
        // never anywhere else, and never in a topic belonging to another course.
        const topicById = new Map(topics.map((deck) => [deck.id, deck.name]));
        const courseById = new Map(courses.map((deck) => [deck.id, deck.name]));
        expect(snapshot.cards.every((card) => {
            const courseName = courseById.get(card.sourceDeckId!);
            if (!courseName) return false;
            if (card.deckId === card.sourceDeckId) return true;
            return topicById.get(card.deckId)?.startsWith(`${courseName}::`) ?? false;
        })).toBe(true);

        // A note sits in the subdeck its own placement chose, and that placement is reproducible:
        // the author's tag when they left one, otherwise the subject terms in the note's text.
        const noteById = new Map(snapshot.notes.map((note) => [note.id, note]));
        for (const card of snapshot.cards) {
            if (card.deckId === card.sourceDeckId) continue;
            const note = noteById.get(card.noteId)!;
            const [, courseName, topicName] = topicById.get(card.deckId)!.split('::');
            const sourceDeckName = `${courseName} BKA`;
            expect(note.catalogTopic).toBe(topicName);
            expect(
                classifyBkaTopicByTag(sourceDeckName, note.tags)
                ?? classifyBkaTopicByContent(sourceDeckName, note.fields.join(' ')),
            ).toBe(topicName);
        }
        // A note neither pass places keeps the course deck instead of borrowing a topic.
        const ungrouped = snapshot.cards.filter((card) => card.deckId === card.sourceDeckId);
        expect(ungrouped).toHaveLength(BKA_MANIFEST.totals.ungroupedCards);
        for (const card of ungrouped.slice(0, 200)) {
            const note = noteById.get(card.noteId)!;
            const sourceDeckName = `${courseById.get(card.sourceDeckId!)!.split('::')[1]} BKA`;
            expect(classifyBkaTopicByTag(sourceDeckName, note.tags)).toBeNull();
            expect(classifyBkaTopicByContent(sourceDeckName, note.fields.join(' '))).toBeNull();
        }

        // Catalog deck presets must never reuse the app's own preset ids (1 = the learner default).
        expect(snapshot.deckConfigs.every((config) => config.id > 1_000_000_000)).toBe(true);
        expect(snapshot.decks.every((deck) => snapshot.deckConfigs.some((config) => config.id === deck.configId))).toBe(true);

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

        const trial = buildBkaTrialCatalog(snapshot);
        expect(trial.rootDeckName).toBe(BKA_TRIAL_DEFAULT_ROOT_DECK);
        expect(trial.decks.find((deck) => deck.id === snapshot.decks[0].id)?.name).toBe(BKA_TRIAL_DEFAULT_ROOT_DECK);
        expect(trial.decks.every((deck) => (
            deck.name === BKA_TRIAL_DEFAULT_ROOT_DECK || deck.name.startsWith(`${BKA_TRIAL_DEFAULT_ROOT_DECK}::`)
        ))).toBe(true);
        expect(trial.decks.map((deck) => deck.name.replace(BKA_TRIAL_DEFAULT_ROOT_DECK, BKA_CATALOG_DEFAULT_ROOT_DECK)))
            .toEqual(snapshot.decks.map((deck) => deck.name));
        expect(trial.decks.some((deck) => deck.name === `${BKA_CATALOG_DEFAULT_ROOT_DECK}::Deneme`)).toBe(false);
        const fullCounts = new Map<number, number>();
        const trialCounts = new Map<number, number>();
        snapshot.cards.forEach((card) => fullCounts.set(card.deckId, (fullCounts.get(card.deckId) ?? 0) + 1));
        trial.cards.forEach((card) => trialCounts.set(card.deckId, (trialCounts.get(card.deckId) ?? 0) + 1));
        for (const [deckId, fullCount] of fullCounts) {
            expect(trialCounts.get(deckId)).toBe(Math.min(BKA_TRIAL_CARDS_PER_SUBDECK, fullCount));
        }
        const sourceCardIdsForTrial = new Set(snapshot.cards.map((card) => card.id));
        const trialNoteIds = new Set(trial.cards.map((card) => card.noteId));
        expect(trial.cards.every((card) => sourceCardIdsForTrial.has(card.id))).toBe(true);
        expect(trial.notes.every((note) => trialNoteIds.has(note.id))).toBe(true);

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

        const mediaManifest = JSON.parse(await zip.file('media')!.async('text')) as Record<string, string>;
        expect(new Set(Object.values(mediaManifest)).size).toBe(BKA_CATALOG_EXPECTED.media);
        for (const entry of Object.keys(mediaManifest)) {
            expect(zip.file(entry), `missing media entry ${entry}`).not.toBeNull();
        }

        const clozeType = snapshot.noteTypes.find((type) => type.kind === 'cloze')!;
        const clozeNote = snapshot.notes.find((note) => note.noteTypeId === clozeType.id)!;
        const clozeCard = snapshot.cards.find((card) => card.noteId === clozeNote.id)!;
        const questionHtml = renderCardHtml(clozeType, clozeNote, 0, 'question', { clozeOrd: clozeCard.ord + 1 });
        expect(questionHtml).toMatch(/<span class="cloze" data-cloze="[^"]*" data-ordinal="\d+(?:,\d+)*">\[[^\]]*\]<\/span>/);
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

        // The store screen prices a catalog it cannot read yet, so the build-time manifest has to
        // describe exactly what the installer would create — course by course, topic by topic.
        expect(BKA_MANIFEST.totals).toEqual({
            notes: snapshot.notes.length,
            cards: snapshot.cards.length,
            courses: courses.length,
            topics: topics.length,
            ungroupedCards: ungrouped.length,
            media: BKA_CATALOG_EXPECTED.media,
        });
        expect(BKA_MANIFEST.noteTypes.map((noteType) => noteType.id).sort()).toEqual(
            snapshot.noteTypes.map((noteType) => noteType.id).sort(),
        );
        for (const course of BKA_MANIFEST.courses) {
            const subject = snapshot.subjects.find((entry) => entry.id === course.id);
            expect(subject, `manifest course ${course.id} missing from catalog`).toBeDefined();
            expect(subject!.deckId).toBe(course.sourceDeckId);
            expect(subject!.name).toBe(course.name);
            expect(subject!.icon).toBe(course.icon);
            expect(subject!.topics).toEqual(course.topics.map((topic) => topic.name));
            expect(snapshot.cards.filter((card) => card.sourceDeckId === course.sourceDeckId)).toHaveLength(course.cards);
            for (const topic of course.topics) {
                if (!topic.deck) {
                    // The ungrouped remainder stays in the course deck itself.
                    expect(snapshot.cards.filter((card) => (
                        card.sourceDeckId === course.sourceDeckId && card.deckId === card.sourceDeckId
                    ))).toHaveLength(topic.cards);
                    continue;
                }
                const deck = snapshot.decks.find((entry) => entry.name === `${BKA_CATALOG_DEFAULT_ROOT_DECK}::${course.name}::${topic.name}`);
                expect(deck, `manifest topic ${course.name}::${topic.name} missing from catalog`).toBeDefined();
                expect(snapshot.cards.filter((card) => card.deckId === deck!.id)).toHaveLength(topic.cards);
            }
        }
        db.close();
        // Hashing, unzipping and opening the 6 MB catalog package takes seconds; the sibling
        // install suite budgets the same way, so a loaded machine cannot fail the run.
    }, 120_000);
});
