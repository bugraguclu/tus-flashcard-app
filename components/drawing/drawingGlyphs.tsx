import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

type GlyphProps = { color: string; size?: number };

/** One monochrome line icon on the 24-point grid the app's other glyphs use. */
function LineGlyph({ color, size = 22, d }: GlyphProps & { d: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export function PenGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m4 20 1.2-4.6L16.8 3.8a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4L8.6 18.8 4 20Zm11.4-14.8 3.4 3.4" />;
}

export function HighlighterGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m9 12-5 5v3h7l2-2M20.5 9.5l-6 6a1.6 1.6 0 0 1-2.2 0l-3.8-3.8a1.6 1.6 0 0 1 0-2.2l6-6M14 3.5l6.5 6.5" />;
}

export function EraserGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M8.5 20 3.7 15.2a1.5 1.5 0 0 1 0-2.1l9.4-9.4a1.5 1.5 0 0 1 2.1 0l5.1 5.1a1.5 1.5 0 0 1 0 2.1L12 19.2M8.5 20H20M8 9l7 7" />;
}

export function UndoGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />;
}

export function RedoGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m15 14 5-5-5-5m5 5H9.5a5.5 5.5 0 0 0 0 11H13" />;
}

export function ClearGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-12M10 11v6m4-6v6" />;
}

export function ChevronDownGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m7 10 5 5 5-5" />;
}
