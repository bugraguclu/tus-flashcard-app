import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '../constants/theme';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';

type Props = {
    /** The marked-note colour unless a caller tints it. */
    color?: string;
    size?: number;
    filled?: boolean;
};

/** A clean Apple SF-style star glyph for marked cards. */
export default function StarGlyph({ color, size = 16, filled = true }: Props) {
    const colors = useThemeColors();
    const tint = color ?? colors.marked;
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"
                fill={filled ? tint : 'none'}
                stroke={tint}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
