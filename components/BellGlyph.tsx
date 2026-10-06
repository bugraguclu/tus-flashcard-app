import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style bell glyph for notifications. */
export default function BellGlyph({ color, size = 20, filled = false }: Props) {
    if (filled) {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
                <Path
                    d="M12 2a6 6 0 0 0-6 6c0 7-3 9-3 9h18s-3-2-3-9a6 6 0 0 0-6-6Zm-1.7 19a1.94 1.94 0 0 0 3.4 0h-3.4Z"
                    fill={color}
                />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
                d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path
                d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
