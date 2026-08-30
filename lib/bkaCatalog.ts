/**
 * Install and remove the bundled BKA TUS catalog.
 *
 * The catalog is paid content inside an otherwise free Anki-style app, so installation is
 * strictly additive: the learner's own decks, notes, note types and review history are never
 * touched. Card fields, ordinals, templates, CSS and media come from the source Anki package
 * unchanged; only the deck path is re-parented under one lockable root deck.
 *
 * Access is granted by `lib/catalogPurchases.ts`. This module never decides entitlement — it
 * only makes the physical collection match the decision it is handed.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import type JSZipType from 'jszip';
import { getDB } from './db';
import { getLegacyFileSystem, readUriBytes } from './files';
import {
    extractCollectionFromZip,
    importMediaFromZip,
    loadAnkiZip,
    openAnkiReader,
    type SqliteReader,
} from './importApkg';
import { checksumField, type AnkiCard, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import type { UserSubject } from './subjects';
import { BKA_UNGROUPED_TOPIC, classifyBkaTopic, getBkaTopicNames } from './bkaTaxonomy';
import {
    CATALOG_PACK_ID,
    CATALOG_INSTALL_KEY,
    CATALOG_PROGRESS_KEY,
    applyCatalogProgress,
    encodeCatalogProgress,
    hasStudyProgress,
    parseCatalogProgress,
    type CatalogProgress,
} from './catalogRows';
import { requireBkaCatalogAsset } from './bkaCatalogAsset';
import { BKA_MANIFEST } from './bkaManifest';
import { humanizeCardText } from './displayText';

/** Marks every row this module owns, so removal can never reach the learner's own content. */
export const BKA_CATALOG_PACK = CATALOG_PACK_ID;
export const BKA_CATALOG_DEFAULT_ROOT_DECK = 'TUS Kartları';
export const BKA_TRIAL_DEFAULT_ROOT_DECK = 'TUS Deneme';
export const BKA_CATALOG_INSTALL_KEY = CATALOG_INSTALL_KEY;
export const BKA_TRIAL_CARDS_PER_SUBDECK = 30;
export type BkaCatalogTier = 'trial' | 'full';
const ROOT_DECK_NAME_KEY = 'bka_tus_catalog_root_deck_v5';
const SEPARATE_TRIAL_LAYOUT_KEY = 'bka_tus_separate_trial_deck_v1';
/**
 * Hash of the package the installed cards came from. A content correction ships as a new
 * package, and a learner who already installed the old one has to end up with the corrected
 * text — without this marker the installer sees "already installed" and never refreshes.
 */
const PACKAGE_VERSION_KEY = 'bka_tus_catalog_package_v1';
const PROGRESS_KEY = CATALOG_PROGRESS_KEY;
/** Pre-release builds replaced the whole collection with a trial tier; see removeLegacyBkaInstall. */
const LEGACY_TIER_KEY = 'bka_tus_catalog_tier_v4';

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

export interface BkaCatalogInstallResult {
    installed: boolean;
    rootDeckName: string;
    notes: number;
    cards: number;
    decks: number;
    noteTypes: number;
    media: number;
    /** Cards whose scheduling state was carried over from an earlier install. */
    restoredProgress: number;
}

