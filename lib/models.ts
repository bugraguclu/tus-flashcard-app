// Anki-compatible data models: notes, cards, note types, decks, deck config, revlog.

import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
} from './fsrs';
import type { AutoAdvanceAnswerAction, AutoAdvanceQuestionAction, NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from './types';

export type NoteTypeKind = 'standard' | 'cloze';

export interface NoteTypeField {
    name: string;
    ord: number;
    sticky: boolean;     // keep the value when adding the next card
    rtl: boolean;        // right-to-left text
}

export interface NoteTypeTemplate {
    name: string;
    ord: number;
    qfmt: string;        // question (front) template, mustache syntax
    afmt: string;        // answer (back) template
}

export interface NoteType {
    id: number;
    name: string;
    kind: NoteTypeKind;
    fields: NoteTypeField[];
    templates: NoteTypeTemplate[];
    css: string;
    sortFieldIdx: number;
    mod: number;
    /** Complete source model JSON for lossless Anki package re-export. */
    ankiRaw?: Record<string, unknown>;
    /** Package provenance; used to invalidate byte-identical passthrough after edits. */
    sourcePackageId?: string;
    /** Set on rows installed by a purchasable content pack (lib/bkaCatalog.ts). */
    catalogPack?: string;
}

/** Stable local ids for the stock note types that this editor fully supports. */
export const ANKI_STOCK_NOTE_TYPE_IDS = [1, 2, 7, 8, 3] as const;
export const LEGACY_TUS_NOTE_TYPE_IDS = [4, 5, 6] as const;

export function isLegacyTusNoteType(noteType: Pick<NoteType, 'id' | 'name'>): boolean {
    return LEGACY_TUS_NOTE_TYPE_IDS.includes(noteType.id as 4 | 5 | 6)
        || /^TUS (Tıp Kartı|Yazarak Cevapla|Çift Taraflı)$/.test(noteType.name);
}

export const BUILTIN_NOTE_TYPES: NoteType[] = [
    {
        id: 1,
        name: 'Basic',
        kind: 'standard',
        fields: [
            { name: 'Front', ord: 0, sticky: false, rtl: false },
            { name: 'Back', ord: 1, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Card 1',
                ord: 0,
                qfmt: '{{Front}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 2,
        name: 'Basic (and reversed card)',
        kind: 'standard',
        fields: [
            { name: 'Front', ord: 0, sticky: false, rtl: false },
            { name: 'Back', ord: 1, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Card 1',
                ord: 0,
                qfmt: '{{Front}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            },
            {
                name: 'Card 2',
                ord: 1,
                qfmt: '{{Back}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 7,
        name: 'Basic (optional reversed card)',
        kind: 'standard',
        fields: [
            { name: 'Front', ord: 0, sticky: false, rtl: false },
            { name: 'Back', ord: 1, sticky: false, rtl: false },
            { name: 'Add Reverse', ord: 2, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Card 1',
                ord: 0,
                qfmt: '{{Front}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            },
            {
                name: 'Card 2',
                ord: 1,
                qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 8,
        name: 'Basic (type in the answer)',
        kind: 'standard',
        fields: [
            { name: 'Front', ord: 0, sticky: false, rtl: false },
            { name: 'Back', ord: 1, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Card 1',
                ord: 0,
                qfmt: '{{Front}}\n\n{{type:Back}}',
                afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{type:Back}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 3,
        name: 'Cloze',
        kind: 'cloze',
        fields: [
            { name: 'Text', ord: 0, sticky: false, rtl: false },
            { name: 'Back Extra', ord: 1, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Cloze',
                ord: 0,
                qfmt: '{{cloze:Text}}',
                afmt: '{{cloze:Text}}<br>\n{{Back Extra}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }
.cloze { font-weight: bold; color: blue; }
.nightMode .cloze { color: lightblue; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
];

// Mirrors Anki's notes table. One note generates one or more cards.
export interface Note {
    id: number;          // epoch ms
    guid: string;        // stable identity across sync/import
    noteTypeId: number;
    mod: number;         // epoch seconds
    usn: number;         // update sequence number; -1 = needs sync
    tags: string[];
    fields: string[];    // values, in NoteType.fields order
    sfld: string;        // sort-field value
    csum: number;        // FNV-1a hash of the first field for dup detection (not Anki's SHA1 csum)
    flags: number;       // reserved; color flags live on the card (AnkiCard.flags)
    /** Anki's opaque notes.data column. */
    ankiData?: string;
    sourcePackageId?: string;
    /** Catalog navigation metadata. Source Anki tags remain untouched. */
    catalogSubject?: string;
    catalogTopic?: string;
    /** Set on rows installed by a purchasable content pack (lib/bkaCatalog.ts). */
    catalogPack?: string;
}

export type CardType = 0 | 1 | 2 | 3;  // 0=new, 1=learning, 2=review, 3=relearning
export type CardQueue = -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
// Anki (rslib/src/card.rs): -3=user buried, -2=sched buried, -1=suspended,
// 0=new, 1=learning, 2=review, 3=day-learn, 4=preview
export type CardFlag = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Mirrors Anki's cards table. `type` is the durable stage; `queue` is the live slot.
export interface AnkiCard {
    id: number;          // epoch ms
    noteId: number;
    deckId: number;
    ord: number;         // template ordinal (matches NoteTypeTemplate.ord)
    mod: number;         // epoch seconds
    usn: number;
    type: CardType;
    queue: CardQueue;
    due: number;         // new=position, learning=epoch ms, review=day number
    ivl: number;         // interval in days (negative = seconds)
    factor: number;      // ease in permille (2500 = 2.5x)
    reps: number;
    lapses: number;
    left: number;        // reps_today * 1000 + reps_until_graduation
    odue: number;        // original due (filtered decks)
    odid: number;        // original deck id (filtered decks)
    flags: CardFlag;
    lastReview: number;  // epoch ms; denormalized (Anki derives this from the revlog)
    /** Anki's opaque cards.data column. */
    ankiData?: string;
    sourcePackageId?: string;
    /** Original root deck before the curated TUS subdeck categorization. */
    sourceDeckId?: number;
}

// Hierarchical decks, e.g. "TUS::Dahiliye::Kardiyoloji".
export interface Deck {
    id: number;
    name: string;
    /** Manual order among decks that share the same parent. Missing values keep legacy A–Z order. */
    sortOrder?: number;
    configId: number;
    /** Anki's per-deck daily-limit overrides; absent means use the selected preset. */
    newLimit?: number;
    reviewLimit?: number;
    mod: number;
    usn: number;
    description: string;
    collapsed: boolean;
    isFiltered: boolean;
    /** Complete source deck JSON for lossless Anki package re-export. */
    ankiRaw?: Record<string, unknown>;
    sourcePackageId?: string;
    searchQuery?: string;
    searchLimit?: number;
    /** Gather order for a filtered deck's search: see FILTERED_ORDERS. */
    searchOrder?: number;
    /** Anki's "enable second filter": an extra search gathered after the first. */
    searchQuery2?: string;
    searchLimit2?: number;
    searchOrder2?: number;
    /** Anki's "reschedule cards based on my answers". False = preview mode: answers never touch the cards. */
    reschedule?: boolean;
    /**
     * Anki's preview_again_secs / preview_hard_secs / preview_good_secs, in that order, used when
     * reschedule is false. A zero retires the card from the preview session. Easy is not stored:
     * Anki always retires on Easy. See lib/filteredDeckOptions.ts.
     */
    previewDelays?: number[];
    /** Whether Build/Rebuild may keep a filtered deck when its searches gather no cards. */
    filteredAllowEmpty?: boolean;
    /**
     * Filtered decks are virtual in this client: their saved search is gathered on demand instead
     * of physically moving cards between decks. This flag models Anki's Empty/Rebuild lifecycle —
     * Empty hides the gathered cards, while Rebuild makes the saved search active again.
     */
    filteredDeckEmpty?: boolean;
    /** Cards completed since the last filtered-deck build; kept out until the next rebuild. */
    filteredDoneCardIds?: number[];
    /** Millisecond timestamp of the last Build/Rebuild action. */
    filteredBuildAt?: number;
    /** Set on rows installed by a purchasable content pack (lib/bkaCatalog.ts). */
    catalogPack?: string;
}

/** Gather orders for filtered decks (index = the stored searchOrder value, 0..10). */
export const FILTERED_ORDERS = [
    'En eski görülen önce',      // 0: oldest seen first
    'Rastgele',                  // 1: random
    'Aralıklar (artan)',         // 2: intervals ascending
    'Aralıklar (azalan)',        // 3: intervals descending
    'En çok unutulan',           // 4: most lapses
    'Ekleniş sırası',            // 5: order added
    'Vade sırası',               // 6: order due
    'Son eklenen önce',          // 7: latest added first
    'Hatırlanabilirlik (artan)', // 8: retrievability ascending
    'Hatırlanabilirlik (azalan)',// 9: retrievability descending
    'Göreceli gecikme',          // 10: relative overdueness
] as const;

export interface DeckConfig {
    id: number;
    name: string;
    mod: number;
    usn: number;
    /** Complete source deck-options JSON for lossless Anki package re-export. */
    ankiRaw?: Record<string, unknown>;
    sourcePackageId?: string;

    // New cards
    newPerDay: number;
    learningSteps: number[];      // minutes
    graduatingIvl: number;        // days
    easyIvl: number;              // days
    startingEase: number;         // permille
    insertionOrder: 'sequential' | 'random';

    // Reviews
    maxReviewsPerDay: number;
    easyBonus: number;
    hardIvl: number;
    ivlModifier: number;
    maxIvl: number;               // days

    // Lapses
    relearningSteps: number[];    // minutes
    minIvl: number;               // days
    leechThreshold: number;
    leechAction: 'suspend' | 'tag';
    // Lapse "new interval": a fraction in 0.0–1.0 (newIvl = oldIvl × this, then clamped to
    // minIvl). 0 = reset to minIvl. Stored as a fraction though shown as a percent in the UI.
    // Mirrors Anki's lapse `mult`; never a 0–100 value.
    newIvlPercent: number;

    // Burying
    buryNewSiblings: boolean;
    buryReviewSiblings: boolean;
    buryInterdayLearningSiblings: boolean;

    // Display
    showTimer: boolean;
    maxAnswerSecs: number;
    /** Anki Timers: freeze the answer timer the moment the answer is revealed. */
    stopTimerOnAnswer?: boolean;

    // Auto Advance (Anki 23.12+). Zero disables the matching step; the reviewer's own
    // auto-advance toggle still has to be on for any of these to fire.
    secondsToShowQuestion?: number;
    secondsToShowAnswer?: number;
    /** What auto-advance does when the question's dwell time runs out. */
    questionAction?: AutoAdvanceQuestionAction;
    /** Hold auto-advance until the side's audio has finished playing. */
    waitForAudio?: boolean;
    /** What auto-advance does when the answer's dwell time runs out. */
    answerAction?: AutoAdvanceAnswerAction;

    // Display order (Anki v3 "Display Order"). Optional: configs saved by older builds
    // lack them; readers fall back to the DEFAULT_DECK_CONFIG values.
    newCardGatherOrder?: NewCardGatherOrder;
    newReviewOrder?: 'mix' | 'before' | 'after';
    /** Where interday (day-boundary) learning cards sit relative to reviews. */
    interdayLearningMix?: 'mix' | 'before' | 'after';
    reviewSortOrder?: ReviewSortOrder;
    /** Anki's NewCardSortOrder, applied after the gather step. */
    newCardSortOrder?: NewCardSortOrder;

    // Audio
    autoPlayAudio?: boolean;
    /** Anki `replayq` inverted: replaying on the answer side skips the question's audio. */
    skipQuestionWhenReplayingAnswer?: boolean;

    // Easy days: per-weekday load factor, Monday-first. 1 = normal, 0.5 = reduced
    // (half the reviews land here), 0 = no reviews scheduled on that day.
    easyDays?: number[];

    // FSRS (Anki's "FSRS" deck-options section). The on/off switch is collection-wide; the
    // parameters and the retention targets belong to the preset.
    /** 21 FSRS-6 parameters. Empty/absent means the shipped defaults. */
    fsrsParams?: number[];
    /** Target recall probability at review time, 0.70–0.99 (Anki `desiredRetention`). */
    desiredRetention?: number;
    /** Assumed past retention when converting SM-2 cards with no usable review log. */
    historicalRetention?: number;
    /** Reviews before this epoch-ms timestamp are ignored when deriving memory states. */
    ignoreRevlogsBeforeMs?: number;
    /** When the preset's parameters were last optimized, for the deck-options summary line. */
    fsrsParamsOptimizedAtMs?: number;

    /** Set on rows installed by a purchasable content pack (lib/bkaCatalog.ts). */
    catalogPack?: string;
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
    id: 1,
    // User-facing preset labels follow their deck; never expose Anki's technical "Default" name.
    name: 'TUS Kartları',
    mod: 0,
    usn: 0,
    newPerDay: 20,
    learningSteps: [1, 10],
    graduatingIvl: 1,
    easyIvl: 4,
    startingEase: 2500,
    insertionOrder: 'sequential',
    maxReviewsPerDay: 200,
    easyBonus: 1.30,
    hardIvl: 1.20,
    ivlModifier: 1.00,
    maxIvl: 36500,
    relearningSteps: [10],
    minIvl: 1,
    leechThreshold: 8,
    // Anki's own default is Tag Only (rslib DEFAULT_DECK_CONFIG_INNER: LeechAction::TagOnly).
    // Suspending by default silently removes a card the learner is still struggling with.
    leechAction: 'tag',
    newIvlPercent: 0,
    // Anki ships sibling burying off; a new collection should behave the way its manual says.
    buryNewSiblings: false,
    buryReviewSiblings: false,
    buryInterdayLearningSiblings: false,
    showTimer: false,
    maxAnswerSecs: 60,
    stopTimerOnAnswer: false,
    secondsToShowQuestion: 0,
    secondsToShowAnswer: 0,
    questionAction: 'showAnswer',
    waitForAudio: true,
    answerAction: 'bury',
    // NewCardGatherPriority::Deck — subdeck by subdeck, in the order the deck list shows them.
    newCardGatherOrder: 'deck',
    newReviewOrder: 'mix',
    interdayLearningMix: 'mix',
    reviewSortOrder: 'dueRandom',
    // NewCardSortOrder::Template — ascending card template ordinal.
    newCardSortOrder: 'template',
    autoPlayAudio: true,
    skipQuestionWhenReplayingAnswer: false,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    // FSRS: upstream's defaults, Anki's 0.9 retention targets. Inert until FSRS is switched on.
    fsrsParams: [...DEFAULT_FSRS_PARAMETERS],
    desiredRetention: FSRS_DEFAULT_DESIRED_RETENTION,
    historicalRetention: FSRS_DEFAULT_HISTORICAL_RETENTION,
};

// Mirrors Anki's revlog: one immutable row per answer.
export interface ReviewLog {
    id: number;          // epoch ms
    cardId: number;
    usn: number;
    ease: 1 | 2 | 3 | 4;
    ivl: number;         // new interval (negative = seconds)
    lastIvl: number;     // previous interval
    factor: number;      // new ease (permille)
    time: number;        // review duration ms (capped at 60000)
    type: 0 | 1 | 2 | 3 | 4; // 0=learn, 1=review, 2=relearn, 3=filtered, 4=manual
}

export interface Tag {
    name: string;        // hierarchical, e.g. "TUS::Anatomi"
    usn: number;
}

export const FLAG_COLORS: Record<CardFlag, { name: string; color: string }> = {
    0: { name: 'Bayrak Yok', color: 'transparent' },
    1: { name: 'Kırmızı', color: '#ff4444' },
    2: { name: 'Turuncu', color: '#ff8800' },
    3: { name: 'Yeşil', color: '#44bb44' },
    4: { name: 'Mavi', color: '#4488ff' },
    5: { name: 'Pembe', color: '#ff44aa' },
    6: { name: 'Turkuaz', color: '#44cccc' },
    7: { name: 'Mor', color: '#8844ff' },
};

// A first launch opens on one empty deck, the way Anki does. The demo curriculum these ids used
// to seed is gone; existing installs keep whatever decks they already have, because initAnkiData
// runs only once per collection.
export const DEFAULT_DECKS: Deck[] = [
    { id: 1, name: 'Varsayılan', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
];

// Sync deletion tombstones.
export interface GraveEntry {
    oid: number;         // deleted object id
    type: 0 | 1 | 2;     // 0=card, 1=note, 2=deck
    usn: number;
}

// Monotonic id counter so cards created in the same millisecond don't collide.
let _lastId = 0;
export function uniqueId(): number {
    const now = Date.now();
    _lastId = now > _lastId ? now : _lastId + 1;
    return _lastId;
}

export function generateGuid(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(10);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(bytes[i] % chars.length);
    }
    return result;
}

export function checksumField(field: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    const str = field.trim();
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return Math.abs(hash | 0);
}

/** Parse a deck hierarchy: "A::B::C" -> ["A", "A::B", "A::B::C"]. */
export function getDeckAncestors(name: string): string[] {
    const parts = name.split('::');
    const result: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
        result.push(parts.slice(0, i).join('::'));
    }
    return result;
}

/** Direct children of a deck (one level down). */
export function getDeckChildren(parentName: string, allDecks: Deck[]): Deck[] {
    const prefix = parentName + '::';
    return allDecks.filter(d => {
        if (!d.name.startsWith(prefix)) return false;
        const rest = d.name.slice(prefix.length);
        return !rest.includes('::');
    });
}

/** Deck display name (last segment). */
export function getDeckDisplayName(fullName: string): string {
    const parts = fullName.split('::');
    return parts[parts.length - 1];
}

/** Parent deck name, or null at the root. */
export function getParentDeckName(fullName: string): string | null {
    const parts = fullName.split('::');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('::');
}

/** Map a subject slug to its seeded deck id. */
/**
 * Home deck for a legacy seeded course id. The seed curriculum was removed, so only collections
 * created by an older build still contain these decks; everything else resolves to the root deck
 * and, for real courses, to UserSubject.deckId via lib/subjects.
 */
export function subjectToDeckId(subject: string): number {
    const map: Record<string, number> = {
        'temeller': 2, 'mantik': 3, 'veri': 4,
        'fonksiyon': 5, 'oop': 6, 'araclar': 7,
    };
    return map[subject] || 1;
}
