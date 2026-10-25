/**
 * Drop-target resolution for the deck list's drag-and-drop.
 *
 * The screen owns the gesture and the geometry; this module owns the decision. Every row is
 * described in one content coordinate space — the same space the pointer is converted into — so a
 * target is a pure function of "where the finger is" and "what each row will accept".
 */

export const ROOT_DROP_TARGET = '__root_deck_drop_target__';

export type DeckDropPlacement = 'before' | 'inside' | 'after';

export type DecodedDeckDropTarget =
    | { kind: 'root' }
    | { kind: 'deck'; name: string; placement: DeckDropPlacement };

export function encodeDeckDropTarget(name: string, placement: DeckDropPlacement): string {
    return `${placement}:${name}`;
}

export function decodeDeckDropTarget(target: string | null): DecodedDeckDropTarget | null {
    if (!target) return null;
    if (target === ROOT_DROP_TARGET) return { kind: 'root' };
    const separator = target.indexOf(':');
    if (separator < 0) return null;
    const placement = target.slice(0, separator) as DeckDropPlacement;
    if (placement !== 'before' && placement !== 'inside' && placement !== 'after') return null;
    return { kind: 'deck', placement, name: target.slice(separator + 1) };
}

/** One laid-out row the pointer can be resolved against, in list order. */
export type DeckDropRow = {
    name: string;
    /** Top edge of the row in list content space (scroll offset already folded in). */
    y: number;
    /** Row height in the same space. */
    h: number;
    /** The dragged deck itself, its own subtree, and protected catalog rows accept nothing. */
    invalid: boolean;
    /** Filtered decks take part in ordering but can never adopt children. */
    acceptsInside: boolean;
};

/**
 * The top and bottom quarter of a row reorder; the generous middle nests, which is what makes
 * Anki-style subdeck creation reliable under a fingertip.
 */
const DECK_DROP_EDGE_RATIO = 0.25;

/** Nested cards leave small visual gaps. Snap a pointer inside one to the nearest row. */
const DECK_DROP_GAP_TOLERANCE = 12;

/**
 * Resolve a pointer position to an encoded drop target, or null when the pointer is over
 * something that refuses the drop.
 */
export function resolveDeckDropTarget(contentY: number, rows: readonly DeckDropRow[]): string | null {
    let nearest: { name: string; placement: 'before' | 'after'; distance: number } | null = null;
    let firstValid: { name: string; y: number } | null = null;
    let lastValid: { name: string; bottom: number } | null = null;

    for (const row of rows) {
        const bottom = row.y + row.h;
        if (!row.invalid) {
            if (!firstValid || row.y < firstValid.y) firstValid = { name: row.name, y: row.y };
            if (!lastValid || bottom > lastValid.bottom) lastValid = { name: row.name, bottom };
        }

        if (contentY >= row.y && contentY <= bottom) {
            if (row.invalid) return null;
            const position = (contentY - row.y) / Math.max(1, row.h);
            if (position < DECK_DROP_EDGE_RATIO) return encodeDeckDropTarget(row.name, 'before');
            if (position > 1 - DECK_DROP_EDGE_RATIO) return encodeDeckDropTarget(row.name, 'after');
            // A row that cannot adopt children still reorders: send the middle to the nearer edge
            // rather than leaving a dead band across half the row.
            if (!row.acceptsInside) {
                return encodeDeckDropTarget(row.name, position < 0.5 ? 'before' : 'after');
            }
            return encodeDeckDropTarget(row.name, 'inside');
        }

        if (row.invalid) continue;
        const distance = contentY < row.y ? row.y - contentY : contentY - bottom;
        if (distance <= DECK_DROP_GAP_TOLERANCE && (!nearest || distance < nearest.distance)) {
            nearest = { name: row.name, distance, placement: contentY < row.y ? 'before' : 'after' };
        }
    }

    // Keep the breathing room past either end of the list useful: dragging all the way down still
    // means "place last" rather than silently cancelling the move.
    if (lastValid && contentY > lastValid.bottom) return encodeDeckDropTarget(lastValid.name, 'after');
    if (firstValid && contentY < firstValid.y) return encodeDeckDropTarget(firstValid.name, 'before');
    return nearest ? encodeDeckDropTarget(nearest.name, nearest.placement) : null;
}
