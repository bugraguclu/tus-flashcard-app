// ============================================================
// TUS Flashcard - Anki-Compatible Data Models
// Faz 1: Note/Card ayrımı, NoteTypes, Decks, Tags, Flags, RevLog
// ============================================================

// ---- Note Types (Anki: notetypes) ----
export type NoteTypeKind = 'standard' | 'cloze';

export interface NoteTypeField {
    name: string;
    ord: number;        // sıra numarası (0-indexed)
    sticky: boolean;    // alan değerini kart eklerken koru
    rtl: boolean;       // sağdan sola yazım
}

export interface NoteTypeTemplate {
    name: string;
    ord: number;
    qfmt: string;       // soru şablonu (mustache syntax)
    afmt: string;       // cevap şablonu
}

export interface NoteType {
    id: number;
    name: string;
    kind: NoteTypeKind;
    fields: NoteTypeField[];
    templates: NoteTypeTemplate[];
    css: string;
    sortFieldIdx: number;
    mod: number;         // modification timestamp
}

// ---- Built-in Note Types ----
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
                afmt: '{{FrontSide}}<hr id=answer><div class="answer">{{Cevap}}</div>{{#Kaynak}}<div class="source">📚 {{Kaynak}}</div>{{/Kaynak}}',
            },
        ],
        css: `.card { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 18px; color: #2c3e36; background-color: #f4faf7; padding: 20px; }
.question { font-weight: 600; line-height: 1.6; }
.answer { line-height: 1.6; color: #556b62; }
.source { margin-top: 12px; font-size: 13px; color: #7f9a8f; }`,
        sortFieldIdx: 0,
        mod: 0,
    },
];

// ---- Notes (Anki: notes) ----
export interface Note {
    id: number;          // epoch ms
    guid: string;        // globally unique ID
    noteTypeId: number;  // references NoteType.id
    mod: number;         // modification timestamp (epoch seconds)
    usn: number;         // update sequence number (sync)
    tags: string[];      // tag listesi
    fields: string[];    // alan değerleri (NoteType.fields sırasıyla)
    sfld: string;        // sort field value
    csum: number;        // SHA1 checksum of first field (duplicate detection)
    flags: number;       // card flags (1-7 renk)
}

// ---- Cards (Anki: cards) ----
export type CardType = 0 | 1 | 2 | 3;  // 0=new, 1=learning, 2=review, 3=relearning
export type CardQueue = -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
// -3=sched buried, -2=user buried, -1=suspended, 0=new, 1=learning, 2=review, 3=day-learn, 4=preview

export type CardFlag = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AnkiCard {
    id: number;          // epoch ms
    noteId: number;      // references Note.id
    deckId: number;      // references Deck.id
    ord: number;         // template ordinal (0-indexed)
    mod: number;         // modification timestamp
    usn: number;         // update sequence number
    type: CardType;
    queue: CardQueue;
    due: number;         // new=position, learn=timestamp, review=days since epoch
    ivl: number;         // current interval in days (negative=seconds)
    factor: number;      // ease factor in permille (2500 = 2.5x)
    reps: number;        // total review count
    lapses: number;      // times forgotten
    left: number;        // remaining_steps * 1000 + remaining_today
    odue: number;        // original due (filtered deck)
    odid: number;        // original deck ID (filtered deck)
    flags: CardFlag;
    lastReview: number;  // epoch ms of last review
}

// ---- Decks (Anki: decks) ----
export interface Deck {
    id: number;
    name: string;        // hierarchical: "Dahiliye::Kardiyoloji::Aritmiler"
    configId: number;    // references DeckConfig.id
    mod: number;
    usn: number;
    description: string;
    collapsed: boolean;
    isFiltered: boolean;
    // Filtered deck specific
    searchQuery?: string;
    searchLimit?: number;
    searchOrder?: number;
}

// ---- Deck Config (Anki: deck_config) ----
export interface DeckConfig {
    id: number;
    name: string;
    mod: number;
    usn: number;

    // New Cards
    newPerDay: number;
    learningSteps: number[];      // minutes
    graduatingIvl: number;        // days
    easyIvl: number;              // days
    startingEase: number;         // permille (2500)
    insertionOrder: 'sequential' | 'random';

    // Reviews
    maxReviewsPerDay: number;
    easyBonus: number;            // 1.30
    hardIvl: number;              // 1.20
    ivlModifier: number;          // 1.00
    maxIvl: number;               // 36500