export interface BkaCatalogRemovalResult {
    removed: boolean;
    notes: number;
    cards: number;
    decks: number;
    /** Cards whose scheduling state was stashed for a future reinstall. */
    storedProgress: number;
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

// ---- Installed-state helpers -------------------------------------------------------------

function readSetting(key: string): string | null {
    try {
        return getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
    } catch {
        // Access can be queried before SQLite startup in isolated tests; treat that as "not installed".
        return null;
    }
}

function writeSetting(key: string, value: string): void {
    getDB().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export function getBkaCatalogTier(): BkaCatalogTier | null {
    const value = readSetting(BKA_CATALOG_INSTALL_KEY);
    // Builds before the trial tier stored a boolean marker after installing the paid catalog.
    if (value === 'true') return 'full';
    return value === 'trial' || value === 'full' ? value : null;
}

export function isBkaCatalogInstalled(): boolean {
    return getBkaCatalogTier() !== null;
}

/** Deck path the installed catalog lives under; also used to build a collision-free name. */
export function getBkaCatalogRootDeckName(): string {
    try {
        const root = getDB().getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', BKA_CATALOG_ROOT_DECK_ID);
        if (root?.data) {
            const deck = JSON.parse(root.data) as Deck;
            if (isCatalogRow(deck) && deck.name) return deck.name;
        }
    } catch { /* fall through to the persisted install name */ }
    return readSetting(ROOT_DECK_NAME_KEY) ?? BKA_CATALOG_DEFAULT_ROOT_DECK;
}

function parseRows<T>(table: 'note_types' | 'decks' | 'deck_configs' | 'notes'): Array<{ id: number; value: T }> {
    return getDB().getAllSync<{ id: number; data: string }>(`SELECT id, data FROM ${table}`).flatMap((row) => {
        try { return [{ id: Number(row.id), value: JSON.parse(row.data) as T }]; } catch { return []; }
    });
}

function isCatalogRow(value: { catalogPack?: string } | null | undefined): boolean {
    return value?.catalogPack === BKA_CATALOG_PACK;
}

/** SQLite caps bound parameters per statement, so id lists are deleted in chunks. */
function deleteByIds(sql: string, ids: Array<number | string>): void {
    for (let index = 0; index < ids.length; index += 400) {
        const chunk = ids.slice(index, index + 400);
        getDB().runSync(`${sql} (${chunk.map(() => '?').join(',')})`, ...chunk);
    }
}

/** A root deck name the learner's own collection does not already use. */
function chooseRootDeckName(): string {
    const takenByLearner = new Set(
        parseRows<Deck>('decks')
            .filter((row) => !isCatalogRow(row.value))
            .map((row) => row.value.name.split('::')[0]),
    );
    let candidate = BKA_CATALOG_DEFAULT_ROOT_DECK;
    let suffix = 2;
    while (takenByLearner.has(candidate)) candidate = `${BKA_CATALOG_DEFAULT_ROOT_DECK} ${suffix++}`;
    return candidate;
}

function chooseTrialRootDeckName(): string {
    const takenByLearner = new Set(
        parseRows<Deck>('decks')
            .filter((row) => !isCatalogRow(row.value))
            .map((row) => row.value.name.split('::')[0]),
    );
    let candidate = BKA_TRIAL_DEFAULT_ROOT_DECK;
    let suffix = 2;
    while (takenByLearner.has(candidate)) candidate = `${BKA_TRIAL_DEFAULT_ROOT_DECK} ${suffix++}`;
    return candidate;
}

function stashCatalogProgress(cardIds: Set<number>): number {
    // Progress stashed by an earlier removal is kept: a learner can lose access, study their own
    // cards for a month, restore the purchase, and still find both sets of scheduling intact.
    const progress: CatalogProgress = { ...readStashedProgress() };
    for (const row of getDB().getAllSync<{ id: number; data: string }>('SELECT id, data FROM anki_cards')) {
        const id = Number(row.id);
        if (!cardIds.has(id)) continue;
        let card: AnkiCard;
        try { card = JSON.parse(row.data) as AnkiCard; } catch { continue; }
        // Untouched cards reinstall identically from the package; only real study state is worth keeping.
        if (!hasStudyProgress(card)) continue;
        progress[String(id)] = encodeCatalogProgress(card);
    }
    const count = Object.keys(progress).length;
    if (count === 0) getDB().runSync('DELETE FROM settings WHERE key = ?', PROGRESS_KEY);
    else writeSetting(PROGRESS_KEY, JSON.stringify(progress));
    return count;
}

function readStashedProgress(): CatalogProgress {
    return parseCatalogProgress(readSetting(PROGRESS_KEY));
}

function readStoredSubjects(): UserSubject[] {
    const raw = readSetting('user_subjects_v1');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed as UserSubject[] : [];
    } catch {
        return [];
    }
}

/** Drop every catalog course from the shared subject registry, keeping the learner's own. */
function removeCatalogSubjects(): void {
    writeSetting(
        'user_subjects_v1',
        JSON.stringify(readStoredSubjects().filter((subject) => subject?.id && !subject.id.startsWith('bka-'))),
    );
}

/** Replace the catalog's course entries in the shared subject registry, keeping the learner's own. */
function writeCatalogSubjects(catalogSubjects: UserSubject[]): void {
    const catalogIds = new Set(catalogSubjects.map((subject) => subject.id));
    const learnerSubjects = readStoredSubjects().filter((subject) => subject?.id && !catalogIds.has(subject.id));
    writeSetting('user_subjects_v1', JSON.stringify([...learnerSubjects, ...catalogSubjects]));
}

async function loadBundledPackage(): Promise<{ zip: JSZipType; cachedUri: string | null }> {
    const asset = Asset.fromModule(requireBkaCatalogAsset());
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('BKA katalog varlığı indirilemedi.');
    return { zip: await loadAnkiZip(await readUriBytes(uri)), cachedUri: uri };
}

/**
 * expo-asset stages the 9 MB package into the cache directory to read it. Once the cards are in
 * the collection that copy is dead weight, so it is dropped — but only if it really is the cache
 * copy: the same call can hand back a path inside the read-only app bundle.
 */
async function dropCachedPackageCopy(uri: string | null): Promise<void> {
    if (!uri || Platform.OS === 'web') return;
    try {
        const fs = getLegacyFileSystem();
        const cacheDirectory = fs.cacheDirectory;
        if (!cacheDirectory || !uri.startsWith(cacheDirectory)) return;
        await fs.deleteAsync(uri, { idempotent: true });
    } catch (error) {
        // A leftover cache file costs disk, never correctness: iOS purges it under pressure.
        console.warn('[BKA] Önbellek kopyası silinemedi:', error);
    }
}

/**
 * Reclaim the space a bulk install or removal leaves behind. Writing (or deleting) ~17.000 rows
 * grows the write-ahead log past 11 MB and leaves free pages in the database file; without this
 * the app keeps both long after the work is done.
 */
function compactDatabase(): void {
    if (Platform.OS === 'web') return;
    try {
        const db = getDB();
        db.execSync('PRAGMA wal_checkpoint(TRUNCATE);');
        db.execSync('VACUUM;');
    } catch (error) {
        console.warn('[BKA] Veritabanı sıkıştırılamadı:', error);
    }
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

function writeCatalog(snapshot: BkaCatalogSnapshot): { restoredProgress: number } {
    const db = getDB();
    const now = Date.now();
    const stashed = readStashedProgress();
    let restoredProgress = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const config of snapshot.deckConfigs) {
            db.runSync('INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
        }
        for (const deck of snapshot.decks) {
            db.runSync(
                `INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                deck.id, deck.name, JSON.stringify(deck), now, deck.usn,
            );
        }
        for (const noteType of snapshot.noteTypes) {
            db.runSync(
                `INSERT OR REPLACE INTO note_types (id, name, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, -1, 0)`,
                noteType.id, noteType.name, JSON.stringify(noteType), now,
            );
        }
        for (const note of snapshot.notes) {
            db.runSync(
                `INSERT OR REPLACE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
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
            const stored = stashed[String(sourceCard.id)];
            if (stored) restoredProgress++;
            const card = applyCatalogProgress(sourceCard, stored);
            db.runSync(
                `INSERT OR REPLACE INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
                  data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due,
                card.ivl, card.factor, card.reps, card.lapses, card.left, card.flags,
                JSON.stringify(card), now, now, card.usn,
            );
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return { restoredProgress };
}

function assertInstalledDatabase(snapshot: BkaCatalogSnapshot): void {
    const db = getDB();
    const noteIds = new Set(snapshot.notes.map((note) => note.id));
    const cardIds = new Set(snapshot.cards.map((card) => card.id));
    const storedNotes = db.getAllSync<{ id: number }>('SELECT id FROM notes').filter((row) => noteIds.has(Number(row.id))).length;
    const storedCards = db.getAllSync<{ id: number }>('SELECT id FROM anki_cards').filter((row) => cardIds.has(Number(row.id))).length;
    if (storedNotes !== snapshot.notes.length || storedCards !== snapshot.cards.length) {
        throw new Error(
            `BKA kurulum sonrası bütünlük hatası: ${storedNotes}/${snapshot.notes.length} not, `
            + `${storedCards}/${snapshot.cards.length} kart. Kurulum yeniden denenecek.`,
        );
    }
}

/**
 * Add the full catalog to the collection. Safe to call repeatedly: an already-installed catalog
 * returns immediately, and a failed attempt leaves the learner's collection exactly as it was.
 */
async function installBkaCatalogTier(tier: BkaCatalogTier): Promise<BkaCatalogInstallResult> {
    const currentTier = getBkaCatalogTier();
    const installedCards = getInstalledBkaCardCount();
    const rootDeckName = getBkaCatalogRootDeckName();
    const hasLegacyTrialWrapper = tier === 'trial' && parseRows<Deck>('decks').some((row) => (
        isCatalogRow(row.value) && row.value.name === `${rootDeckName}::Deneme`
    ));
    const hasSeparateTrialLayout = tier !== 'trial' || readSetting(SEPARATE_TRIAL_LAYOUT_KEY) === 'true';
    // Cards installed from an older package are refreshed rather than left in place. The
    // reinstall below stashes and restores study progress, so a correction costs the learner
    // nothing but the seconds it takes to write the collection.
    const hasCurrentPackage = readSetting(PACKAGE_VERSION_KEY) === BKA_MANIFEST.sha256;
    if (currentTier === tier && installedCards > 0 && !hasLegacyTrialWrapper && hasSeparateTrialLayout
        && hasCurrentPackage) {
        return {
            installed: false,
            rootDeckName: getBkaCatalogRootDeckName(),
            notes: tier === 'full' ? BKA_CATALOG_EXPECTED.notes : 0,
            cards: installedCards,
            decks: parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value)).length,
            noteTypes: BKA_CATALOG_EXPECTED.noteTypes,
            media: BKA_CATALOG_EXPECTED.media,
            restoredProgress: 0,
        };
    }

    // Tier replacement removes only catalog-marked rows and stashes scheduling progress. User
    // decks remain untouched, and matching card ids recover their progress in the new tier.
    if (currentTier !== null || parseRows<Deck>('decks').some((row) => isCatalogRow(row.value))) {
        uninstallBkaCatalog();
    }

    // Installation is the first thing a buyer sees after paying, so each phase is timed and
    // reported once: a support question about a slow install has an answer in the log.
    const startedAt = Date.now();
    const { zip, cachedUri } = await loadBundledPackage();
    const collectionBytes = await extractCollectionFromZip(zip);
    const reader = await openAnkiReader(collectionBytes);
    let snapshot: BkaCatalogSnapshot;
    try {
        const full = readBkaCatalog(reader, chooseRootDeckName());
        snapshot = tier === 'full' ? full : buildBkaTrialCatalog(full, chooseTrialRootDeckName());
    } finally {
        reader.close();
    }
    const parsedAt = Date.now();

    // Media is validated and written before the database transaction: a half-copied media
    // store must never end up referenced by installed cards.
    const media = await importMediaFromZip(zip);
    if (media.imported !== BKA_CATALOG_EXPECTED.media || media.skipped !== 0) {
        throw new Error(
            `BKA medya bütünlüğü hatası: ${media.imported}/${BKA_CATALOG_EXPECTED.media} aktarıldı, `
            + `${media.skipped} atlandı. Koleksiyon değiştirilmedi.`,
        );
    }

    const mediaAt = Date.now();

    const { restoredProgress } = writeCatalog(snapshot);
    const writtenAt = Date.now();
    assertInstalledDatabase(snapshot);
    writeCatalogSubjects(snapshot.subjects);
    writeSetting(ROOT_DECK_NAME_KEY, snapshot.rootDeckName);
    writeSetting(BKA_CATALOG_INSTALL_KEY, tier);
    writeSetting(PACKAGE_VERSION_KEY, BKA_MANIFEST.sha256);
    if (tier === 'trial') writeSetting(SEPARATE_TRIAL_LAYOUT_KEY, 'true');
    else {
        getDB().runSync('DELETE FROM settings WHERE key = ?', PROGRESS_KEY);
        getDB().runSync('DELETE FROM settings WHERE key = ?', SEPARATE_TRIAL_LAYOUT_KEY);
    }

    console.log(
        `[BKA] ${tier === 'full' ? 'Tam katalog' : 'Deneme'} kuruldu: ${snapshot.cards.length} kart, ${Math.round((Date.now() - startedAt) / 100) / 10}s `
        + `(paket ${Math.round((parsedAt - startedAt) / 100) / 10}s, medya ${Math.round((mediaAt - parsedAt) / 100) / 10}s, `
        + `veritabanı ${Math.round((writtenAt - mediaAt) / 100) / 10}s)`,
    );

    return {
        installed: true,
        rootDeckName: snapshot.rootDeckName,
        notes: snapshot.notes.length,
        cards: snapshot.cards.length,
        decks: snapshot.decks.length,
        noteTypes: snapshot.noteTypes.length,
        media: media.imported,
        restoredProgress,
    };
}

export async function installBkaCatalog(): Promise<BkaCatalogInstallResult> {
    return installBkaCatalogTier('full');
}

export async function installBkaTrialCatalog(): Promise<BkaCatalogInstallResult> {
    return installBkaCatalogTier('trial');
}

let catalogTierFlight: { tier: BkaCatalogTier; promise: Promise<BkaCatalogInstallResult> } | null = null;

/**
 * Make physical catalog content match the verified entitlement without touching user decks.
 * React development remounts and overlapping entitlement refresh/purchase calls can otherwise
 * start two package installs against the same SQLite connection. Coalesce an identical request,
 * and serialize a different tier behind the operation already in progress.
 */
export function ensureBkaCatalogTier(tier: BkaCatalogTier): Promise<BkaCatalogInstallResult> {
    if (catalogTierFlight?.tier === tier) return catalogTierFlight.promise;
    if (catalogTierFlight) {
        return catalogTierFlight.promise.then(
            () => ensureBkaCatalogTier(tier),
            () => ensureBkaCatalogTier(tier),
        );
    }

    const promise = tier === 'full' ? installBkaCatalog() : installBkaTrialCatalog();
    const flight = { tier, promise };
    catalogTierFlight = flight;
    void promise.then(
        () => { if (catalogTierFlight === flight) catalogTierFlight = null; },
        () => { if (catalogTierFlight === flight) catalogTierFlight = null; },
    );
    return promise;
}

/**
 * Remove catalog content when the store reports the entitlement is gone (refund, family sharing
 * change, a different Apple ID). Only rows this module installed are touched, and the learner's
 * scheduling progress on those cards is stashed so a restore brings it back.
 */
export function uninstallBkaCatalog(): BkaCatalogRemovalResult {
    const db = getDB();
    const catalogNotes = parseRows<Note>('notes').filter((row) => isCatalogRow(row.value));
    const catalogDecks = parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value));
    const catalogConfigs = parseRows<DeckConfig>('deck_configs').filter((row) => isCatalogRow(row.value));
    const catalogNoteTypes = parseRows<NoteType>('note_types').filter((row) => isCatalogRow(row.value));
    const noteIds = new Set(catalogNotes.map((row) => row.id));
    const catalogDeckIds = new Set(catalogDecks.map((row) => row.id));
    const catalogCardIds = new Set(
        db.getAllSync<{ id: number; noteId: number }>('SELECT id, noteId FROM anki_cards')
            .filter((row) => noteIds.has(Number(row.noteId)))
            .map((row) => Number(row.id)),
    );

    if (noteIds.size === 0 && catalogDecks.length === 0) {
        db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
        db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
        return { removed: false, notes: 0, cards: 0, decks: 0, storedProgress: 0 };
    }

    const storedProgress = stashCatalogProgress(catalogCardIds);

    // A purchased deck behaves normally, so a learner may have moved their own cards into it.
    // Revoking the catalog must never delete or orphan those cards: move them to an existing
    // learner-owned deck before removing the protected tree.
    const learnerDecks = parseRows<Deck>('decks')
        .filter((row) => !isCatalogRow(row.value))
        .sort((left, right) => left.value.name === 'Default' ? -1 : right.value.name === 'Default' ? 1 : left.id - right.id);
    const fallbackDeck: Deck = learnerDecks[0]?.value ?? {
        id: 1,
        name: 'Kurtarılan Kartlar',
        configId: 1,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: false,
    };
    const learnerCardsInCatalogDecks = db.getAllSync<{ id: number; noteId: number; deckId: number; data: string }>(
        'SELECT id, noteId, deckId, data FROM anki_cards',
    ).filter((row) => catalogDeckIds.has(Number(row.deckId)) && !noteIds.has(Number(row.noteId)));

    db.execSync('BEGIN TRANSACTION;');
    try {
        if (!learnerDecks.length && learnerCardsInCatalogDecks.length > 0) {
            db.runSync(
                'INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
                fallbackDeck.id, fallbackDeck.name, JSON.stringify(fallbackDeck), Date.now(),
            );
        }
        for (const row of learnerCardsInCatalogDecks) {
            try {
                const card = { ...(JSON.parse(row.data) as AnkiCard), deckId: fallbackDeck.id, mod: Math.floor(Date.now() / 1000), usn: -1 };
                db.runSync('UPDATE anki_cards SET deckId = ?, data = ?, updated_at = ?, usn = -1 WHERE id = ?',
                    fallbackDeck.id, JSON.stringify(card), Date.now(), row.id);
            } catch {
                // Preserve even a malformed learner row; the normalized column is enough to keep
                // it out of the catalog-deck deletion and later repair tools can rebuild the blob.
                db.runSync('UPDATE anki_cards SET deckId = ?, updated_at = ?, usn = -1 WHERE id = ?',
                    fallbackDeck.id, Date.now(), row.id);
            }
        }
        const cardIds = [...catalogCardIds];
        deleteByIds('DELETE FROM anki_cards WHERE id IN', cardIds);
        // cards_fts.card_id is TEXT, so it must be matched with string ids, not numbers.
        deleteByIds('DELETE FROM cards_fts WHERE card_id IN', cardIds.map(String));
        deleteByIds('DELETE FROM notes WHERE id IN', [...noteIds]);
        deleteByIds('DELETE FROM decks WHERE id IN', catalogDecks.map((row) => row.id));
        const referencedConfigIds = new Set(
            parseRows<Deck>('decks')
                .filter((row) => !catalogDeckIds.has(row.id))
                .map((row) => Number(row.value.configId)),
        );
        deleteByIds(
            'DELETE FROM deck_configs WHERE id IN',
            catalogConfigs.map((row) => row.id).filter((id) => !referencedConfigIds.has(id)),
        );
        // Note types are only removed when nothing else references them; a learner may have
        // authored their own notes on the AnKing cloze type while the catalog was unlocked.
        const referenced = new Set(
            db.getAllSync<{ noteTypeId: number }>('SELECT DISTINCT noteTypeId FROM notes').map((row) => Number(row.noteTypeId)),
        );
        deleteByIds(
            'DELETE FROM note_types WHERE id IN',
            catalogNoteTypes.map((row) => row.id).filter((id) => !referenced.has(id)),
        );
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    removeCatalogSubjects();
    db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', ROOT_DECK_NAME_KEY);
    compactDatabase();

    return {
        removed: true,
        notes: noteIds.size,
        cards: catalogCardIds.size,
        decks: catalogDecks.length,
        storedProgress,
    };
}

/**
 * Pre-release builds installed a 1,200-card trial by replacing the whole collection. That model
 * was dropped before launch: the app ships as a free Anki client and the catalog is purchased
 * content. Devices still carrying that state get those rows removed on the next launch.
 *
 * Legacy rows predate the `catalogPack` marker, so they are matched the way that build wrote
 * them: notes carry a `bka-` course id, decks end in "BKA" or sit under one. Review progress on
 * the trial cards is stashed, so a later purchase restores it card for card.
 */
export function removeLegacyBkaInstall(): boolean {
    const db = getDB();
    if (readSetting(LEGACY_TIER_KEY) === null) return false;

    const legacyNoteIds = new Set(
        parseRows<Note>('notes')
            .filter((row) => row.value.catalogSubject?.startsWith('bka-') || isCatalogRow(row.value))
            .map((row) => row.id),
    );
    const legacyDeckIds = parseRows<Deck>('decks')
        .filter((row) => /(^|::)[^:]*\bBKA\b/.test(row.value.name) || isCatalogRow(row.value))
        .map((row) => row.id);
    const legacyCardIds = db.getAllSync<{ id: number; noteId: number }>('SELECT id, noteId FROM anki_cards')
        .filter((row) => legacyNoteIds.has(Number(row.noteId)))
        .map((row) => Number(row.id));

    stashCatalogProgress(new Set(legacyCardIds));

    db.execSync('BEGIN TRANSACTION;');
    try {
        deleteByIds('DELETE FROM anki_cards WHERE id IN', legacyCardIds);
        deleteByIds('DELETE FROM cards_fts WHERE card_id IN', legacyCardIds.map(String));
        deleteByIds('DELETE FROM notes WHERE id IN', [...legacyNoteIds]);
        deleteByIds('DELETE FROM decks WHERE id IN', legacyDeckIds);
        const referenced = new Set(
            db.getAllSync<{ noteTypeId: number }>('SELECT DISTINCT noteTypeId FROM notes').map((row) => Number(row.noteTypeId)),
        );
        deleteByIds(
            'DELETE FROM note_types WHERE id IN',
            BKA_MANIFEST.noteTypes.map((noteType) => noteType.id).filter((id) => !referenced.has(id)),
        );
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    removeCatalogSubjects();
    db.runSync("DELETE FROM settings WHERE key LIKE 'bka_tus_%catalog%v4'");
    db.runSync('DELETE FROM settings WHERE key = ?', LEGACY_TIER_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', ROOT_DECK_NAME_KEY);
    return true;
}

/**
 * Cards still sitting in the catalog's own decks. A collection holds few deck rows, so the deck
 * ids are read from their JSON marker and the card count itself stays an indexed lookup.
 */
export function getInstalledBkaCardCount(): number {
    try {
        const deckIds = parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value)).map((row) => row.id);
        if (deckIds.length === 0) return 0;
        return getDB().getFirstSync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM anki_cards WHERE deckId IN (${deckIds.map(() => '?').join(',')})`,
            ...deckIds,
        )?.count ?? 0;
    } catch {
        return 0;
    }
}

/**
 * True when the entitlement is held but the cards are not on the device: a fresh device, or a
 * learner who deleted the deck after buying it. Either way the next reconciliation reinstalls.
 */
export function needsBkaCatalogInstall(): boolean {
    return getBkaCatalogTier() !== 'full'
        || getInstalledBkaCardCount() !== BKA_CATALOG_EXPECTED.cards;
}
