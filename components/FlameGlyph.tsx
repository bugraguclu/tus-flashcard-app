import { Path } from 'react-native-svg';
import { useThemeColors } from '../constants/theme';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    /** The streak colour unless a caller tints it. */
    color?: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

const OUTER = 'M12 21.25C8.6 21.25 5.75 18.6 5.75 15c0-2.4 1-4.4 2.25-5.9.6 1.5 1.6 2.3 2.6 2.5-.6-3.4.4-6.6 2.4-8.85 3.4 2.65 5.25 6.85 5.25 12 0 3.75-2.85 6.5-6.25 6.5Z';
const INNER = 'M12 21.25c-1.75 0-3-1.2-3-2.85 0-1.9 1.55-3.05 3-4.9 1.45 1.85 3 3 3 4.9 0 1.65-1.25 2.85-3 2.85Z';

/** The study streak: a flame with an inner tongue. */
export default function FlameGlyph({ color: tint, size = 18, filled = true, strokeWidth }: Props) {
    const colors = useThemeColors();
    const color = tint ?? colors.streak;
    const width = strokeWidth ?? iconStroke(size);
    if (filled) return <IconFrame size={size}><Path d={OUTER} {...solid(color, width)} /></IconFrame>;
    return (
        <IconFrame size={size}>
            <Path d={OUTER} {...outline(color, width)} />
            <Path d={INNER} {...outline(color, width)} />
        </IconFrame>
    );
}
