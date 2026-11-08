import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../../components/decorativeSvgProps';

/**
 * Browse's own glyphs: the selection bar's and the action menus' marks that the shared set in
 * `components/ui/icons` does not draw. They are decorative; the control holding one carries the
 * accessibility label.
 */

type GlyphProps = { color: string; size?: number };

function Glyph({ size = 20, children }: { size?: number; children: ReactNode }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            {children}
        </Svg>
    );
}

function line(color: string) {
    return { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
}

/** Change deck. */
export function SelectionDeckIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" stroke={color} strokeWidth={1.8} />
            <Path d="M8 9h8M8 13h8M8 17h5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </Glyph>
    );
}

/** Suspend, and the mark of a suspended card. */
export function SelectionSuspendIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Path
                d="M7 5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 11 5v14a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 19V5zm6 0a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5V5z"
                fill={color}
            />
        </Glyph>
    );
}

export function SelectionFlagIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Path d="M5 21V4m0 1h12.5a1 1 0 0 1 .8 1.6L16.2 9.5l2.1 2.9a1 1 0 0 1-.8 1.6H5" {...line(color)} fill={color} />
        </Glyph>
    );
}

/** Display order and reposition: items moving up and down a list. */
export function SortIcon({ color, size }: GlyphProps) {
    return <Glyph size={size}><Path d="M7.5 4v16M4 7.5 7.5 4 11 7.5M16.5 20V4M13 16.5l3.5 3.5 3.5-3.5" {...line(color)} /></Glyph>;
}

export function TagIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Path d="M3.5 4.5v6.6a1 1 0 0 0 .3.7l8.4 8.4a1 1 0 0 0 1.4 0l6.6-6.6a1 1 0 0 0 0-1.4L11.8 3.8a1 1 0 0 0-.7-.3H4.5a1 1 0 0 0-1 1Z" {...line(color)} />
            <Circle cx={8} cy={8} r={1.4} {...line(color)} />
        </Glyph>
    );
}

/** Bury: the card sleeps until tomorrow. */
export function BuryIcon({ color, size }: GlyphProps) {
    return <Glyph size={size}><Path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a8.3 8.3 0 1 0 10.2 10.2Z" {...line(color)} /></Glyph>;
}

export function UndoIcon({ color, size }: GlyphProps) {
    return <Glyph size={size}><Path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" {...line(color)} /></Glyph>;
}

export function SelectAllIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Rect x={3.5} y={3.5} width={17} height={17} rx={3.5} {...line(color)} />
            <Path d="m8 12.3 2.8 2.8 5.5-5.7" {...line(color)} />
        </Glyph>
    );
}

/** Create filtered deck: a funnel over the collection. */
export function FilteredDeckIcon({ color, size }: GlyphProps) {
    return <Glyph size={size}><Path d="M4 5h16l-6.2 7.3v5.4l-3.6 2V12.3L4 5Z" {...line(color)} /></Glyph>;
}

/** Reset cards: back to the start, the mirror of the shared refresh arrow. */
export function ResetIcon({ color, size }: GlyphProps) {
    return <Glyph size={size}><Path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4.2h4.2" {...line(color)} /></Glyph>;
}

export function TrashIcon({ color, size }: GlyphProps) {
    return (
        <Glyph size={size}>
            <Path
                d="M4.5 7h15M10 11v6M14 11v6M6 7l.9 11.3A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.7L18 7M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"
                {...line(color)}
            />
        </Glyph>
    );
}
