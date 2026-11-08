import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/**
 * The app's control glyphs, drawn once on a 24-unit grid with round caps. Arrows and chevrons use
 * a 2.4 stroke, the close, check, plus and minus marks 2.2, so every screen draws the same mark
 * the same way instead of a text character (›, ×, ✓, ⌄, ⋮) at a size of its own. They are
 * decorative: the control that holds one carries the accessibility label.
 */

export interface IconProps {
    color: string;
    size?: number;
}

function Frame({ size, children }: { size: number; children: React.ReactNode }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            {children}
        </Svg>
    );
}

const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Back: the header's left arrow. */
export function BackIcon({ color, size = 24 }: IconProps) {
    return <Frame size={size}><Path d="M15.5 19 8.5 12l7-7" stroke={color} strokeWidth={2.4} {...ROUND} /></Frame>;
}

/** Forward: the mirror of `BackIcon`, for stepping through dates or pages. */
export function ForwardIcon({ color, size = 24 }: IconProps) {
    return <Frame size={size}><Path d="M8.5 19l7-7-7-7" stroke={color} strokeWidth={2.4} {...ROUND} /></Frame>;
}

/** The trailing chevron of a row that opens something. */
export function ChevronRightIcon({ color, size = 18 }: IconProps) {
    return <Frame size={size}><Path d="M9.5 6l6 6-6 6" stroke={color} strokeWidth={2.4} {...ROUND} /></Frame>;
}

/** A value that opens a list to choose from, or a section that expands. */
export function ChevronDownIcon({ color, size = 18 }: IconProps) {
    return <Frame size={size}><Path d="M6 9.5l6 6 6-6" stroke={color} strokeWidth={2.4} {...ROUND} /></Frame>;
}

export function ChevronUpIcon({ color, size = 18 }: IconProps) {
    return <Frame size={size}><Path d="M6 14.5l6-6 6 6" stroke={color} strokeWidth={2.4} {...ROUND} /></Frame>;
}

export function CloseIcon({ color, size = 22 }: IconProps) {
    return <Frame size={size}><Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

export function CheckIcon({ color, size = 20 }: IconProps) {
    return <Frame size={size}><Path d="M5.5 12.6l4.2 4.2 8.8-9.6" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

export function PlusIcon({ color, size = 22 }: IconProps) {
    return <Frame size={size}><Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

export function MinusIcon({ color, size = 22 }: IconProps) {
    return <Frame size={size}><Path d="M5 12h14" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

/** More actions (•••). */
export function MoreIcon({ color, size = 24 }: IconProps) {
    return (
        <Frame size={size}>
            <Circle cx={5.5} cy={12} r={1.8} fill={color} />
            <Circle cx={12} cy={12} r={1.8} fill={color} />
            <Circle cx={18.5} cy={12} r={1.8} fill={color} />
        </Frame>
    );
}

/** More actions (⋮), for a menu that hangs from the right edge of a header. */
export function MoreVerticalIcon({ color, size = 24 }: IconProps) {
    return (
        <Frame size={size}>
            <Circle cx={12} cy={5.5} r={1.8} fill={color} />
            <Circle cx={12} cy={12} r={1.8} fill={color} />
            <Circle cx={12} cy={18.5} r={1.8} fill={color} />
        </Frame>
    );
}

export function SearchIcon({ color, size = 18 }: IconProps) {
    return (
        <Frame size={size}>
            <Circle cx={10.5} cy={10.5} r={6.2} stroke={color} strokeWidth={2} />
            <Path d="M15.2 15.2l4.6 4.6" stroke={color} strokeWidth={2.2} {...ROUND} />
        </Frame>
    );
}

/** Reload what the screen shows. */
export function RefreshIcon({ color, size = 22 }: IconProps) {
    return (
        <Frame size={size}>
            <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke={color} strokeWidth={2} {...ROUND} />
            <Path d="M19.5 4.5v4.2h-4.2" stroke={color} strokeWidth={2} {...ROUND} />
        </Frame>
    );
}

/** Move an item up in an ordered list. */
export function ArrowUpIcon({ color, size = 20 }: IconProps) {
    return <Frame size={size}><Path d="M12 19V5M6 11l6-6 6 6" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

/** Move an item down in an ordered list. */
export function ArrowDownIcon({ color, size = 20 }: IconProps) {
    return <Frame size={size}><Path d="M12 5v14M6 13l6 6 6-6" stroke={color} strokeWidth={2.2} {...ROUND} /></Frame>;
}

/** Opens outside the app (a web page, the share sheet). */
export function ExternalLinkIcon({ color, size = 18 }: IconProps) {
    return (
        <Frame size={size}>
            <Path d="M14 5h5v5M19 5l-8 8" stroke={color} strokeWidth={2} {...ROUND} />
            <Path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={2} {...ROUND} />
        </Frame>
    );
}

/** The handle a row is dragged by. */
export function DragHandleIcon({ color, size = 20 }: IconProps) {
    return <Frame size={size}><Path d="M5 8h14M5 12h14M5 16h14" stroke={color} strokeWidth={2} {...ROUND} /></Frame>;
}
