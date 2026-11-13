import FlagGlyph from '../FlagGlyph';
import {
    BuryGlyph,
    CheckSquareGlyph,
    DeckGlyph,
    FilterGlyph,
    PauseCircleGlyph,
    RotateLeftGlyph,
    SortGlyph,
    TagGlyph,
    TrashGlyph,
    UndoGlyph,
} from '../UiGlyphs';

/**
 * Browse's own glyphs: the selection bar's and the action menus' marks that the shared set in
 * `components/ui/icons` does not draw. They come from the app's shared glyphs
 * (components/UiGlyphs.tsx). They are decorative; the control holding one carries the
 * accessibility label.
 */

type GlyphProps = { color: string; size?: number };

/** Change deck. */
export function SelectionDeckIcon({ color, size = 20 }: GlyphProps) {
    return <DeckGlyph color={color} size={size} />;
}

/** Suspend, and the mark of a suspended card. */
export function SelectionSuspendIcon({ color, size = 20 }: GlyphProps) {
    return <PauseCircleGlyph color={color} size={size} />;
}

export function SelectionFlagIcon({ color, size = 20 }: GlyphProps) {
    return <FlagGlyph color={color} size={size} />;
}

/** Display order and reposition: items moving up and down a list. */
export function SortIcon({ color, size = 20 }: GlyphProps) {
    return <SortGlyph color={color} size={size} />;
}

export function TagIcon({ color, size = 20 }: GlyphProps) {
    return <TagGlyph color={color} size={size} />;
}

/** Bury: the card sleeps until tomorrow. */
export function BuryIcon({ color, size = 20 }: GlyphProps) {
    return <BuryGlyph color={color} size={size} />;
}

export function UndoIcon({ color, size = 20 }: GlyphProps) {
    return <UndoGlyph color={color} size={size} />;
}

export function SelectAllIcon({ color, size = 20 }: GlyphProps) {
    return <CheckSquareGlyph color={color} size={size} />;
}

/** Create filtered deck: a funnel over the collection. */
export function FilteredDeckIcon({ color, size = 20 }: GlyphProps) {
    return <FilterGlyph color={color} size={size} />;
}

/** Reset cards: back to the start, the same arrow as every other reset. */
export function ResetIcon({ color, size = 20 }: GlyphProps) {
    return <RotateLeftGlyph color={color} size={size} />;
}

export function TrashIcon({ color, size = 20 }: GlyphProps) {
    return <TrashGlyph color={color} size={size} />;
}
