import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
};

/** A clean Apple SF-style info.circle glyph. */
export default function InfoCircleGlyph({ color, size = 15 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" accessibilityElementsHidden>
            <Circle cx={10} cy={10} r={8.5} fill="none" stroke={color} strokeWidth={1.5} />
            <Circle cx={10} cy={6.5} r={1} fill={color} />
            <Path d="M10 9.5v4.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
    );
}
