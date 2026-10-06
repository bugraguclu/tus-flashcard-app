import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style rectangle.stack glyph for Browse / Cards. */
export default function CardsGlyph({ color, size = 20, filled = false }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
                d="M7 3h11a3 3 0 0 1 3 3v10"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
            <Rect
                x="3"
                y="7"
                width="14"
                height="14"
                rx="3"
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={1.8}
            />
        </Svg>
    );
}
