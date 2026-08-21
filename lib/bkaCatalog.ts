/**
 * One-time installation of the bundled BKA TUS catalog.
 *
 * The source is kept as an Anki package asset so the original note fields, card ordinals,
 * deck assignment, templates, CSS and media stay together. Installation is deliberately
 * strict: an incomplete package never replaces the user's active collection.
 */

import { Asset } from 'expo-asset';
import type JSZipType from 'jszip';
import { getDB } from './db';
import { readUriBytes } from './files';
import {
    extractCollectionFromZip,
    importMediaFromZip,
    loadAnkiZip,
    openAnkiReader,
    type SqliteReader,
} from './importApkg';
import { checksumField, type AnkiCard, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import type { UserSubject } from './subjects';
import { listStoredMediaFilenames, removeMediaExcept } from './mediaStore';
import { classifyBkaTopic, getBkaTopicNames } from './bkaTaxonomy';

export const BKA_CATALOG_INSTALL_KEY = 'bka_tus_catalog_tier_v4';
export const BKA_TRIAL_CARDS_PER_SUBJECT = 100;
export const BKA_TRIAL_TOTAL_CARDS = 1200;
export type BkaCatalogTier = 'trial' | 'full';
export const BKA_CATALOG_EXPECTED = {
    notes: 7737,
    cards: 9583,
    rootDecks: 12,
    noteTypes: 2,
    media: 49,
} as const;

const SUBDECK_ID_BASE = 8_000_000_000_000;

type SourceCol = { models: string; decks: string; dconf: string };
type SourceNote = {
    id: number;
    guid: string;
    mid: number;
    mod: number;
    usn: number;
    tags: string;
    flds: string;
    sfld: string;
    csum: number;
    flags: number;
};
type SourceCard = {
    id: number;
    nid: number;
    did: number;
    ord: number;
    mod: number;
    usn: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    left: number;
    odue: number;
    odid: number;
    flags: number;
};

type SourceModel = {
    id: number;
    name: string;
    type: number;
    mod: number;
    sortf?: number;
    flds?: Array<{ name?: string; ord?: number; sticky?: boolean; rtl?: boolean }>;
    tmpls?: Array<{ name?: string; ord?: number; qfmt?: string; afmt?: string }>;
    css?: string;
};

type SourceDeck = {
    id: number;
    name: string;
    conf?: number;
    mod?: number;
    usn?: number;
    desc?: string;
    collapsed?: boolean;
    dyn?: number;
};

type SourceDeckConfig = {
    id: number;
    name?: string;
    mod?: number;
    usn?: number;
    maxTaken?: number;
    autoplay?: boolean;
    timer?: number;
    new?: {
        bury?: boolean;
        delays?: number[];
        initialFactor?: number;
        ints?: number[];
        order?: number;
        perDay?: number;
    };
    rev?: {
        bury?: boolean;
        ease4?: number;
        ivlFct?: number;
        maxIvl?: number;
        perDay?: number;
        hardFactor?: number;
    };
    lapse?: {
        delays?: number[];
        leechAction?: number;
        leechFails?: number;
        minInt?: number;
        mult?: number;
    };
    buryInterdayLearning?: boolean;
};

export interface BkaCatalogSnapshot {
    noteTypes: NoteType[];
    decks: Deck[];
    deckConfigs: DeckConfig[];
    notes: Note[];
    cards: AnkiCard[];
    subjects: UserSubject[];
}

export interface BkaCatalogInstallResult {
    installed: boolean;
    tier: BkaCatalogTier;
    previousNotes: number;
    previousCards: number;
    notes: number;
    cards: number;
    decks: number;
    noteTypes: number;
    media: number;
}

const DECK_ICONS: Record<string, string> = {
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

function parseJsonMap<T>(raw: string, label: string): Record<string, T> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('map değil');
        return parsed as Record<string, T>;
    } catch (error) {
        throw new Error(`BKA paketindeki ${label} verisi okunamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
}

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

function splitAnkiTags(raw: string): string[] {
    return raw.trim().split(/\s+/).filter(Boolean);
}

function mapNoteType(source: SourceModel): NoteType {
    const fields = [...(source.flds ?? [])]
        .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
        .map((field, index) => ({
            name: field.name || `Field ${index + 1}`,
            ord: Number(field.ord ?? index),
            sticky: Boolean(field.sticky),
            rtl: Boolean(field.rtl),
        }));
    const templates = [...(source.tmpls ?? [])]
        .sort((left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0))
        .map((template, index) => ({
            name: template.name || `Card ${index + 1}`,
            ord: Number(template.ord ?? index),
            qfmt: template.qfmt ?? '',
            afmt: template.afmt ?? '',
        }));

    return {
        id: Number(source.id),
        name: source.name,
        kind: source.type === 1 ? 'cloze' : 'standard',
        fields,
        templates,
        css: source.css ?? '',
        sortFieldIdx: Number(source.sortf ?? 0),
        mod: Number(source.mod ?? 0),
    };
}

function mapDeckConfig(source: SourceDeckConfig): DeckConfig {
    return {
        id: Number(source.id),
        name: source.name || 'BKA Varsayılan',
        mod: Number(source.mod ?? 0),
        usn: Number(source.usn ?? -1),
        newPerDay: Number(source.new?.perDay ?? 20),
        learningSteps: (source.new?.delays ?? [1, 10]).map(Number),
        graduatingIvl: Number(source.new?.ints?.[0] ?? 1),
        easyIvl: Number(source.new?.ints?.[1] ?? 4),
        startingEase: Number(source.new?.initialFactor ?? 2500),
        insertionOrder: Number(source.new?.order ?? 1) === 0 ? 'random' : 'sequential',
        maxReviewsPerDay: Number(source.rev?.perDay ?? 200),
        easyBonus: Number(source.rev?.ease4 ?? 1.3),
        hardIvl: Number(source.rev?.hardFactor ?? 1.2),
        ivlModifier: Number(source.rev?.ivlFct ?? 1),
        maxIvl: Number(source.rev?.maxIvl ?? 36500),
        relearningSteps: (source.lapse?.delays ?? [10]).map(Number),
        minIvl: Number(source.lapse?.minInt ?? 1),
        leechThreshold: Number(source.lapse?.leechFails ?? 8),
        leechAction: Number(source.lapse?.leechAction ?? 1) === 0 ? 'tag' : 'suspend',
        newIvlPercent: Number(source.lapse?.mult ?? 0),
        buryNewSiblings: Boolean(source.new?.bury),
        buryReviewSiblings: Boolean(source.rev?.bury),
        buryInterdayLearningSiblings: Boolean(source.buryInterdayLearning),
        showTimer: Boolean(source.timer),
        maxAnswerSecs: Number(source.maxTaken ?? 60),
        newCardGatherOrder: 'position',
        newReviewOrder: 'mix',
        reviewSortOrder: 'dueRandom',
        autoPlayAudio: source.autoplay !== false,
        easyDays: [1, 1, 1, 1, 1, 1, 1],
    };
}

function assertSnapshot(snapshot: BkaCatalogSnapshot): void {
    const rootDecks = snapshot.decks.filter((deck) => !deck.name.includes('::'));
    if (
        snapshot.notes.length !== BKA_CATALOG_EXPECTED.notes
        || snapshot.cards.length !== BKA_CATALOG_EXPECTED.cards
        || rootDecks.length !== BKA_CATALOG_EXPECTED.rootDecks
        || snapshot.noteTypes.length !== BKA_CATALOG_EXPECTED.noteTypes
    ) {
        throw new Error(
            `BKA paket bütünlüğü hatası: ${snapshot.notes.length} not, ${snapshot.cards.length} kart, `
            + `${rootDecks.length} kök deste, ${snapshot.noteTypes.length} not tipi. Aktif koleksiyon değiştirilmedi.`,
        );
    }

    const deckIds = new Set(snapshot.decks.map((deck) => deck.id));
    const noteIds = new Set(snapshot.notes.map((note) => note.id));
    const noteTypeIds = new Set(snapshot.noteTypes.map((type) => type.id));
    if (snapshot.cards.some((card) => !deckIds.has(card.deckId) || !noteIds.has(card.noteId))) {
        throw new Error('BKA paketinde destesi veya notu bulunmayan kart var. Aktif koleksiyon değiştirilmedi.');
    }
    if (snapshot.notes.some((note) => !noteTypeIds.has(note.noteTypeId))) {
        throw new Error('BKA paketinde not türü bulunmayan not var. Aktif koleksiyon değiştirilmedi.');
    }
}

export function readBkaCatalog(reader: SqliteReader): BkaCatalogSnapshot {
    const col = reader.getFirstSync<SourceCol>('SELECT models, decks, dconf FROM col LIMIT 1');
    if (!col) throw new Error('BKA paketinde koleksiyon üst bilgisi bulunamadı.');

    const noteTypes = Object.values(parseJsonMap<SourceModel>(col.models, 'not türü'))
        .map(mapNoteType)
        .sort((left, right) => left.id - right.id);
    const sourceDecks = Object.values(parseJsonMap<SourceDeck>(col.decks, 'deste'))
        .filter((deck) => Number(deck.id) !== 1 && deck.name !== 'Default')
        .sort((left, right) => Number(left.id) - Number(right.id));
    const rootDecks: Deck[] = sourceDecks.map((deck, index) => ({
        id: Number(deck.id),
        name: deck.name,
        sortOrder: index,
        configId: Number(deck.conf ?? 1),
        mod: Number(deck.mod ?? 0),
        usn: Number(deck.usn ?? -1),
        description: deck.desc ?? '',
        // More than one hundred curated children exist; iPhone starts with a clean 12-course
        // overview and lets the learner expand only the course they need.
        collapsed: true,
        isFiltered: Boolean(deck.dyn),
    }));
    const deckConfigs = Object.values(parseJsonMap<SourceDeckConfig>(col.dconf, 'deste ayarı'))
        .map(mapDeckConfig)
        .sort((left, right) => left.id - right.id);

    const subjects: UserSubject[] = rootDecks.map((deck) => ({
        id: slugifyDeck(deck.name),
        name: deck.name.replace(/\s+BKA$/, ''),
        icon: DECK_ICONS[deck.name] ?? '📘',
        topics: getBkaTopicNames(deck.name),
        deckId: deck.id,
        isCustom: true,
    }));
    const sourceDeckIdByNoteId = new Map(
        reader.getAllSync<{ nid: number; did: number }>('SELECT nid, MIN(did) AS did FROM cards GROUP BY nid')
            .map((row) => [Number(row.nid), Number(row.did)]),
    );
    const rootById = new Map(rootDecks.map((deck) => [deck.id, deck]));
    const subjectByRootId = new Map(subjects.map((subject) => [subject.deckId, subject]));
    const subdeckIdByKey = new Map<string, number>();
    const subdecks: Deck[] = [];
    rootDecks.forEach((deck, rootIndex) => {
        getBkaTopicNames(deck.name).forEach((topic, topicIndex) => {
            const id = SUBDECK_ID_BASE + rootIndex * 1000 + topicIndex + 1;
            subdeckIdByKey.set(`${deck.id}\x1f${topic}`, id);
            subdecks.push({
                id,
                name: `${deck.name}::${topic}`,
                sortOrder: topicIndex,
                configId: deck.configId,
                mod: deck.mod,
                usn: deck.usn,
                description: '',
                collapsed: false,
                isFiltered: false,
            });
        });
    });

    const notes: Note[] = reader.getAllSync<SourceNote>(
        'SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags FROM notes ORDER BY id',
    ).map((row) => {
        const fields = (row.flds ?? '').split('\x1f');
        const tags = splitAnkiTags(row.tags ?? '');
        const rootDeckId = sourceDeckIdByNoteId.get(Number(row.id));
        const rootDeck = rootDeckId === undefined ? undefined : rootById.get(rootDeckId);
        const subject = rootDeckId === undefined ? undefined : subjectByRootId.get(rootDeckId);
        if (!rootDeck || !subject) throw new Error(`BKA notu için kök deste bulunamadı: ${row.id}`);
        const topic = classifyBkaTopic(rootDeck.name, fields, tags);
        return {
            id: Number(row.id),
            guid: row.guid,
            noteTypeId: Number(row.mid),
            mod: Number(row.mod),
            usn: Number(row.usn),
            tags,
            fields,
            sfld: String(row.sfld ?? ''),
            csum: Number(row.csum ?? checksumField(fields[0] ?? '')),
            flags: Number(row.flags ?? 0),
            catalogSubject: subject.id,
            catalogTopic: topic,
        };
    });
    const noteById = new Map(notes.map((note) => [note.id, note]));

    const cards: AnkiCard[] = reader.getAllSync<SourceCard>(
        `SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor,
                reps, lapses, "left" AS "left", odue, odid, flags
         FROM cards ORDER BY id`,
    ).map((row) => {
        const sourceDeckId = Number(row.did);
        const note = noteById.get(Number(row.nid));
        const topic = note?.catalogTopic;
        const deckId = topic ? subdeckIdByKey.get(`${sourceDeckId}\x1f${topic}`) : undefined;
        if (!note || deckId === undefined) throw new Error(`BKA kartı alt deste ile eşleştirilemedi: ${row.id}`);
        return {
            id: Number(row.id),
            noteId: Number(row.nid),
            deckId,
            sourceDeckId,
            ord: Number(row.ord),
            mod: Number(row.mod),
            usn: Number(row.usn),
            type: Math.max(0, Math.min(3, Number(row.type))) as AnkiCard['type'],
            queue: Math.max(-3, Math.min(4, Number(row.queue))) as AnkiCard['queue'],
            due: Number(row.due),
            ivl: Number(row.ivl),
            factor: Number(row.factor),
            reps: Number(row.reps),
            lapses: Number(row.lapses),
            left: Number(row.left),
            odue: Number(row.odue),
            odid: Number(row.odid),
            flags: Math.max(0, Math.min(7, Number(row.flags))) as AnkiCard['flags'],
            lastReview: 0,
        };
    });

    const usedSubdeckIds = new Set(cards.map((card) => card.deckId));
    const usedSubdecks = subdecks.filter((deck) => usedSubdeckIds.has(deck.id));
    for (const subject of subjects) {
        const usedTopics = new Set(notes
            .filter((note) => note.catalogSubject === subject.id)
            .map((note) => note.catalogTopic));
        subject.topics = subject.topics.filter((topic) => usedTopics.has(topic));
    }
    const snapshot = { noteTypes, decks: [...rootDecks, ...usedSubdecks], deckConfigs, notes, cards, subjects };
    assertSnapshot(snapshot);
    return snapshot;
}

/** Select exactly 100 cards per source course, rotating through its subtopics for broad coverage. */
export function buildBkaTrialCatalog(full: BkaCatalogSnapshot): BkaCatalogSnapshot {
    const selectedIds = new Set<number>();
    for (const subject of full.subjects) {
        const perSubdeck = new Map<number, AnkiCard[]>();
        for (const card of full.cards) {
            if (card.sourceDeckId !== subject.deckId) continue;
            const bucket = perSubdeck.get(card.deckId) ?? [];
            bucket.push(card);
            perSubdeck.set(card.deckId, bucket);
        }
        const queues = [...perSubdeck.values()].map((cards) => cards.sort((a, b) => a.id - b.id));
        let cursor = 0;
        let selectedForSubject = 0;
        while (selectedForSubject < BKA_TRIAL_CARDS_PER_SUBJECT) {
            let added = false;
            for (const queue of queues) {
                const next = queue[cursor];
                if (!next) continue;
                selectedIds.add(next.id);
                selectedForSubject++;
                added = true;
                if (selectedForSubject >= BKA_TRIAL_CARDS_PER_SUBJECT) break;
            }
            if (!added) break;
            cursor++;
        }
        if (selectedForSubject !== BKA_TRIAL_CARDS_PER_SUBJECT) {
            throw new Error(`${subject.name} deneme seçimi 100 karta ulaşmadı: ${selectedForSubject}`);
        }
    }
    const cards = full.cards.filter((card) => selectedIds.has(card.id));
    const noteIds = new Set(cards.map((card) => card.noteId));
    const notes = full.notes.filter((note) => noteIds.has(note.id));
    if (cards.length !== BKA_TRIAL_TOTAL_CARDS) throw new Error(`BKA deneme kartı sayısı ${cards.length}/${BKA_TRIAL_TOTAL_CARDS}.`);
    return { ...full, notes, cards };
}

function parseStoredRows<T>(table: 'note_types' | 'decks' | 'deck_configs' | 'notes' | 'anki_cards'): T[] {
    return getDB().getAllSync<{ data: string }>(`SELECT data FROM ${table}`).flatMap((row) => {
        try { return [JSON.parse(row.data) as T]; } catch { return []; }
    });
}

/**
 * Tier changes replace only the bundled catalog. Cards/decks a learner creates or imports
 * after the first migration remain untouched, which keeps the free app genuinely Anki-like.
 */
export function mergePreservedUserContent(
    fullCatalog: BkaCatalogSnapshot,
    targetCatalog: BkaCatalogSnapshot,
): BkaCatalogSnapshot {
    const catalogIds = {
        noteTypes: new Set(fullCatalog.noteTypes.map((entry) => entry.id)),
        decks: new Set(fullCatalog.decks.map((entry) => entry.id)),
        deckConfigs: new Set(fullCatalog.deckConfigs.map((entry) => entry.id)),
        notes: new Set(fullCatalog.notes.map((entry) => entry.id)),
        cards: new Set(fullCatalog.cards.map((entry) => entry.id)),
        subjects: new Set(fullCatalog.subjects.map((entry) => entry.id)),
    };
    const userNoteTypes = parseStoredRows<NoteType>('note_types')
        .filter((entry) => !catalogIds.noteTypes.has(entry.id));
    const userDecks = parseStoredRows<Deck>('decks')
        .filter((entry) => !catalogIds.decks.has(entry.id));
    const userDeckConfigs = parseStoredRows<DeckConfig>('deck_configs')
        .filter((entry) => !catalogIds.deckConfigs.has(entry.id));
    const userNotes = parseStoredRows<Note>('notes')
        .filter((entry) => !catalogIds.notes.has(entry.id));
    const userNoteIds = new Set(userNotes.map((entry) => entry.id));
    const userCards = parseStoredRows<AnkiCard>('anki_cards')
        .filter((entry) => !catalogIds.cards.has(entry.id) && userNoteIds.has(entry.noteId));

    let storedSubjects: UserSubject[] = [];
    const rawSubjects = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        'user_subjects_v1',
    )?.value;
    if (rawSubjects) {
        try {
            const parsed = JSON.parse(rawSubjects) as unknown;
            if (Array.isArray(parsed)) storedSubjects = parsed as UserSubject[];
        } catch { /* malformed legacy setting is replaced by the catalog */ }
    }
    const userSubjects = storedSubjects.filter((entry) => entry?.id && !catalogIds.subjects.has(entry.id));

    return {
        noteTypes: [...targetCatalog.noteTypes, ...userNoteTypes],
        decks: [...targetCatalog.decks, ...userDecks],
        deckConfigs: [...targetCatalog.deckConfigs, ...userDeckConfigs],
        notes: [...targetCatalog.notes, ...userNotes],
        cards: [...targetCatalog.cards, ...userCards],
        subjects: [...targetCatalog.subjects, ...userSubjects],
    };
}

function writeSnapshot(
    snapshot: BkaCatalogSnapshot,
    options: { preserveProgress?: boolean } = {},
): { previousNotes: number; previousCards: number } {
    const db = getDB();
    const previousNotes = db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM notes')?.count ?? 0;
    const previousCards = db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM anki_cards')?.count ?? 0;
    const now = Date.now();
    const targetCardIds = new Set(snapshot.cards.map((card) => card.id));
    const existingCards = new Map<number, AnkiCard>();
    const existingReviews: any[] = [];
    const existingSessions: Array<{ date: string; data: string }> = [];
    const existingGraves: Array<{ oid: number; type: number; usn: number }> = [];
    if (options.preserveProgress) {
        for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM anki_cards')) {
            if (!targetCardIds.has(Number(row.id))) continue;
            try { existingCards.set(Number(row.id), JSON.parse(row.data) as AnkiCard); } catch { /* source state wins */ }
        }
        existingReviews.push(...db.getAllSync<any>('SELECT * FROM revlog ORDER BY id')
            .filter((row) => targetCardIds.has(Number(row.cardId))));
        existingSessions.push(...db.getAllSync<{ date: string; data: string }>('SELECT date, data FROM session_stats'));
        const targetNoteIds = new Set(snapshot.notes.map((note) => note.id));
        const targetDeckIds = new Set(snapshot.decks.map((deck) => deck.id));
        existingGraves.push(...db.getAllSync<{ oid: number; type: number; usn: number }>('SELECT oid, type, usn FROM graves')
            .filter((row) => (
                (row.type === 0 && !targetCardIds.has(Number(row.oid)))
                || (row.type === 1 && !targetNoteIds.has(Number(row.oid)))
                || (row.type === 2 && !targetDeckIds.has(Number(row.oid)))
                || ![0, 1, 2].includes(Number(row.type))
            )));
    }

    db.execSync('BEGIN TRANSACTION;');
    try {
        db.execSync(`
            DELETE FROM revlog;
            DELETE FROM cards_fts;
            DELETE FROM anki_cards;
            DELETE FROM notes;
            DELETE FROM decks;
            DELETE FROM deck_configs;
            DELETE FROM note_types;
            DELETE FROM graves;
            DELETE FROM session_stats;
        `);
        db.runSync("DELETE FROM settings WHERE key LIKE 'bka_tus_%catalog%v%'");

        for (const config of snapshot.deckConfigs) {
            db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
        }
        for (const deck of snapshot.decks) {
            db.runSync(
                `INSERT INTO decks (id, name, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                deck.id, deck.name, JSON.stringify(deck), now, deck.usn,
            );
        }
        for (const noteType of snapshot.noteTypes) {
            db.runSync(
                `INSERT INTO note_types (id, name, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, -1, 0)`,
                noteType.id, noteType.name, JSON.stringify(noteType), now,
            );
        }
        for (const note of snapshot.notes) {
            db.runSync(
                `INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                note.id,
                note.noteTypeId,
                note.sfld,
                note.csum,
                note.tags.length ? ` ${note.tags.join(' ')} ` : '',
                JSON.stringify(note),
                now,
                note.usn,
            );
        }
        for (const sourceCard of snapshot.cards) {
            const previous = existingCards.get(sourceCard.id);
            const card = previous ? {
                ...sourceCard,
                type: previous.type,
                queue: previous.queue,
                due: previous.due,
                ivl: previous.ivl,
                factor: previous.factor,
                reps: previous.reps,
                lapses: previous.lapses,
                left: previous.left,
                odue: previous.odue,
                odid: previous.odid,
                flags: previous.flags,
                lastReview: previous.lastReview,
            } : sourceCard;
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
                  data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id,
                card.noteId,
                card.deckId,
                card.ord,
                card.type,
                card.queue,
                card.due,
                card.ivl,
                card.factor,
                card.reps,
                card.lapses,
                card.left,
                card.flags,
                JSON.stringify(card),
                now,
                card.usn,
            );
        }

        for (const row of existingReviews) {
            db.runSync(
                `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                row.id, row.cardId, row.usn, row.ease, row.ivl, row.lastIvl, row.factor, row.time, row.type,
            );
        }
        for (const row of existingSessions) {
            db.runSync('INSERT INTO session_stats (date, data) VALUES (?, ?)', row.date, row.data);
        }
        for (const row of existingGraves) {
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, ?, ?)', row.oid, row.type, row.usn);
        }

        const migrationSettings: Record<string, string> = {
            tus_anki_initialized: 'true',
            tus_legacy_custom_cards_migrated_v1: 'true',
            tus_legacy_card_state_migrated_v1: 'true',
            subject_topic_decks_v1: 'true',
            user_subjects_v1: JSON.stringify(snapshot.subjects),
        };
        for (const [key, value] of Object.entries(migrationSettings)) {
            db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return { previousNotes, previousCards };
}

function assertInstalledDatabase(snapshot: BkaCatalogSnapshot): void {
    const db = getDB();
    const counts = {
        notes: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM notes')?.count ?? -1,
        cards: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM anki_cards')?.count ?? -1,
        decks: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM decks')?.count ?? -1,
        noteTypes: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM note_types')?.count ?? -1,
    };
    if (
        counts.notes !== snapshot.notes.length
        || counts.cards !== snapshot.cards.length
        || counts.decks !== snapshot.decks.length
        || counts.noteTypes !== snapshot.noteTypes.length
    ) {
        throw new Error(`BKA kurulum sonrası bütünlük hatası: ${JSON.stringify(counts)}. Kurulum sonraki açılışta yeniden denenecek.`);
    }
}

export function getBkaCatalogTier(): BkaCatalogTier | null {
    const value = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        BKA_CATALOG_INSTALL_KEY,
    )?.value;
    return value === 'trial' || value === 'full' ? value : null;
}

