/**
 * First-run starter decks for a brand-new collection: Temel Bilimler (6 courses) and
 * Klinik Bilimler (5 courses) populated with 44 curated, ÖSYM-verified TUS demo questions.
 *
 * Runs at most once per fresh collection during startup (hooks/useAppStartup.ts). Existing
 * collections that already have notes, custom decks, or an installed catalog are never touched.
 * The seeded notes and decks are ordinary learner rows: the learner can study, edit, move, or
 * delete them freely, and they never come back once removed.
 */

import starterDemoAsset from '../assets/catalog/starter-demo-decks.json';
import { getDB } from './db';
import { checksumField, type AnkiCard, type Deck, type Note } from './models';
import { getBkaCatalogTier } from './bkaCatalog';
import { humanizeCardText } from './displayText';

export const STARTER_DEMO_SEEDED_KEY = 'starter_demo_decks_seeded_v1';
export const STARTER_DEMO_TAG = 'tus-deneme';
export const STARTER_DEMO_BASIC_DECK = 'Temel Bilimler';
export const STARTER_DEMO_CLINICAL_DECK = 'Klinik Bilimler';

const CLOZE_NOTE_TYPE_ID = 3;
const DEFAULT_DECK_CONFIG_ID = 1;
const STARTER_DECK_ID_BASE = 900_000;
const STARTER_NOTE_ID_BASE = 900_000_000;
const STARTER_CARD_ID_BASE = 900_001_000;

export type StarterDemoPart =
    | { type: 'text'; value: string }
    | { type: 'cloze'; index: number; answer: string };

export interface StarterDemoCardInput {
    id: string;
    deckId: string;
    course: string;
    topic: string;
    activeCloze: number;
    parts: StarterDemoPart[];
    extra: string;
}

interface StarterCourseDef {
    deckId: string;
    name: string;
    group: typeof STARTER_DEMO_BASIC_DECK | typeof STARTER_DEMO_CLINICAL_DECK;
}

const STARTER_COURSES: readonly StarterCourseDef[] = [
    { deckId: 'anatomi', name: 'Anatomi', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'fhe', name: 'FHE', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'biyokimya', name: 'Biyokimya', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'mikrobiyoloji', name: 'Mikrobiyoloji', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'patoloji', name: 'Patoloji', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'farmakoloji', name: 'Farmakoloji', group: STARTER_DEMO_BASIC_DECK },
    { deckId: 'dahiliye', name: 'Dahiliye', group: STARTER_DEMO_CLINICAL_DECK },
    { deckId: 'pediatri', name: 'Pediatri', group: STARTER_DEMO_CLINICAL_DECK },
    { deckId: 'genel-cerrahi', name: 'Genel Cerrahi', group: STARTER_DEMO_CLINICAL_DECK },
    { deckId: 'kucuk-stajlar', name: 'Küçük Stajlar', group: STARTER_DEMO_CLINICAL_DECK },
    { deckId: 'kadin-dogum', name: 'Kadın Doğum', group: STARTER_DEMO_CLINICAL_DECK },
];

const STARTER_CARDS = (starterDemoAsset as { cards: StarterDemoCardInput[] }).cards;

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

/** Convert a curated demo card into Anki Cloze fields `[Text, Back Extra]`. */
export function buildStarterDemoNoteFields(card: StarterDemoCardInput): [string, string] {
    let hasActiveCloze = false;
    const text = card.parts
        .map((part) => {
            if (part.type === 'text') return escapeHtml(part.value);
            const escaped = escapeHtml(part.answer);
            if (part.index === card.activeCloze) {
                hasActiveCloze = true;
                return `{{c1::${escaped}}}`;
            }
            return `<b>${escaped}</b>`;
        })
        .join('');

    const finalText = hasActiveCloze
        ? text
        : card.parts
            .map((part) => (part.type === 'text' ? escapeHtml(part.value) : `{{c1::${escapeHtml(part.answer)}}}`))
            .join('');

    const extra = card.extra.trim() ? escapeHtml(card.extra.trim()) : '';
    return [finalText, extra];
}

export interface StarterDemoSeedResult {
    seeded: boolean;
    decksCreated: number;
    cardsCreated: number;
}

/**
 * Populate a brand-new, empty collection with Temel Bilimler / Klinik Bilimler starter decks and
 * the 44 curated demo questions. Safe to call on every startup: runs once and skips any existing
 * collection that already holds notes, non-default decks, or an installed catalog.
 */
