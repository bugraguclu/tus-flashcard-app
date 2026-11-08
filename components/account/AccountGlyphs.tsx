import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/* Line icons for the account screens, drawn on a 24-point grid at a 1.8 stroke. */

interface GlyphProps {
    color: string;
    size?: number;
}

const stroke = (color: string) => ({
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
});

export function EyeGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...stroke(color)} />
            <Circle cx={12} cy={12} r={3} {...stroke(color)} />
        </Svg>
    );
}

export function EyeOffGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2" {...stroke(color)} />
            <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" {...stroke(color)} />
        </Svg>
    );
}

export function ArrowRightGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M5 12h14M13 6l6 6-6 6" {...stroke(color)} />
        </Svg>
    );
}

export function ChevronLeftGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M15 5l-7 7 7 7" {...stroke(color)} />
        </Svg>
    );
}

export function ChevronRightGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M9 5l7 7-7 7" {...stroke(color)} />
        </Svg>
    );
}

export function CloseGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M6 6l12 12M18 6L6 18" {...stroke(color)} />
        </Svg>
    );
}

export function CheckGlyph({ color, size = 16 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke(color)} strokeWidth={2.4} />
        </Svg>
    );
}

export function ShieldGlyph({ color, size = 16 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M12 21s7.5-3.6 7.5-9.5V5.8L12 3 4.5 5.8v5.7C4.5 17.4 12 21 12 21Z" {...stroke(color)} />
            <Path d="M9 12l2.2 2.2L15.2 10" {...stroke(color)} />
        </Svg>
    );
}

export function AlertGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Circle cx={12} cy={12} r={9} {...stroke(color)} />
            <Path d="M12 7.5v5.5" {...stroke(color)} strokeWidth={2.1} />
            <Circle cx={12} cy={16.3} r={1.1} fill={color} />
        </Svg>
    );
}

export function MailGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Rect x={3} y={5.5} width={18} height={13} rx={2.5} {...stroke(color)} />
            <Path d="M3.8 7l8.2 6 8.2-6" {...stroke(color)} />
        </Svg>
    );
}

export function PersonGlyph({ color, size = 22 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Circle cx={12} cy={8.5} r={3.8} {...stroke(color)} />
            <Path d="M4.5 20c.9-3.6 3.9-5.8 7.5-5.8s6.6 2.2 7.5 5.8" {...stroke(color)} />
        </Svg>
    );
}

export function KeyGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Circle cx={8} cy={15} r={4} {...stroke(color)} />
            <Path d="M10.9 12.1L20 3M16.5 6.5l2.5 2.5M14 9l2 2" {...stroke(color)} />
        </Svg>
    );
}

export function SignOutGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" {...stroke(color)} />
        </Svg>
    );
}

export function TrashGlyph({ color, size = 20 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7M10.2 11v6M13.8 11v6" {...stroke(color)} />
        </Svg>
    );
}

export function ClockGlyph({ color, size = 18 }: GlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Circle cx={12} cy={12} r={8.5} {...stroke(color)} />
            <Path d="M12 7.5V12l3 2" {...stroke(color)} />
        </Svg>
    );
}
