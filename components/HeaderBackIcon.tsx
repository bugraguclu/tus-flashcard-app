import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

export interface HeaderBackIconProps {
    color: string;
    size?: number;
}

/**
 * Standard iOS-style back chevron icon used in navigation headers across TusAnkiM.
 *
 * Mathematically centered along the vertical axis (y = 12 in a 24x24 viewBox)
 * to guarantee pixel-perfect vertical alignment with header title text.
 */
export function HeaderBackIcon({ color, size = 24 }: HeaderBackIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M15.5 19 8.5 12l7-7"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/**
 * Forward chevron matching `HeaderBackIcon` for bidirectional navigation strips.
 */
export function HeaderForwardIcon({ color, size = 24 }: HeaderBackIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M8.5 19l7-7-7-7"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export default HeaderBackIcon;
