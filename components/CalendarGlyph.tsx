import React from 'react';
import Svg, { Path, Rect, Line } from 'react-native-svg';

export interface CalendarGlyphProps {
    color?: string;
    size?: number;
}

/**
 * Apple SF Symbols 'calendar' style vector glyph.
 */
export default function CalendarGlyph({
    color = 'currentColor',
    size = 20,
}: CalendarGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            {/* Calendar body */}
            <Rect
                x="3"
                y="5"
                width="18"
                height="16"
                rx="3.5"
                stroke={color}
                strokeWidth="1.8"
            />
            {/* Header divider line */}
            <Line
                x1="3"
                y1="10"
                x2="21"
                y2="10"
                stroke={color}
                strokeWidth="1.5"
            />
            {/* Binder pins */}
            <Line
                x1="8"
                y1="2.5"
                x2="8"
                y2="5.5"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <Line
                x1="16"
                y1="2.5"
                x2="16"
                y2="5.5"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            {/* Grid dots/marks */}
            <Path
                d="M7.5 14h1M11.5 14h1M15.5 14h1M7.5 17.5h1M11.5 17.5h1M15.5 17.5h1"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </Svg>
    );
}
