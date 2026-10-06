import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
};

/** A clean Apple SF-style accessibility glyph. */
export default function AccessibilityGlyph({ color, size = 20 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
            <Circle cx="12" cy="8" r="1.5" fill={color} />
            <Path
                d="M7 11.5h10M12 11.5v4m-2 3.5 2-3.5 2 3.5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