    // Lapses
    relearningSteps: number[];    // minutes
    minIvl: number;               // 1
    leechThreshold: number;       // 8
    leechAction: 'suspend' | 'tag';
    newIvlPercent: number;        // 0 (0% = reset to minIvl)

    // Burying
    buryNewSiblings: boolean;
    buryReviewSiblings: boolean;
    buryInterdayLearningSiblings: boolean;

    // Display
    showTimer: boolean;
    maxAnswerSecs: number;        // 60

}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
    id: 1,
    name: 'Default',
    mod: 0,
    usn: 0,
    newPerDay: 9999,
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
};

// ---- Review Log (Anki: revlog) ----
export interface ReviewLog {
    id: number;          // epoch ms of review
    cardId: number;
    usn: number;
    ease: 1 | 2 | 3 | 4; // button pressed
    ivl: number;         // new interval (negative=seconds, positive=days)
    lastIvl: number;     // previous interval
    factor: number;      // new ease factor (permille)
    time: number;        // review duration ms (capped at 60000)
    type: 0 | 1 | 2 | 3 | 4; // 0=learn, 1=review, 2=relearn, 3=filtered, 4=manual
}

// ---- Tags ----
export interface Tag {
    name: string;        // hierarchical: "TUS::Anatomi::YüksekVerim"
    usn: number;
}

// ---- Flag Colors ----
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

// ---- Default Decks ----
export const DEFAULT_DECKS: Deck[] = [
    { id: 1, name: 'TUS', configId: 1, mod: 0, usn: 0, description: 'TUS ana deste', collapsed: false, isFiltered: false },
    { id: 2, name: 'TUS::Anatomi', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 3, name: 'TUS::Fizyoloji', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 4, name: 'TUS::Biyokimya', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 5, name: 'TUS::Mikrobiyoloji', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 6, name: 'TUS::Patoloji', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 7, name: 'TUS::Farmakoloji', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 8, name: 'TUS::Dahiliye', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 9, name: 'TUS::Cerrahi', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 10, name: 'TUS::Pediatri', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
    { id: 11, name: 'TUS::Kadın Hastalıkları', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false },
];

// ---- Sync Deletion Tracking ----
export interface GraveEntry {
    oid: number;         // original deleted object ID
    type: 0 | 1 | 2;    // 0=card, 1=note, 2=deck
    usn: number;
}

// ---- Helpers ----

// Monotonic ID counter to prevent Date.now() collisions
let _lastId = 0;
export function uniqueId(): number {
    const now = Date.now();
    _lastId = now > _lastId ? now : _lastId + 1;
    return _lastId;
}

export function generateGuid(): string {
    // Use expo-crypto getRandomValues for cryptographic randomness
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(10);
    // globalThis.crypto is available in React Native (Hermes) via expo-crypto polyfill
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        // Fallback for environments without crypto
        for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(bytes[i] % chars.length);
    }
    return result;
}

export function checksumField(field: string): number {
    // FNV-1a 32-bit hash — better distribution than djb2 for duplicate detection
    let hash = 0x811c9dc5; // FNV offset basis
    const str = field.trim();
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return Math.abs(hash | 0);
}

/** Parse deck hierarchy: "A::B::C" → ["A", "A::B", "A::B::C"] */
export function getDeckAncestors(name: string): string[] {
    const parts = name.split('::');
    const result: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
        result.push(parts.slice(0, i).join('::'));
    }
    return result;
}

/** Get direct children of a deck */
export function getDeckChildren(parentName: string, allDecks: Deck[]): Deck[] {
    const prefix = parentName + '::';
    return allDecks.filter(d => {
        if (!d.name.startsWith(prefix)) return false;
        const rest = d.name.slice(prefix.length);
        return !rest.includes('::'); // only direct children
    });
}

/** Get deck display name (last part) */
export function getDeckDisplayName(fullName: string): string {
    const parts = fullName.split('::');
    return parts[parts.length - 1];
}

/** Get parent deck name */
export function getParentDeckName(fullName: string): string | null {
    const parts = fullName.split('::');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('::');
}

/** Map old subject to deck ID */
export function subjectToDeckId(subject: string): number {
    const map: Record<string, number> = {
        'anatomi': 2, 'fizyoloji': 3, 'biyokimya': 4,
        'mikrobiyoloji': 5, 'patoloji': 6, 'farmakoloji': 7,
        'dahiliye': 8, 'cerrahi': 9, 'pediatri': 10, 'kadin': 11,
    };
    return map[subject] || 1;
}
