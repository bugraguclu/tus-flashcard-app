/**
 * Moving a deck one place up or down among its siblings without dragging: the keyboard's arrows
 * on the drag handle (web) and VoiceOver's actions on it (iPhone). The move goes through
 * `reorderDeckRelative`, which places a deck before or after another one; a ready-made pack deck
 * cannot be that other deck, so the anchor is chosen on whichever side of the new place allows it.
 */

export interface SiblingDeck {
    id: number;
    /** False for a deck that cannot be an anchor (a ready-made pack deck). */
    movable: boolean;
}

export interface DeckStep {
    targetId: number;
    placement: 'before' | 'after';
}

/**
 * The `reorderDeckRelative` call that moves `deckId` one place `direction` among `siblings`
 * (in display order, the deck itself included), or null when it is already at that end or no
 * neighbour can anchor the move.
 */
export function deckStep(siblings: readonly SiblingDeck[], deckId: number, direction: 'up' | 'down'): DeckStep | null {
    const index = siblings.findIndex((entry) => entry.id === deckId);
    if (index < 0) return null;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= siblings.length) return null;
    const others = siblings.filter((entry) => entry.id !== deckId);
    // In the list without the deck, it goes in front of others[newIndex] and behind others[newIndex - 1].
    const next = others[newIndex];
    if (next?.movable) return { targetId: next.id, placement: 'before' };
    const previous = others[newIndex - 1];
    if (previous?.movable) return { targetId: previous.id, placement: 'after' };
    return null;
}
