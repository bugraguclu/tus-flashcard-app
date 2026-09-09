/**
 * Regenerates assets/catalog/bka-manifest.json from the bundled Anki package.
 *
 * The store screen has to show real course and subdeck card counts while the catalog is
 * still locked, and parsing a 9 MB .apkg at launch just to draw a price list would be
 * wasteful. This script does that parse once, at build time, using the same taxonomy the
 * installer uses, so the locked preview and the installed decks always agree.
 *
 * Run with: npm run build:catalog-manifest
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { BKA_UNGROUPED_TOPIC, classifyBkaTopic, getBkaTopicNames } from '../lib/bkaTaxonomy';

const PACKAGE_PATH = 'assets/catalog/bka-tus-complete.apkg';
const MANIFEST_PATH = 'assets/catalog/bka-manifest.json';

const COURSE_ICONS: Record<string, string> = {
    'Deneme ve Soru BKA': '📝',
    'Anatomi BKA': '🫀',
    'FHE BKA': '🩺',
    'Biyokimya BKA': '🧪',
    'Mikrobiyoloji BKA': '🦠',
    'Patoloji BKA': '🔬',
    'Farmakoloji BKA': '💊',
    'Dahiliye BKA': '🩻',
    'Pediatri BKA': '👶',
    'Genel Cerrahi BKA': '🏥',
    'Küçük Stajlar BKA': '🧑‍⚕️',
    'Kadın Doğum BKA': '🤰',
};

function slugifyDeck(name: string): string {
    const replacements: Record<string, string> = {
        ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i',
        ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
    };
    return `bka-${name
        .split('')
        .map((char) => replacements[char] ?? char)
        .join('')
        .toLowerCase()
        .replace(/\bbka\b/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`;
}

async function main(): Promise<void> {
    const bytes = readFileSync(PACKAGE_PATH);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const zip = await JSZip.loadAsync(bytes);
    const collectionFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
    if (!collectionFile) throw new Error('collection.anki21 not found in package');
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    const db = new SQL.Database(await collectionFile.async('uint8array'));

    const all = <T>(sql: string): T[] => {
        const [result] = db.exec(sql);
        if (!result) return [];
        return result.values.map((values) => Object.fromEntries(
            result.columns.map((column, index) => [column, values[index]]),
        ) as T);
    };

    const col = all<{ models: string; decks: string }>('SELECT models, decks FROM col LIMIT 1')[0];
    const models = Object.values(JSON.parse(col.models) as Record<string, { id: number; name: string }>);
    const sourceDecks = Object.values(JSON.parse(col.decks) as Record<string, { id: number; name: string }>)
        .filter((deck) => Number(deck.id) !== 1 && deck.name !== 'Default')
        .sort((left, right) => Number(left.id) - Number(right.id));

    const notes = all<{ id: number; guid: string; mid: number; tags: string; flds: string }>(
        'SELECT id, guid, mid, tags, flds FROM notes ORDER BY id',
    );
    const cards = all<{ id: number; nid: number; did: number }>('SELECT id, nid, did FROM cards ORDER BY id');
    const media = Object.keys(JSON.parse(await (zip.file('media')?.async('text') ?? Promise.resolve('{}'))));

    const deckIdByNoteId = new Map<number, number>();
    for (const card of cards) {
        const noteId = Number(card.nid);
        const deckId = Number(card.did);
        const current = deckIdByNoteId.get(noteId);
        if (current === undefined || deckId < current) deckIdByNoteId.set(noteId, deckId);
    }

    const deckById = new Map(sourceDecks.map((deck) => [Number(deck.id), deck]));
    const topicByNoteId = new Map<number, string>();
    const noteCountByTopic = new Map<string, number>();
    for (const note of notes) {
        const deckId = deckIdByNoteId.get(Number(note.id));
        const deck = deckId === undefined ? undefined : deckById.get(deckId);
        if (!deck) throw new Error(`note ${note.id} has no source deck`);
        const topic = classifyBkaTopic(
            deck.name,
            String(note.tags ?? '').trim().split(/\s+/).filter(Boolean),
            String(note.flds ?? '').split('\u001f').join(' '),
        ) ?? BKA_UNGROUPED_TOPIC;
        topicByNoteId.set(Number(note.id), topic);
        const key = `${deck.id}\x1f${topic}`;
        noteCountByTopic.set(key, (noteCountByTopic.get(key) ?? 0) + 1);
    }

    const cardCountByTopic = new Map<string, number>();
    for (const card of cards) {
        const topic = topicByNoteId.get(Number(card.nid));
        if (!topic) throw new Error(`card ${card.id} has no classified note`);
        const key = `${card.did}\x1f${topic}`;
        cardCountByTopic.set(key, (cardCountByTopic.get(key) ?? 0) + 1);
    }

    const courses = sourceDecks.map((deck) => {
        const counted = (topic: string, deckBacked: boolean) => ({
            name: topic,
            notes: noteCountByTopic.get(`${deck.id}\x1f${topic}`) ?? 0,
            cards: cardCountByTopic.get(`${deck.id}\x1f${topic}`) ?? 0,
            // false = the author left these notes unlabeled, so they stay in the course deck.
            deck: deckBacked,
        });
        const topics = [
            ...getBkaTopicNames(deck.name).map((topic) => counted(topic, true)),
            counted(BKA_UNGROUPED_TOPIC, false),
        ].filter((topic) => topic.cards > 0);
        return {
            id: slugifyDeck(deck.name),
            name: deck.name.replace(/\s+BKA$/, ''),
            sourceDeckName: deck.name,
            sourceDeckId: Number(deck.id),
            icon: COURSE_ICONS[deck.name] ?? '📘',
            notes: topics.reduce((sum, topic) => sum + topic.notes, 0),
            cards: topics.reduce((sum, topic) => sum + topic.cards, 0),
            topics,
        };
    });

    const manifest = {
        generatedFrom: PACKAGE_PATH,
        sha256,
        noteTypes: models
            .map((model) => ({ id: Number(model.id), name: model.name }))
            .sort((left, right) => left.id - right.id),
        protectedNoteGuids: notes.map((note) => String(note.guid)).sort(),
        totals: {
            notes: notes.length,
            cards: cards.length,
            courses: courses.length,
            // Only real subdecks count as topics; the ungrouped bucket is not a deck.
            topics: courses.reduce((sum, course) => sum + course.topics.filter((topic) => topic.deck).length, 0),
            ungroupedCards: courses.reduce(
                (sum, course) => sum + course.topics.filter((topic) => !topic.deck).reduce((n, topic) => n + topic.cards, 0),
                0,
            ),
            media: media.length,
        },
        courses,
    };

    const totalCourseCards = courses.reduce((sum, course) => sum + course.cards, 0);
    if (totalCourseCards !== cards.length) {
        throw new Error(`course card totals ${totalCourseCards} != package cards ${cards.length}`);
    }

    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    db.close();
    console.log(
        `Wrote ${MANIFEST_PATH}: ${manifest.totals.cards} cards, ${manifest.totals.courses} courses, `
        + `${manifest.totals.topics} topics, ${manifest.totals.media} media.`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