/** True once this release has replaced the active collection with a trial or full catalog. */
export function isBkaCatalogInstalled(): boolean {
    return getBkaCatalogTier() !== null;
}

async function loadBundledPackage(): Promise<{ bytes: Uint8Array; zip: JSZipType }> {
    // Metro needs a static require so every platform includes the package in the build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asset = Asset.fromModule(require('../assets/catalog/bka-tus-complete.apkg'));
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('BKA katalog varlığı indirilemedi.');
    const bytes = await readUriBytes(uri);
    return { bytes, zip: await loadAnkiZip(bytes) };
}

/**
 * Install exactly once. Media is validated and stored before the destructive DB transaction;
 * if parsing or any media copy fails, the active collection is left untouched.
 */
async function replaceCatalogTier(tier: BkaCatalogTier, preserveProgress: boolean): Promise<BkaCatalogInstallResult> {
    const { zip } = await loadBundledPackage();
    const collectionBytes = await extractCollectionFromZip(zip);
    const reader = await openAnkiReader(collectionBytes);
    let full: BkaCatalogSnapshot;
    try {
        full = readBkaCatalog(reader);
    } finally {
        reader.close();
    }
    const catalogSnapshot = tier === 'full' ? full : buildBkaTrialCatalog(full);
    const snapshot = preserveProgress
        ? mergePreservedUserContent(full, catalogSnapshot)
        : catalogSnapshot;

    const preservedMedia = preserveProgress ? await listStoredMediaFilenames() : [];

    const media = await importMediaFromZip(zip);
    if (media.imported !== BKA_CATALOG_EXPECTED.media || media.skipped !== 0) {
        throw new Error(
            `BKA medya bütünlüğü hatası: ${media.imported}/${BKA_CATALOG_EXPECTED.media} aktarıldı, ${media.skipped} atlandı. Aktif koleksiyon değiştirilmedi.`,
        );
    }

    const previous = writeSnapshot(snapshot, { preserveProgress });
    const keptMedia = new Set([...preservedMedia, ...media.filenames]);
    const mediaCleanup = await removeMediaExcept(keptMedia);
    if (mediaCleanup.remaining !== keptMedia.size) {
        throw new Error(
            `BKA medya değiştirme hatası: depoda ${mediaCleanup.remaining}/${keptMedia.size} dosya kaldı. Kurulum sonraki açılışta yeniden denenecek.`,
        );
    }
    assertInstalledDatabase(snapshot);
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        BKA_CATALOG_INSTALL_KEY,
        tier,
    );
    return {
        installed: true,
        tier,
        ...previous,
        notes: snapshot.notes.length,
        cards: snapshot.cards.length,
        decks: snapshot.decks.length,
        noteTypes: snapshot.noteTypes.length,
        media: media.imported,
    };
}

export async function installBkaCatalogIfNeeded(): Promise<BkaCatalogInstallResult> {
    const currentTier = getBkaCatalogTier();
    if (currentTier) {
        const db = getDB();
        return {
            installed: false,
            tier: currentTier,
            previousNotes: 0,
            previousCards: 0,
            notes: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM notes')?.count ?? 0,
            cards: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM anki_cards')?.count ?? 0,
            decks: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM decks')?.count ?? 0,
            noteTypes: db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM note_types')?.count ?? 0,
            media: BKA_CATALOG_EXPECTED.media,
        };
    }
    const legacyCatalog = (getDB().getFirstSync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM settings WHERE key LIKE 'bka_tus_%catalog%v%'",
    )?.count ?? 0) > 0;
    return replaceCatalogTier('trial', legacyCatalog);
}

/** Match physical card storage to the receipt: 1,200-card trial when locked, full when owned. */
export async function ensureBkaCatalogTier(tier: BkaCatalogTier): Promise<BkaCatalogInstallResult> {
    const current = getBkaCatalogTier();
    if (current === tier) return installBkaCatalogIfNeeded();
    return replaceCatalogTier(tier, current !== null);
}
