import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    color?: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style flame glyph for study streak. */
export default function FlameGlyph({ color = '#f59e0b', size = 18, filled = true }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
                d="M12 2c-.5 2.5-2 4.5-3.5 6.5C7 10.5 6 12.5 6 15a6 6 0 0 0 12 0c0-3.5-2-6-4-8.5-.5 2-2 3.5-3 4.5C11 9 11.5 5 12 2z"
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={filled ? 0 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
