import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import {
    ArrowDownGlyph,
    ArrowLeftGlyph,
    ArrowRightGlyph,
    ArrowUpGlyph,
    CheckGlyph,
    ChevronDownGlyph,
    ChevronRightGlyph,
    ChevronUpGlyph,
    CloseGlyph,
    ExternalLinkGlyph,
    GripGlyph,
    MinusGlyph,
    MoreGlyph,
    MoreVerticalGlyph,
    PlusGlyph,
    RedoGlyph,
    RefreshGlyph,
    SearchGlyph,
    TrashGlyph,
    UndoGlyph,
} from '../UiGlyphs';

/**
 * The design system's control glyphs, so every screen draws the same mark the same way instead of
 * a text character (›, ×, ✓, ⌄, ⋮) at a size of its own. The drawings come from the app's one
 * icon system (components/icons/IconFrame.tsx, components/UiGlyphs.tsx): a 24-unit grid, round
 * caps and an optical stroke weight. These names and default sizes are the kit's API. They are
 * decorative: the control that holds one carries the accessibility label.
 */

export interface IconProps {
    color: string;
    size?: number;
}

/** Back: the header's left arrow, a little heavier than the other glyphs, as iOS draws its own. */
export function BackIcon({ color, size = 24 }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M15.5 4.75 8.25 12l7.25 7.25" {...outline(color, iconStroke(size, 1.15))} />
        </IconFrame>
    );
}

/** Forward: the mirror of `BackIcon`, for stepping through dates or pages. */
export function ForwardIcon({ color, size = 24 }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M8.5 4.75 15.75 12 8.5 19.25" {...outline(color, iconStroke(size, 1.15))} />
        </IconFrame>
    );
}

/** The trailing chevron of a row that opens something. */
export function ChevronRightIcon({ color, size = 18 }: IconProps) {
    return <ChevronRightGlyph color={color} size={size} />;
}

/** A value that opens a list to choose from, or a section that expands. */
export function ChevronDownIcon({ color, size = 18 }: IconProps) {
    return <ChevronDownGlyph color={color} size={size} />;
}

export function ChevronUpIcon({ color, size = 18 }: IconProps) {
    return <ChevronUpGlyph color={color} size={size} />;
}

export function CloseIcon({ color, size = 22 }: IconProps) {
    return <CloseGlyph color={color} size={size} />;
}

export function CheckIcon({ color, size = 20 }: IconProps) {
    return <CheckGlyph color={color} size={size} />;
}

export function PlusIcon({ color, size = 22 }: IconProps) {
    return <PlusGlyph color={color} size={size} />;
}

export function MinusIcon({ color, size = 22 }: IconProps) {
    return <MinusGlyph color={color} size={size} />;
}

/** More actions (•••). */
export function MoreIcon({ color, size = 24 }: IconProps) {
    return <MoreGlyph color={color} size={size} />;
}

/** More actions (⋮), for a menu that hangs from the right edge of a header. */
export function MoreVerticalIcon({ color, size = 24 }: IconProps) {
    return <MoreVerticalGlyph color={color} size={size} />;
}

export function SearchIcon({ color, size = 18 }: IconProps) {
    return <SearchGlyph color={color} size={size} />;
}

/** Reload what the screen shows. */
export function RefreshIcon({ color, size = 22 }: IconProps) {
    return <RefreshGlyph color={color} size={size} />;
}

/** Move an item up in an ordered list. */
export function ArrowUpIcon({ color, size = 20 }: IconProps) {
    return <ArrowUpGlyph color={color} size={size} />;
}

/** Move an item down in an ordered list. */
export function ArrowDownIcon({ color, size = 20 }: IconProps) {
    return <ArrowDownGlyph color={color} size={size} />;
}

/** Point left (a direction, e.g. a swipe gesture). */
export function ArrowLeftIcon({ color, size = 20 }: IconProps) {
    return <ArrowLeftGlyph color={color} size={size} />;
}

/** Point right (a direction, e.g. a swipe gesture). */
export function ArrowRightIcon({ color, size = 20 }: IconProps) {
    return <ArrowRightGlyph color={color} size={size} />;
}

/** Delete or clear. */
export function TrashIcon({ color, size = 20 }: IconProps) {
    return <TrashGlyph color={color} size={size} />;
}

export function UndoIcon({ color, size = 22 }: IconProps) {
    return <UndoGlyph color={color} size={size} />;
}

export function RedoIcon({ color, size = 22 }: IconProps) {
    return <RedoGlyph color={color} size={size} />;
}

/** Opens outside the app (a web page, the share sheet). */
export function ExternalLinkIcon({ color, size = 18 }: IconProps) {
    return <ExternalLinkGlyph color={color} size={size} />;
}

/** The handle a row is dragged by. */
export function DragHandleIcon({ color, size = 20 }: IconProps) {
    return <GripGlyph color={color} size={size} />;
}