export function seedStarterDemoDecksIfFresh(): StarterDemoSeedResult {
    const db = getDB();
    const existingFlag = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        STARTER_DEMO_SEEDED_KEY,
    )?.value;
    if (existingFlag) {
        return { seeded: false, decksCreated: 0, cardsCreated: 0 };
    }

    const hasNotes = Boolean(db.getFirstSync<{ found: number }>('SELECT EXISTS(SELECT 1 FROM notes) AS found')?.found);
    const hasCustomDecks = Boolean(
        db.getFirstSync<{ found: number }>('SELECT EXISTS(SELECT 1 FROM decks WHERE id != 1) AS found')?.found,
    );
    const hasCatalog = getBkaCatalogTier() !== null;
    if (hasNotes || hasCustomDecks || hasCatalog) {
        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            STARTER_DEMO_SEEDED_KEY,
            'skipped',
        );
        return { seeded: false, decksCreated: 0, cardsCreated: 0 };
    }

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    const parentDecks: Deck[] = [
        {
            id: STARTER_DECK_ID_BASE + 1,
            name: STARTER_DEMO_BASIC_DECK,
            sortOrder: 0,
            configId: DEFAULT_DECK_CONFIG_ID,
            mod: nowSec,
            usn: -1,
            description: '',
            // Open on Basic Sciences first so the 6 courses are visible right away.
            collapsed: false,
            isFiltered: false,
        },
        {
            id: STARTER_DECK_ID_BASE + 2,
            name: STARTER_DEMO_CLINICAL_DECK,
            sortOrder: 1,
            configId: DEFAULT_DECK_CONFIG_ID,
            mod: nowSec,
            usn: -1,
            description: '',
            collapsed: true,
            isFiltered: false,
        },
    ];

    const deckIdBySlug = new Map<string, number>();
    let basicOrder = 0;
    let clinicalOrder = 0;
    const courseDecks: Deck[] = STARTER_COURSES.map((course, index) => {
        const id = STARTER_DECK_ID_BASE + 100 + index + 1;
        deckIdBySlug.set(course.deckId, id);
        return {
            id,
            name: `${course.group}::${course.name}`,
            sortOrder: course.group === STARTER_DEMO_BASIC_DECK ? basicOrder++ : clinicalOrder++,
            configId: DEFAULT_DECK_CONFIG_ID,
            mod: nowSec,
            usn: -1,
            description: '',
            collapsed: false,
            isFiltered: false,
        };
    });

    const allDecks = [...parentDecks, ...courseDecks];

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const deck of allDecks) {
            db.runSync(
                `INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                deck.id, deck.name, JSON.stringify(deck), nowMs, deck.usn,
            );
        }

        let cardsCreated = 0;
        STARTER_CARDS.forEach((demoCard, index) => {
            const deckId = deckIdBySlug.get(demoCard.deckId);
            if (!deckId) return;

            const noteId = STARTER_NOTE_ID_BASE + index + 1;
            const cardId = STARTER_CARD_ID_BASE + index + 1;
            const fields = buildStarterDemoNoteFields(demoCard);
            const sfld = humanizeCardText(fields[0]);
            const note: Note = {
                id: noteId,
                guid: `tusdemo${String(index + 1).padStart(3, '0')}`,
                noteTypeId: CLOZE_NOTE_TYPE_ID,
                mod: nowSec,
                usn: -1,
                tags: [STARTER_DEMO_TAG],
                fields,
                sfld,
                csum: checksumField(fields[0]),
                flags: 0,
            };
            const card: AnkiCard = {
                id: cardId,
                noteId,
                deckId,
                ord: 0,
                mod: nowSec,
                usn: -1,
                type: 0,
                queue: 0,
                due: index + 1,
                ivl: 0,
                factor: 2500,
                reps: 0,
                lapses: 0,
                left: 0,
                odue: 0,
                odid: 0,
                flags: 0,
                lastReview: 0,
            };

            db.runSync(
                `INSERT OR REPLACE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                note.id, note.noteTypeId, note.sfld, note.csum, ` ${STARTER_DEMO_TAG} `, JSON.stringify(note), nowMs, note.usn,
            );
            db.runSync(
                `INSERT OR REPLACE INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
                  data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due,
                card.ivl, card.factor, card.reps, card.lapses, card.left, card.flags,
                JSON.stringify(card), nowMs, nowMs, card.usn,
            );
            cardsCreated += 1;
        });

        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            STARTER_DEMO_SEEDED_KEY,
            'true',
        );
        db.execSync('COMMIT;');
        return { seeded: true, decksCreated: allDecks.length, cardsCreated };
    } catch (error) {
        try { db.execSync('ROLLBACK;'); } catch { /* already rolled back */ }
        throw error;
    }
}
