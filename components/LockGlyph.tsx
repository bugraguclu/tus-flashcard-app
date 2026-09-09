import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
    color: string;
    size?: number;
    /** Draws the shackle open, for content the learner has already unlocked. */
    open?: boolean;
};

/** Padlock used wherever purchased content is shown before it is owned. */
export default function LockGlyph({ color, size = 16, open = false }: Props) {
    const scale = size / 16;
    return (
        <Svg width={size} height={size * 1.125} viewBox="0 0 16 18" accessibilityElementsHidden>
            <Path
                d={open ? 'M5 7V5a3 3 0 0 1 5.9-.75' : 'M5 7V5a3 3 0 0 1 6 0v2'}
                fill="none"
                stroke={color}
                strokeWidth={1.6 / scale > 2.4 ? 2.4 : 1.6}
                strokeLinecap="round"
            />
            <Rect x="2.5" y="7" width="11" height="8.5" rx="2" fill={color} />
        </Svg>
    );
}
