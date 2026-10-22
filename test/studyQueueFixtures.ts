import type { SyncDb } from './sqljsHarness';
import type { AppSettings } from '../lib/types';
import type { AnkiCard, DeckConfig, Note, NoteType } from '../lib/models';
import { saveDeck, saveDeckConfig } from '../lib/deckManager';
import { saveNote, saveAnkiCard, saveNoteType } from '../lib/noteManager';
import { invalidateSubjectsCache } from '../lib/subjects';

export const noteType: NoteType = {
    id: 4,
    name: 'TUS',
    kind: 'standard',
    fields: [
        { name: 'Soru', ord: 0, sticky: false, rtl: false },
        { name: 'Cevap', ord: 1, sticky: false, rtl: false },
        { name: 'Kaynak', ord: 2, sticky: false, rtl: false },
    ],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Soru}}', afmt: '{{Cevap}}' }],
    css: '',
    sortFieldIdx: 0,
    mod: 0,
};

export const deckConfig: DeckConfig = {
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
    easyBonus: 1.3,
    hardIvl: 1.2,
    ivlModifier: 1,
    maxIvl: 36500,
    relearningSteps: [10],
    minIvl: 1,
    leechThreshold: 8,
    leechAction: 'suspend',
    newIvlPercent: 0,
    buryNewSiblings: false,
    buryReviewSiblings: false,
    buryInterdayLearningSiblings: false,
    showTimer: false,
    maxAnswerSecs: 60,
};

// Rollover far from "now" so end-of-day windows never straddle the test run.
export const rolloverHour = (new Date().getHours() + 12) % 24;

export const settings: AppSettings = {
    language: 'system',
    themeMode: 'system',
    keyBindings: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
    autoAdvance: false,
    interruptAudioOnAnswer: true,
    showRemainingCount: true,
    showNextReviewTimes: true,
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0,
    minLapseInterval: 1,
    queueOrder: 'mix',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'deck',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1,
    maxInterval: 36500,
    dayRolloverHour: rolloverHour,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
};

export function makeNote(id: number, tags: string[], fields: string[]): Note {
    return {
        id,
        guid: `guid-${id}`,
        noteTypeId: 4,
        mod: 0,
        usn: -1,
        tags,
        fields,
        sfld: fields[0],
        csum: 0,
        flags: 0,
    };
}

export function makeCard(id: number, noteId: number, deckId: number, overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id,
        noteId,
        deckId,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 0,
        queue: 0,
        due: id,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

export function seedBase(db: SyncDb) {
    saveDeckConfig(deckConfig);
    saveDeck({ id: 1, name: 'Python', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveDeck({ id: 2, name: 'Python::Temeller', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveDeck({ id: 7, name: 'Python::Modüller & Hata Ayıklama', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    // Production no longer ships the former Python demo curriculum. Register the fixture's
    // courses explicitly so this test owns the topic ordering it is asserting.
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        'user_subjects_v1',
        JSON.stringify([
            { id: 'temeller', name: 'Temeller', icon: '🐍', topics: ['Veri Tipleri'], deckId: 2, isCustom: true },
            { id: 'araclar', name: 'Araçlar', icon: '🧰', topics: ['Modüller', 'random', 'Hata Ayıklama'], deckId: 7, isCustom: true },
        ]),
    );
    invalidateSubjectsCache();
    saveNoteType(noteType);

    // Topic "random", but the ANSWER mentions "Modüller" — must never leak into that topic.
    saveNote(makeNote(101, ['araclar', 'random'], [
        'random.randint ne döndürür?',
        'İki sınır dahil bir tamsayı. Modüller konusuyla karışmamalı.',
        'random',
    ]));
    saveAnkiCard(makeCard(1010, 101, 7));

    // Topic "Modüller", but the ANSWER mentions "import random" — must never leak into "random".
    saveNote(makeNote(102, ['araclar', 'Modüller'], [
        'Bir modül nasıl içe aktarılır?',
        'import random gibi bir satırla.',
        'Modüller',
    ]));
    saveAnkiCard(makeCard(1020, 102, 7));

    // Different subject ("temeller") whose topic tag contains the word "veri".
    saveNote(makeNote(103, ['temeller', 'Veri-Tipleri'], [
        'int nedir?',
        'Tamsayı türü.',
        'Veri Tipleri',
    ]));
    saveAnkiCard(makeCard(1030, 103, 2));
}
