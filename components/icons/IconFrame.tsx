import type { ReactNode } from 'react';
import Svg from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/**
 * The app's icon system. Every glyph is drawn on a 24-unit grid with a 2-unit margin, in one
 * outline style: round caps and joins, rectangles of 16–18 units rounded by about 3, and a
 * stroke that keeps the same optical weight at every size (`iconStroke`). Filled glyphs are
 * kept for states (a selected flag, a marked card) and for small solid marks (play, dots);
 * they are painted with fill and the same stroke, so a filled glyph has exactly the outline
 * glyph's silhouette and the two can swap without the icon changing size.
 *
 * Glyphs are decorative: the control that holds one carries the accessibility label.
 */

export interface IconProps {
    color: string;
    size?: number;
    /** Stroke width in grid units; leave it out for the optical weight. */
    strokeWidth?: number;
}

/**
 * The stroke width, in grid units, that renders at a steady optical weight: 1.75 pt at 24 pt,
 * a little heavier relative to the glyph as it shrinks (never under 1.25 pt), and capped at
 * 2 pt on large glyphs. `weight` scales it for glyphs that need emphasis, such as chevrons.
 */
export function iconStroke(size: number, weight = 1): number {
    const points = Math.min(2, Math.max(1.25, 0.6 + size * 0.048));
    return Math.round(((points * 24) / size) * weight * 100) / 100;
}

/** Outline paint: the shared caps and joins, no fill. */
export function outline(color: string, strokeWidth: number) {
    return { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
}

/** Solid paint that keeps the outline's silhouette: fill plus the same rounded stroke. */
export function solid(color: string, strokeWidth: number) {
    return { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: color } as const;
}

export function IconFrame({ size, children }: { size: number; children: ReactNode }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            {children}
        </Svg>
    );
}
