import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import {
    CropGlyph as SharedCrop,
    HistoryGlyph,
    RotateLeftGlyph as SharedRotateLeft,
    RotateRightGlyph as SharedRotateRight,
    SlidersGlyph,
} from '../UiGlyphs';

type GlyphProps = { color: string; size?: number };

/** A circle as path data, so a glyph can be one path. */
function circle(cx: number, cy: number, r: number): string {
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** The photo editor's tools, on the app's shared grid and stroke; 22 points by default. */
const SIZE = 22;

function LineGlyph({ color, size = SIZE, d }: GlyphProps & { d: string }) {
    return (
        <IconFrame size={size}>
            <Path d={d} {...outline(color, iconStroke(size))} />
        </IconFrame>
    );
}

export function CropGlyph({ color, size = SIZE }: GlyphProps) {
    return <SharedCrop color={color} size={size} />;
}

export function AdjustGlyph({ color, size = SIZE }: GlyphProps) {
    return <SlidersGlyph color={color} size={size} />;
}

export function RotateLeftGlyph({ color, size = SIZE }: GlyphProps) {
    return <SharedRotateLeft color={color} size={size} />;
}

export function RotateRightGlyph({ color, size = SIZE }: GlyphProps) {
    return <SharedRotateRight color={color} size={size} />;
}

export function MirrorGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 3v2.5m0 3v2.5m0 3v2.5m0 3V21M9 6.5v11H3.5ZM15 6.5v11h5.5Z" />;
}

/** Back to the photo as it was picked: a clock turned back. */
export function RevertGlyph({ color, size = SIZE }: GlyphProps) {
    return <HistoryGlyph color={color} size={size} />;
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

export function ContrastGlyph({ color, size = SIZE }: GlyphProps) {
    return (
        <IconFrame size={size}>
            <Path d={circle(12, 12, 8.5)} {...outline(color, iconStroke(size))} />
            <Path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill={color} />
        </IconFrame>
    );
}

export function SaturationGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 3.2s6.2 6.6 6.2 10.9a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2ZM9 14.6a3 3 0 0 0 3 3" />;
}

export function WarmthGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0ZM12 10.5v6M17 5h2.5M17 8.5h2.5" />;
}
