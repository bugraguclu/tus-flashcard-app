import { Circle, Path, Rect } from 'react-native-svg';
import BellGlyph from '../BellGlyph';
import { IconFrame } from '../icons/IconFrame';
import GearGlyph from '../GearGlyph';
import StatsGlyph from '../StatsGlyph';
import {
    BookGlyph,
    CheckGlyph,
    ChevronDownGlyph,
    ClockGlyph,
    CloseGlyph,
    HourglassGlyph,
    MinusGlyph,
    PauseGlyph,
    PlayGlyph,
    PlusCircleGlyph,
    PlusGlyph,
    SearchGlyph,
    StopGlyph,
    StopwatchGlyph,
} from '../UiGlyphs';

/**
 * The Kronometre's and the study calendar's icons. They are the app's shared glyphs under the
 * names these screens already use, drawn at 22 points unless a size is given; the control that
 * holds one carries the accessibility label.
 */

interface IconProps {
    color: string;
    size?: number;
}

const SIZE = 22;

export function BellIcon({ color, size = SIZE, muted = false }: IconProps & { muted?: boolean }) {
    return <BellGlyph color={color} size={size} muted={muted} />;
}

export function GearIcon({ color, size = SIZE }: IconProps) {
    return <GearGlyph color={color} size={size} />;
}

export function PlayIcon({ color, size = SIZE }: IconProps) {
    return <PlayGlyph color={color} size={size} />;
}

export function PauseIcon({ color, size = SIZE }: IconProps) {
    return <PauseGlyph color={color} size={size} />;
}

export function StopIcon({ color, size = SIZE }: IconProps) {
    return <StopGlyph color={color} size={size} />;
}

export function ClockIcon({ color, size = SIZE }: IconProps) {
    return <ClockGlyph color={color} size={size} />;
}

export function StopwatchIcon({ color, size = SIZE }: IconProps) {
    return <StopwatchGlyph color={color} size={size} />;
}

/** The Kronometre's own calendar: a page with two filled days, as it was drawn before. */
export function CalendarIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={3.8} y={5.2} width={16.4} height={15} rx={2.6} fill="none" stroke={color} strokeWidth={2} />
            <Path d="M3.8 10h16.4M8.2 3v4.2M15.8 3v4.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Rect x={7.4} y={13} width={3} height={3} rx={0.8} fill={color} />
            <Rect x={13.6} y={13} width={3} height={3} rx={0.8} fill={color} />
        </IconFrame>
    );
}

/** An hourglass with sand in both bulbs; `sandColor` tints the sand (the frame's colour if left out). */
export function HourglassIcon({ color, size = SIZE, sandColor = color }: IconProps & { sandColor?: string }) {
    return (
        <IconFrame size={size}>
            <Path d="M8.6 7.4h6.8c-.6 1.3-1.8 2.4-3.4 3.6-1.6-1.2-2.8-2.3-3.4-3.6z" fill={sandColor} />
            <Path d="M8.4 19.6c.5-1.9 1.7-3 3.6-4.2 1.9 1.2 3.1 2.3 3.6 4.2z" fill={sandColor} />
            <Path
                d="M7.8 3.4v2.8c0 2.2 1.6 3.6 4.2 5.8 2.6-2.2 4.2-3.6 4.2-5.8V3.4M7.8 20.6v-2.8c0-2.2 1.6-3.6 4.2-5.8 2.6 2.2 4.2 3.6 4.2 5.8v2.8"
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
            />
            <Path d="M6 3h12M6 21h12" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </IconFrame>
    );
}

export function PlusIcon({ color, size = SIZE }: IconProps) {
    return <PlusGlyph color={color} size={size} />;
}

export function MinusIcon({ color, size = SIZE }: IconProps) {
    return <MinusGlyph color={color} size={size} />;
}

/** A solid disc with the plus cut out, so it reads on any background. */
export function PlusCircleIcon({ color, size = SIZE }: IconProps) {
    return <PlusCircleGlyph color={color} size={size} />;
}

export function CheckIcon({ color, size = SIZE }: IconProps) {
    return <CheckGlyph color={color} size={size} />;
}

export function ChevronDownIcon({ color, size = SIZE }: IconProps) {
    return <ChevronDownGlyph color={color} size={size} />;
}

export function CloseIcon({ color, size = SIZE }: IconProps) {
    return <CloseGlyph color={color} size={size} />;
}

export function SearchIcon({ color, size = SIZE }: IconProps) {
    return <SearchGlyph color={color} size={size} />;
}

/** An open book: the running session's note. */
export function BookIcon({ color, size = SIZE }: IconProps) {
    return <BookGlyph color={color} size={size} />;
}

/** Three bars, the middle one tallest: the study tools button's glyph. */
export function AnalyticsIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Rect x={4} y={12} width={4.4} height={9} rx={1.4} fill={color} />
            <Rect x={9.8} y={4} width={4.4} height={17} rx={1.4} fill={color} />
            <Rect x={15.6} y={9} width={4.4} height={12} rx={1.4} fill={color} />
        </IconFrame>
    );
}

/** A line with three rows beside it: the Study Calendar's timeline, in its menu card and its link. */
export function TimelineListIcon({ color, size = SIZE }: IconProps) {
    return (
        <IconFrame size={size}>
            <Path d="M4.6 4v16" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={4.6} cy={6.2} r={1.9} fill={color} />
            <Circle cx={4.6} cy={12} r={1.9} fill={color} />
            <Circle cx={4.6} cy={17.8} r={1.9} fill={color} />
            <Rect x={8.6} y={3.8} width={12} height={4.8} rx={1.3} fill="none" stroke={color} strokeWidth={1.7} />
            <Rect x={8.6} y={9.6} width={12} height={4.8} rx={1.3} fill="none" stroke={color} strokeWidth={1.7} />
            <Rect x={8.6} y={15.4} width={12} height={4.8} rx={1.3} fill="none" stroke={color} strokeWidth={1.7} />
            <Path d="M11.4 6.2h3.8M11.4 12h3.8M11.4 17.8h3.8" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </IconFrame>
    );
}
