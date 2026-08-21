import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    expanded: boolean;
    color: string;
    size?: number;
};

/** A geometrically centred disclosure arrow shared by deck trees. */
export default function DisclosureChevron({ expanded, color, size = 20 }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" accessibilityElementsHidden>
            <Path
                d={expanded ? 'M5.5 7.5 10 12l4.5-4.5' : 'M7.5 5.5 12 10l-4.5 4.5'}
                fill="none"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
