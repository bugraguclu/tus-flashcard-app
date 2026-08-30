import type { AppSettings, Grade } from './types';
import type { AnkiCard } from './models';
import {
    getAllAnkiCards,
    getAnkiCard,
    saveAnkiCard,
} from './noteManager';
import {
    answerStudyCard,
    forgetCards,
    setCardBuried,
    setCardsDueDate,
    setCardSuspended,
} from './studyRepository';
import type { DueDateSpecifier, ForgetOptions } from './setDueDate';

function selectedCards(cardIds: number[]): AnkiCard[] {
    return [...new Set(cardIds)]
        .map((cardId) => getAnkiCard(cardId))
        .filter((card): card is AnkiCard => card !== null);
}

/** Anki toggles every selected card based on the current (first selected) card. */
export function toggleSelectedSuspend(cardIds: number[], rolloverHour: number): number {
    const cards = selectedCards(cardIds);
    if (cards.length === 0) return 0;
    const suspend = cards[0].queue !== -1;
    for (const card of cards) setCardSuspended(card.id, suspend, rolloverHour);
    return cards.length;
}

/** AnkiDroid's Toggle Bury counterpart, also driven by the current card. */
export function toggleSelectedBury(cardIds: number[], rolloverHour: number): number {
    const cards = selectedCards(cardIds);
    if (cards.length === 0) return 0;
    const bury = cards[0].queue !== -2 && cards[0].queue !== -3;
    for (const card of cards) setCardBuried(card.id, bury, rolloverHour);
    return cards.length;
}

/**
 * Reposition selected new cards in their current browser order. When shifting is enabled, cards
 * already at/after the insertion point are moved out of the inserted range first.
 */
export function repositionSelectedNewCards(
    cardIds: number[],
    start: number,
    step: number,
    shiftExisting: boolean,
): number {
    const normalizedStart = Math.max(1, Math.floor(start) || 1);
    const normalizedStep = Math.max(1, Math.floor(step) || 1);
    const cards = selectedCards(cardIds).filter((card) => card.type === 0);
    if (cards.length === 0) return 0;
    const selectedIds = new Set(cards.map((card) => card.id));

    if (shiftExisting) {
        const shift = cards.length * normalizedStep;
        const displaced = getAllAnkiCards()
            .filter((card) => card.type === 0 && !selectedIds.has(card.id) && card.due >= normalizedStart)
            .sort((a, b) => b.due - a.due || b.id - a.id);
        for (const card of displaced) {
            saveAnkiCard({ ...card, due: card.due + shift, mod: Math.floor(Date.now() / 1000), usn: -1 });
        }
    }

    cards.forEach((card, index) => {
        saveAnkiCard({
            ...card,
            due: normalizedStart + index * normalizedStep,
            mod: Math.floor(Date.now() / 1000),
            usn: -1,
        });
    });
    return cards.length;
}

/** Anki's Set Due Date over the browser selection. */
export function setSelectedDueDate(cardIds: number[], spec: DueDateSpecifier, settings: AppSettings): number {
    return setCardsDueDate(cardIds, spec, settings);
}

/** Anki's Forget over the browser selection. */
export function forgetSelectedCards(cardIds: number[], options: ForgetOptions): number {
    return forgetCards(cardIds, options);
}

/** Grade selected cards immediately using the normal scheduler and review log path. */
export function gradeSelectedNow(cardIds: number[], grade: Grade, settings: AppSettings): number {
    let graded = 0;
    for (const card of selectedCards(cardIds)) {
        answerStudyCard(card.id, grade, settings, 0);
        graded += 1;
    }
    return graded;
}
