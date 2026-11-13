import { Line, Path, Rect } from 'react-native-svg';
import { IconFrame } from './icons/IconFrame';

export interface CalendarGlyphProps {
    color?: string;
    size?: number;
}

/**
 * A calendar page: binder pins, a header rule and two rows of days. The user preferred this
 * original drawing to the redrawn one, so it keeps its own stroke weights.
 */
export default function CalendarGlyph({ color = 'currentColor', size = 20 }: CalendarGlyphProps) {
    return (
        <IconFrame size={size}>
            <Rect x={3} y={5} width={18} height={16} rx={3.5} stroke={color} strokeWidth={1.8} />
            <Line x1={3} y1={10} x2={21} y2={10} stroke={color} strokeWidth={1.5} />
            <Path d="M8 2.5v3M16 2.5v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Path
                d="M7.5 14h1M11.5 14h1M15.5 14h1M7.5 17.5h1M11.5 17.5h1M15.5 17.5h1"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
        </IconFrame>
    );
}
