// Anki-compatible data models: notes, cards, note types, decks, deck config, revlog.

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
                afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 2,
        name: 'Basic (and Reversed Card)',
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
                afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
            },
            {
                name: 'Card 2',
                ord: 1,
                qfmt: '{{Back}}',
                afmt: '{{FrontSide}}<hr id=answer>{{Front}}',
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
            { name: 'Extra', ord: 1, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Cloze',
                ord: 0,
                qfmt: '{{cloze:Text}}',
                afmt: '{{cloze:Text}}<br>{{Extra}}',
            },
        ],
        css: `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }
.cloze { font-weight: bold; color: blue; }
.cloze-hint { font-size: 14px; color: #999; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        id: 4,
        name: 'TUS Tıp Kartı',
        kind: 'standard',
        fields: [
            { name: 'Soru', ord: 0, sticky: false, rtl: false },
            { name: 'Cevap', ord: 1, sticky: false, rtl: false },
            { name: 'Kaynak', ord: 2, sticky: true, rtl: false },
        ],
        templates: [
            {
                name: 'Soru → Cevap',
                ord: 0,
                qfmt: '<div class="question">{{Soru}}</div>',
                afmt: '{{FrontSide}}<hr id=answer><div class="answer">{{Cevap}}</div>',
            },
        ],
        css: `.card { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 18px; color: #2c3e36; background-color: #f4faf7; padding: 20px; }
.question { font-weight: 600; line-height: 1.6; }
.answer { line-height: 1.6; color: #556b62; }
.source { margin-top: 12px; font-size: 13px; color: #7f9a8f; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        // "Yazarak Cevapla": same Soru/Cevap/Kaynak shape as the TUS card (id 4), but the
        // templates embed {{type:Cevap}} so the study screen collects a typed answer and
        // diffs it against the real one, Anki-style.
        id: 5,
        name: 'TUS Yazarak Cevapla',
        kind: 'standard',
        fields: [
            { name: 'Soru', ord: 0, sticky: false, rtl: false },
            { name: 'Cevap', ord: 1, sticky: false, rtl: false },
            { name: 'Kaynak', ord: 2, sticky: true, rtl: false },
        ],
        templates: [
            {
                name: 'Soru → Cevap',
                ord: 0,
                qfmt: '<div class="question">{{Soru}}</div>{{type:Cevap}}',
                afmt: '{{FrontSide}}<hr id=answer>{{type:Cevap}}',
            },
        ],
        css: `.card { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 18px; color: #2c3e36; background-color: #f4faf7; padding: 20px; }
.question { font-weight: 600; line-height: 1.6; }
.source { margin-top: 12px; font-size: 13px; color: #7f9a8f; }
.typeanswer { margin-top: 14px; font-size: 16px; }
.typeGood { background: #d7f0df; color: #1c6b35; }
.typeBad { background: #fadadb; color: #a3283a; text-decoration: line-through; }
.typeMissed { background: #fadadb; color: #a3283a; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
    {
        // "Çift Taraflı": fields[3] (TersCevap) is an optional override for Card 2's answer —
        // if left blank, Card 2 answers with the original Soru (a plain swap, matching Anki's
        // "Basic and Reversed Card"); if filled, Card 2 answers with the custom text instead.
        id: 6,
        name: 'TUS Çift Taraflı',
        kind: 'standard',
        fields: [
            { name: 'Soru', ord: 0, sticky: false, rtl: false },
            { name: 'Cevap', ord: 1, sticky: false, rtl: false },
            { name: 'Konu', ord: 2, sticky: true, rtl: false },
            { name: 'TersCevap', ord: 3, sticky: false, rtl: false },
        ],
        templates: [
            {
                name: 'Soru → Cevap',
                ord: 0,
                qfmt: '<div class="question">{{Soru}}</div>',
                afmt: '{{FrontSide}}<hr id=answer><div class="answer">{{Cevap}}</div>',
            },
            {
                name: 'Cevap → Soru',
                ord: 1,
                qfmt: '<div class="question">{{Cevap}}</div>',
                afmt: '{{FrontSide}}<hr id=answer><div class="answer">{{#TersCevap}}{{TersCevap}}{{/TersCevap}}{{^TersCevap}}{{Soru}}{{/TersCevap}}</div>',
            },
        ],
        css: `.card { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 18px; color: #2c3e36; background-color: #f4faf7; padding: 20px; }
.question { font-weight: 600; line-height: 1.6; }
.answer { line-height: 1.6; color: #556b62; }`,
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
}

// Hierarchical decks, e.g. "TUS::Dahiliye::Kardiyoloji".
export interface Deck {
    id: number;
    name: string;
    configId: number;
    mod: number;
    usn: number;
    description: string;
    collapsed: boolean;
    isFiltered: boolean;
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
}

/** Gather orders for filtered decks (index = the stored searchOrder value). */
export const FILTERED_ORDERS = [
    'Vade sırası',           // 0: order due
    'Rastgele',              // 1: random
    'Aralık (artan)',        // 2: shortest intervals first
    'Aralık (azalan)',       // 3: longest intervals first
    'Ekleniş sırası',        // 4: oldest added first
    'Son eklenen önce',      // 5: latest added first
    'En çok hata',           // 6: most lapses first
] as const;

export interface DeckConfig {
    id: number;
    name: string;
    mod: number;
    usn: number;

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

    // Display order (Anki v3 "Display Order"). Optional: configs saved by older builds
    // lack them; readers fall back to the DEFAULT_DECK_CONFIG values.
    newCardGatherOrder?: 'topic' | 'position' | 'random';
    newReviewOrder?: 'mix' | 'before' | 'after';
    reviewSortOrder?: 'dueRandom' | 'intervalsAsc' | 'intervalsDesc';

    // Audio
    autoPlayAudio?: boolean;

    // Easy days: per-weekday load factor, Monday-first. 1 = normal, 0.5 = reduced
    // (half the reviews land here), 0 = no reviews scheduled on that day.
    easyDays?: number[];
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
    id: 1,
    name: 'Default',
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
    leechAction: 'suspend',
    newIvlPercent: 0,
    buryNewSiblings: true,
    buryReviewSiblings: true,
    buryInterdayLearningSiblings: true,
    showTimer: false,
    maxAnswerSecs: 60,
    newCardGatherOrder: 'topic',
    newReviewOrder: 'mix',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
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

export const DEFAULT_DECKS: Deck[] = [
    { id: 1, name: 'Python', configId: 1, mod: 0, usn: 0, description: 'Python ana deste', collapsed: false, isFiltered: false },
    { id: 2, name: 'Python::Temeller', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 3, name: 'Python::Mantık & Döngüler', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 4, name: 'Python::Veri Yapıları', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 5, name: 'Python::Fonksiyonlar', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 6, name: 'Python::Nesne Yönelimli (OOP)', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 7, name: 'Python::Modüller & Hata Ayıklama', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
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
export function subjectToDeckId(subject: string): number {
    const map: Record<string, number> = {
        'temeller': 2, 'mantik': 3, 'veri': 4,
        'fonksiyon': 5, 'oop': 6, 'araclar': 7,
    };
    return map[subject] || 1;
}
