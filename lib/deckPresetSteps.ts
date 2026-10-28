/** Independently derived from the behavioral rule: a step remains until a delay at least as
 * large has been passed. This changes counters, never persisted due units or queue state.
 * https://github.com/ankitects/anki/blob/main/rslib/src/card/mod.rs
 */
import { getDB } from './db';
import { DEFAULT_DECK_CONFIG, type AnkiCard, type DeckConfig } from './models';
export function remainingAfterStepChange(left: number, previous: number[], next: number[]): number {
    const remaining = Math.max(0, Math.floor(left)) % 1000;
    if (!previous.length) return remaining;
    const passedIndex = previous.length - remaining - 1;
    if (passedIndex < 0 || passedIndex >= previous.length) return Math.max(1, next.length);
    const lastPassedDelay = previous[passedIndex];
    let completedThrough = -1;
    next.forEach((delay, index) => { if (delay <= lastPassedDelay) completedThrough = index; });
    return Math.max(1, next.length - completedThrough - 1);
}
export function remapDeckLearningSteps(deckIds: number[], before: DeckConfig, after: DeckConfig): void {
    if (!deckIds.length || (JSON.stringify(before.learningSteps) === JSON.stringify(after.learningSteps)
        && JSON.stringify(before.relearningSteps) === JSON.stringify(after.relearningSteps))) return;
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>(
        `SELECT data FROM anki_cards WHERE type IN (1,3) AND json_valid(data)
         AND COALESCE(NULLIF(json_extract(data, '$.odid'), 0), deckId) IN (${deckIds.map(() => '?').join(',')})`, ...deckIds,
    );
    for (const row of rows) {
        const card = JSON.parse(row.data) as AnkiCard;
        const oldSteps = (card.type === 3 ? before.relearningSteps : before.learningSteps) ?? [];
        const newSteps = (card.type === 3 ? after.relearningSteps : after.learningSteps) ?? [];
        if (JSON.stringify(oldSteps) === JSON.stringify(newSteps)) continue;
        const left = remainingAfterStepChange(card.left, oldSteps, newSteps);
        if (left === card.left % 1000) continue;
        card.left = left;
        card.mod = Math.floor(Date.now() / 1000);
        card.usn = -1;
        db.runSync('UPDATE anki_cards SET "left" = ?, data = ?, updated_at = ?, usn = -1 WHERE id = ?', left, JSON.stringify(card), Date.now(), card.id);
    }
}

function stepsOfDeck(deckId: number): { learningSteps: number[]; relearningSteps: number[] } | null {
    const db = getDB();
    try {
        const deck = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', deckId);
        const configId = deck ? (JSON.parse(deck.data) as { configId?: number }).configId || 1 : 1;
        const row = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', configId);
        const config = row ? JSON.parse(row.data) as Partial<DeckConfig> : null;
        return {
            learningSteps: config?.learningSteps ?? DEFAULT_DECK_CONFIG.learningSteps,
            relearningSteps: config?.relearningSteps ?? DEFAULT_DECK_CONFIG.relearningSteps,
        };
    } catch {
        return null; // An unreadable deck or preset leaves the counter alone.
    }
}

/**
 * Change Deck: a learning card moved to a deck on another preset keeps the delay it has passed
 * and continues with the new preset's remaining steps, as Anki does when cards change deck.
 * Returns the card's `left` value for the destination (unchanged when nothing applies).
 */
export function learningLeftAfterDeckMove(card: AnkiCard, previousDeckId: number, targetDeckId: number): number {
    if ((card.type !== 1 && card.type !== 3) || (card.odid && card.odid > 0)) return card.left;
    const before = stepsOfDeck(previousDeckId);
    const after = stepsOfDeck(targetDeckId);
    if (!before || !after) return card.left;
    const oldSteps = card.type === 3 ? before.relearningSteps : before.learningSteps;
    const newSteps = card.type === 3 ? after.relearningSteps : after.learningSteps;
    if (JSON.stringify(oldSteps) === JSON.stringify(newSteps)) return card.left;
    const left = remainingAfterStepChange(card.left, oldSteps, newSteps);
    return left === card.left % 1000 ? card.left : left;
}
