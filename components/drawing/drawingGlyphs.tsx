import { Path } from 'react-native-svg';
import PencilGlyph from '../PencilGlyph';
import { IconFrame, iconStroke, outline, solid } from '../icons/IconFrame';
import { PhotoGlyph } from '../UiGlyphs';

type GlyphProps = { color: string; size?: number };

/** The drawing pad's tools, on the app's shared grid and stroke; 22 points by default. */

const SIZE = 22;

function LineGlyph({ color, size = SIZE, d }: GlyphProps & { d: string }) {
    return (
        <IconFrame size={size}>
            <Path d={d} {...outline(color, iconStroke(size))} />
        </IconFrame>
    );
}

export function PenGlyph({ color, size = SIZE }: GlyphProps) {
    return <PencilGlyph color={color} size={size} />;
}

export function HighlighterGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m9 12-5 5v3h7l2-2M20.5 9.5l-6 6a1.6 1.6 0 0 1-2.2 0l-3.8-3.8a1.6 1.6 0 0 1 0-2.2l6-6M14 3.5l6.5 6.5" />;
}

export function EraserGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M8.5 20 3.7 15.2a1.5 1.5 0 0 1 0-2.1l9.4-9.4a1.5 1.5 0 0 1 2.1 0l5.1 5.1a1.5 1.5 0 0 1 0 2.1L12 19.2M8.5 20H20M8 9l7 7" />;
}

/**
 * The bin a selected label or picture is deleted with. The kit's `TrashIcon` draws it; the old name
 * is kept for the selection frame. Undo and redo are the kit's `UndoIcon` and `RedoIcon`.
 */
export { TrashIcon as ClearGlyph } from '../ui/icons';

export function TextGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M5 6.25v-1.5h14v1.5M12 4.75v14.5M9.25 19.25h5.5" />;
}

export function ArrowGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M5 19 19 5m0 0h-7.5M19 5v7.5" />;
}

const RECT = 'M6 6.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z';

export function RectGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={RECT} />;
}

export function EllipseGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M3.5 12a8.5 6 0 1 0 17 0 8.5 6 0 1 0-17 0" />;
}

/** A solid block: cover part of the drawing. */
export function CoverGlyph({ color, size = SIZE }: GlyphProps) {
    return (
        <IconFrame size={size}>
            <Path d={RECT} {...solid(color, iconStroke(size))} />
        </IconFrame>
    );
}

export function ImageGlyph({ color, size = SIZE }: GlyphProps) {
    return <PhotoGlyph color={color} size={size} />;
}
