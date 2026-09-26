import { createContext } from 'react';
import type { ColorScheme } from '../../constants/theme';
import type { DeckOptionsWarning, DeckOptionsWarningId } from '../../lib/deckOptionsRules';
import type { DeckOptionsStyles } from './deckOptionsStyles';

/** What every field on the screen reads without being handed it: looks, errors and advice. */
export interface DeckOptionsContextValue {
    styles: DeckOptionsStyles;
    colors: ColorScheme;
    errors: Partial<Record<string, string>>;
    /** Anki's non-blocking advice, grouped by the field it is printed under. */
    warnings: Record<string, DeckOptionsWarning[]>;
    warningText: (id: DeckOptionsWarningId) => string;
}

export const DeckOptionsContext = createContext<DeckOptionsContextValue | null>(null);
