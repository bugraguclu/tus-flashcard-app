/**
 * Read the bundled BKA TUS Anki package into the app's own model, and pick the trial sample
 * from it. Nothing here touches the collection: `lib/bkaCatalog.ts` installs the snapshot this
 * module returns, and re-exports this module's API.
 */

import type { SqliteReader } from './importApkg';
import { checksumField, type AnkiCard, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import type { UserSubject } from './subjects';
import { BKA_UNGROUPED_TOPIC, classifyBkaTopic, getBkaTopicNames } from './bkaTaxonomy';
import { CATALOG_PACK_ID } from './catalogRows';
import { BKA_MANIFEST } from './bkaManifest';
import { humanizeCardText } from './displayText';

/** Marks every row this module owns, so removal can never reach the learner's own content. */
export const BKA_CATALOG_PACK = CATALOG_PACK_ID;
export const BKA_CATALOG_DEFAULT_ROOT_DECK = 'TUS Kartları';
export const BKA_TRIAL_DEFAULT_ROOT_DECK = 'TUS Deneme';
export const BKA_TRIAL_CARDS_PER_SUBDECK = 30;

export const BKA_CATALOG_ROOT_DECK_ID = 8_000_000_000_000;
const SUBDECK_ID_BASE = 8_000_000_000_000;
const DECK_CONFIG_ID_BASE = 8_100_000_000_000;

export const BKA_CATALOG_EXPECTED = {
    notes: BKA_MANIFEST.totals.notes,
    cards: BKA_MANIFEST.totals.cards,
    courseDecks: BKA_MANIFEST.totals.courses,
    topicDecks: BKA_MANIFEST.totals.topics,
    noteTypes: BKA_MANIFEST.noteTypes.length,
    media: BKA_MANIFEST.totals.media,
} as const;

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
    rootDeckName: string;
    noteTypes: NoteType[];
    decks: Deck[];
    deckConfigs: DeckConfig[];
    notes: Note[];
    cards: AnkiCard[];
    subjects: UserSubject[];
}

