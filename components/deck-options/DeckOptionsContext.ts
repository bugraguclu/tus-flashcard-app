import { createContext } from 'react';
import type { DeckOptionsWarning, DeckOptionsWarningId } from '../../lib/deckOptionsRules';

/** What every field on the screen reads without being handed it: its error and its advice. */
export interface DeckOptionsContextValue {
    errors: Partial<Record<string, string>>;
    /** Anki's non-blocking advice, grouped by the field it is printed under. */
    warnings: Record<string, DeckOptionsWarning[]>;
    warningText: (id: DeckOptionsWarningId) => string;
}

export const DeckOptionsContext = createContext<DeckOptionsContextValue | null>(null);
