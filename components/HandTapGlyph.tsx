import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
};

/** A clean Apple SF-style hand.tap glyph for touch controls and gestures. */
export default function HandTapGlyph({ color, size = 20 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
                d="M12 3a4 4 0 0 1 4 4v4.5M8 7a4 4 0 0 1 4-4"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
            <Path
                d="M12 11.5V6a2 2 0 0 0-4 0v7.5l-2.1-1.3a1.8 1.8 0 0 0-2.4.6 1.8 1.8 0 0 0 .5 2.4L9 19.5a5 5 0 0 0 3.2.9h3.8a5 5 0 0 0 5-5v-4.5a2 2 0 0 0-4 0v.5a2 2 0 0 0-3 0v.5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
