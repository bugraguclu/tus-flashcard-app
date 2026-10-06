import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    color?: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style star glyph for marked cards. */
export default function StarGlyph({ color = '#f59e0b', size = 16, filled = true }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
                d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
