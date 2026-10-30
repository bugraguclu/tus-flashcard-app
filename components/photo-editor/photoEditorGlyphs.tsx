import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

type GlyphProps = { color: string; size?: number };

/** A circle as path data, so a glyph can be one path. */
function circle(cx: number, cy: number, r: number): string {
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** One monochrome line icon on the 24-point grid the drawing pad's glyphs use. */
function LineGlyph({ color, size = 22, d }: GlyphProps & { d: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export function CropGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M6.5 2.5v13a2 2 0 0 0 2 2h13M2.5 6.5h13a2 2 0 0 1 2 2v13" />;
}

export function AdjustGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={`M3.5 7h7m5 0h5M3.5 17h3m5 0h9${circle(13, 7, 2.5)}${circle(9, 17, 2.5)}`} />;
}

export function RotateLeftGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M6.3 6.3A8 8 0 1 1 4 12M10.3 6.3h-4v-4" />;
}

export function RotateRightGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M17.7 6.3A8 8 0 1 0 20 12M13.7 6.3h4v-4" />;
}

export function MirrorGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 3v2.5m0 3v2.5m0 3v2.5m0 3V21M9 6.5v11H3.5ZM15 6.5v11h5.5Z" />;
}

/** Back to the photo as it was picked: a turn back around a clock face. */
export function RevertGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6M4 4v4.6h4.6M12 8v4.2l2.8 1.8" />;
}

export function FiltersGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={`${circle(12, 8.5, 4.5)}${circle(8.5, 14.5, 4.5)}${circle(15.5, 14.5, 4.5)}`} />;
}

export function BrightnessGlyph(props: GlyphProps) {
    return (
        <LineGlyph
            {...props}
            d={`${circle(12, 12, 3.6)}M12 2.8v2.2m0 14v2.2M2.8 12H5m14 0h2.2M5.5 5.5l1.6 1.6m9.8 9.8 1.6 1.6M5.5 18.5l1.6-1.6m9.8-9.8 1.6-1.6`}
        />
    );
}

export function ContrastGlyph({ color, size = 22 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path d={circle(12, 12, 8.2)} stroke={color} strokeWidth={1.8} />
            <Path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill={color} />
        </Svg>
    );
}

export function SaturationGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 3.2s6.2 6.6 6.2 10.9a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2ZM9 14.6a3 3 0 0 0 3 3" />;
}

export function WarmthGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0ZM12 10.5v6M17 5h2.5M17 8.5h2.5" />;
}