function parseJsonMap<T>(raw: string, label: string): Record<string, T> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('map değil');
        return parsed as Record<string, T>;
    } catch (error) {
        throw new Error(`BKA paketindeki ${label} verisi okunamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        catalogPack: BKA_CATALOG_PACK,
    };
}

function mapDeckConfig(source: SourceDeckConfig, catalogId: number, rootDeckName: string): DeckConfig {
    const sourceName = source.name?.trim();
    const technicalDefaultName = !sourceName || /^(default|varsayılan)$/i.test(sourceName);
    return {
        id: catalogId,
        name: technicalDefaultName ? rootDeckName : `${rootDeckName} · ${sourceName}`,
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
        // Anki's enum is LEECH_ACTION_SUSPEND = 0, LEECH_ACTION_TAG_ONLY = 1 — this read the
        // two the wrong way round, so an imported preset arrived with the opposite behaviour.
        leechAction: Number(source.lapse?.leechAction ?? 1) === 0 ? 'suspend' : 'tag',
        newIvlPercent: Number(source.lapse?.mult ?? 0),
        buryNewSiblings: Boolean(source.new?.bury),
        buryReviewSiblings: Boolean(source.rev?.bury),
        buryInterdayLearningSiblings: Boolean(source.buryInterdayLearning),
        showTimer: Boolean(source.timer),
        maxAnswerSecs: Number(source.maxTaken ?? 60),
        newCardGatherOrder: 'ascendingPosition',
        newCardSortOrder: 'template',
        newReviewOrder: 'mix',
        reviewSortOrder: 'dueRandom',
        autoPlayAudio: source.autoplay !== false,
        easyDays: [1, 1, 1, 1, 1, 1, 1],
        catalogPack: BKA_CATALOG_PACK,
    };
}

function assertSnapshot(snapshot: BkaCatalogSnapshot): void {
    const courseDecks = snapshot.decks.filter((deck) => deck.name.split('::').length === 2);
    const topicDecks = snapshot.decks.filter((deck) => deck.name.split('::').length === 3);
    if (
        snapshot.notes.length !== BKA_CATALOG_EXPECTED.notes
        || snapshot.cards.length !== BKA_CATALOG_EXPECTED.cards
        || courseDecks.length !== BKA_CATALOG_EXPECTED.courseDecks
        || topicDecks.length !== BKA_CATALOG_EXPECTED.topicDecks
        || snapshot.noteTypes.length !== BKA_CATALOG_EXPECTED.noteTypes
    ) {
        throw new Error(
            `BKA paket bütünlüğü hatası: ${snapshot.notes.length} not, ${snapshot.cards.length} kart, `
            + `${courseDecks.length} ders destesi, ${topicDecks.length} konu destesi, `
            + `${snapshot.noteTypes.length} not türü. Koleksiyon değiştirilmedi.`,
        );
    }

    const deckIds = new Set(snapshot.decks.map((deck) => deck.id));
    const noteIds = new Set(snapshot.notes.map((note) => note.id));
    const noteTypeIds = new Set(snapshot.noteTypes.map((type) => type.id));
    const configIds = new Set(snapshot.deckConfigs.map((config) => config.id));
    if (snapshot.cards.some((card) => !deckIds.has(card.deckId) || !noteIds.has(card.noteId))) {
        throw new Error('BKA paketinde destesi veya notu bulunmayan kart var. Koleksiyon değiştirilmedi.');
    }
    if (snapshot.notes.some((note) => !noteTypeIds.has(note.noteTypeId))) {
        throw new Error('BKA paketinde not türü bulunmayan not var. Koleksiyon değiştirilmedi.');
    }
    if (snapshot.decks.some((deck) => !configIds.has(deck.configId))) {
        throw new Error('BKA paketinde deste ayarı bulunmayan deste var. Koleksiyon değiştirilmedi.');
    }
}

/**
 * Read the package into the app's own model. The 12 source course decks keep their Anki ids and
 * are re-parented under a single root deck so the whole catalog can be presented — and locked —
 * as one purchasable item in the deck list.
 */
export function readBkaCatalog(
    reader: SqliteReader,
    rootDeckName: string = BKA_CATALOG_DEFAULT_ROOT_DECK,
): BkaCatalogSnapshot {
    const col = reader.getFirstSync<SourceCol>('SELECT models, decks, dconf FROM col LIMIT 1');
    if (!col) throw new Error('BKA paketinde koleksiyon üst bilgisi bulunamadı.');

    const noteTypes = Object.values(parseJsonMap<SourceModel>(col.models, 'not türü'))
        .map(mapNoteType)
        .sort((left, right) => left.id - right.id);

    // Source deck-config ids start at 1, which is also the app's default preset. Catalog presets
    // get their own id space so installing paid content can never rewrite the learner's defaults.
    const sourceConfigs = Object.values(parseJsonMap<SourceDeckConfig>(col.dconf, 'deste ayarı'))
        .sort((left, right) => Number(left.id) - Number(right.id));
    const configIdBySourceId = new Map<number, number>();
    const deckConfigs = sourceConfigs.map((config, index) => {
        const catalogId = DECK_CONFIG_ID_BASE + index;
        configIdBySourceId.set(Number(config.id), catalogId);
        return mapDeckConfig(config, catalogId, rootDeckName);
    });
    const defaultConfigId = deckConfigs[0]?.id ?? DECK_CONFIG_ID_BASE;

    const sourceDecks = Object.values(parseJsonMap<SourceDeck>(col.decks, 'deste'))
        .filter((deck) => Number(deck.id) !== 1 && deck.name !== 'Default')
        .sort((left, right) => Number(left.id) - Number(right.id));

    const rootDeck: Deck = {
        id: BKA_CATALOG_ROOT_DECK_ID,
        name: rootDeckName,
        sortOrder: 0,
        configId: defaultConfigId,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
        description: '',
        collapsed: true,
        isFiltered: false,
        catalogPack: BKA_CATALOG_PACK,
    };

    const courseDecks: Deck[] = sourceDecks.map((deck, index) => ({
        id: Number(deck.id),
        name: `${rootDeckName}::${String(deck.name).replace(/\s+BKA$/, '')}`,
        sortOrder: index,
        configId: configIdBySourceId.get(Number(deck.conf ?? 1)) ?? defaultConfigId,
        mod: Number(deck.mod ?? 0),
        usn: Number(deck.usn ?? -1),
        description: deck.desc ?? '',
        // Over a hundred curated children exist; the deck list opens on the 12 courses and the
        // learner expands only the one they need.
        collapsed: true,
        isFiltered: false,
        catalogPack: BKA_CATALOG_PACK,
    }));

    const subjects: UserSubject[] = sourceDecks.map((deck) => {
        const course = BKA_MANIFEST.courses.find((entry) => entry.sourceDeckId === Number(deck.id));
        return {
            id: course?.id ?? slugifyDeck(deck.name),
            name: String(deck.name).replace(/\s+BKA$/, ''),
            icon: course?.icon ?? '📘',
            topics: getBkaTopicNames(deck.name),
            deckId: Number(deck.id),
            isCustom: true as const,
        };
    });

    const sourceDeckIdByNoteId = new Map(
        reader.getAllSync<{ nid: number; did: number }>('SELECT nid, MIN(did) AS did FROM cards GROUP BY nid')
            .map((row) => [Number(row.nid), Number(row.did)]),
    );
    const sourceDeckById = new Map(sourceDecks.map((deck) => [Number(deck.id), deck]));
    const subjectByDeckId = new Map(subjects.map((subject) => [subject.deckId, subject]));
    const subdeckIdByKey = new Map<string, number>();
    const subdecks: Deck[] = [];
    courseDecks.forEach((course, courseIndex) => {
        const sourceName = sourceDeckById.get(course.id)?.name ?? course.name;
        getBkaTopicNames(sourceName).forEach((topic, topicIndex) => {
            const id = SUBDECK_ID_BASE + courseIndex * 1000 + topicIndex + 1;
            subdeckIdByKey.set(`${course.id}\x1f${topic}`, id);
            subdecks.push({
                id,
                name: `${course.name}::${topic}`,
                sortOrder: topicIndex,
                configId: course.configId,
                mod: course.mod,
                usn: course.usn,
                description: '',
                collapsed: false,
                isFiltered: false,
                catalogPack: BKA_CATALOG_PACK,
            });
        });
    });

    const notes: Note[] = reader.getAllSync<SourceNote>(
        'SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags FROM notes ORDER BY id',
    ).map((row) => {
        const fields = (row.flds ?? '').split('\x1f');
        const tags = splitAnkiTags(row.tags ?? '');
        const sourceDeckId = sourceDeckIdByNoteId.get(Number(row.id));
        const sourceDeck = sourceDeckId === undefined ? undefined : sourceDeckById.get(sourceDeckId);
        const subject = sourceDeckId === undefined ? undefined : subjectByDeckId.get(sourceDeckId);
        if (!sourceDeck || !subject) throw new Error(`BKA notu için kök deste bulunamadı: ${row.id}`);
        // An author label becomes a subdeck; a note they left unlabeled is placed by the subject
        // terms in its own text. A note that matches neither keeps the course deck the source put
        // it in and is only marked as ungrouped for the sidebar's course/topic filter.
        const topic = classifyBkaTopic(sourceDeck.name, tags, fields.join(' '));
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
            catalogTopic: topic ?? BKA_UNGROUPED_TOPIC,
            catalogPack: BKA_CATALOG_PACK,
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
        if (!note) throw new Error(`BKA kartının notu bulunamadı: ${row.id}`);
        const topic = note.catalogTopic;
        // Labeled notes go to their subdeck; the rest stay in the course deck, as in the source.
        const deckId = topic === BKA_UNGROUPED_TOPIC
            ? sourceDeckId
            : subdeckIdByKey.get(`${sourceDeckId}\x1f${topic}`);
        if (deckId === undefined) throw new Error(`BKA kartı alt deste ile eşleştirilemedi: ${row.id}`);
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

    const usedDeckIds = new Set(cards.map((card) => card.deckId));
    const usedSubdecks = subdecks.filter((deck) => usedDeckIds.has(deck.id));
    const usedCourseDeckIds = new Set(cards.map((card) => card.sourceDeckId));
    const usedCourseDecks = courseDecks.filter((deck) => usedCourseDeckIds.has(deck.id));
    for (const subject of subjects) {
        const usedTopics = new Set(notes
            .filter((note) => note.catalogSubject === subject.id)
            .map((note) => note.catalogTopic));
        // The sidebar filters by course/topic, so the ungrouped bucket belongs in the list even
        // though it never becomes a deck.
        subject.topics = [...subject.topics.filter((topic) => usedTopics.has(topic))];
        if (usedTopics.has(BKA_UNGROUPED_TOPIC)) subject.topics.push(BKA_UNGROUPED_TOPIC);
    }
    const snapshot: BkaCatalogSnapshot = {
        rootDeckName,
        noteTypes,
        decks: [rootDeck, ...usedCourseDecks, ...usedSubdecks],
        deckConfigs,
        notes,
        cards,
        subjects,
    };
    assertSnapshot(snapshot);
    return snapshot;
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

/**
 * Build the locked preview in the catalog's real hierarchy: BKA TUS → course → topic. Every
 * physical card bucket contributes up to 30 cards. Some author subtopics contain fewer than 30
 * cards; those expose everything they have rather than duplicating questions.
 */
export function buildBkaTrialCatalog(
    full: BkaCatalogSnapshot,
    trialRootName: string = BKA_TRIAL_DEFAULT_ROOT_DECK,
): BkaCatalogSnapshot {
    const root = full.decks.find((deck) => deck.name === full.rootDeckName);
    if (!root) throw new Error('BKA deneme kök destesi oluşturulamadı.');

    const cardsByDeck = new Map<number, AnkiCard[]>();
    for (const card of full.cards) {
        const bucket = cardsByDeck.get(card.deckId) ?? [];
        bucket.push(card);
        cardsByDeck.set(card.deckId, bucket);
    }

    const notesById = new Map(full.notes.map((note) => [note.id, note]));
    const noteTypesById = new Map(full.noteTypes.map((noteType) => [noteType.id, noteType]));
    const selectedCards = [...cardsByDeck.values()].flatMap((cards) => {
        const ranked = cards.map((card) => {
            const note = notesById.get(card.noteId);
            return {
                card,
                score: note
                    ? scoreBkaTrialCard(card, note, noteTypesById.get(note.noteTypeId))
                    : Number.NEGATIVE_INFINITY,
            };
        }).sort((left, right) => right.score - left.score || left.card.id - right.card.id)
            .map((entry) => entry.card);

        // Prefer breadth: take the highest-quality card from each note before allowing a second
        // cloze/reverse sibling from the same note into the sample.
        const selected: AnkiCard[] = [];
        const selectedIds = new Set<number>();
        const usedNoteIds = new Set<number>();
        for (const card of ranked) {
            if (usedNoteIds.has(card.noteId)) continue;
            selected.push(card);
            selectedIds.add(card.id);
            usedNoteIds.add(card.noteId);
            if (selected.length === BKA_TRIAL_CARDS_PER_SUBDECK) return selected;
        }
        for (const card of ranked) {
            if (selectedIds.has(card.id)) continue;
            selected.push(card);
            if (selected.length === BKA_TRIAL_CARDS_PER_SUBDECK) break;
        }
        return selected;
    });
    const selectedNoteIds = new Set(selectedCards.map((card) => card.noteId));
    return {
        ...full,
        rootDeckName: trialRootName,
        // The preview is a separate, ordinary deck tree — not a wrapper inside the paid BKA TUS
        // tree. Renaming only the root prefix preserves every real course/topic relationship.
        decks: full.decks.map((deck) => ({
            ...deck,
            name: deck.name === full.rootDeckName
                ? trialRootName
                : `${trialRootName}${deck.name.slice(full.rootDeckName.length)}`,
            ...(deck.id === root.id ? { collapsed: false, sortOrder: -1 } : {}),
        })),
        notes: full.notes.filter((note) => selectedNoteIds.has(note.id)),
        cards: selectedCards,
    };
}

/** A deterministic editorial-quality heuristic for choosing preview cards from the package. */
export function scoreBkaTrialCard(card: AnkiCard, note: Note, noteType?: NoteType): number {
    const fields = note.fields.map((field) => humanizeCardText(field));
    const primary = fields[0] ?? '';
    const secondary = fields.slice(1).join(' ').trim();
    const isCloze = noteType?.kind === 'cloze' || /\{\{c\d+::/i.test(note.fields[0] ?? '');
    const hasMedia = note.fields.some((field) => /\[sound:[^\]]+\]|<(?:img|audio|video)\b/i.test(field));

    let score = 0;
    // A useful prompt needs enough context, without becoming an unedited wall of text.
    if (primary.length >= 24) score += 45;
    else score += primary.length - 30;
    if (primary.length >= 60 && primary.length <= 900) score += 25;
    if (primary.length > 1800) score -= Math.min(60, Math.floor((primary.length - 1800) / 80));
    if (/[?.!:;]/.test(primary)) score += 6;

    if (isCloze) {
        // A cloze card is only valid when its own ordinal has a matching deletion marker.
        const marker = new RegExp(`\\{\\{c${card.ord + 1}::`, 'i');
        score += marker.test(note.fields[0] ?? '') ? 55 : -120;
        if (secondary.length >= 8) score += 8;
    } else {
        // Basic cards need an actual answer; richer but still readable answers rank higher.
        if (secondary.length >= 6) score += 55;
        else score += secondary.length - 45;
        if (secondary.length >= 24 && secondary.length <= 1200) score += 18;
        if (secondary.length > 2400) score -= 30;
    }

    if (hasMedia) score += 8;
    score += Math.min(6, note.tags.length);
    return score;
}
