import { Path } from 'react-native-svg';
import { useThemeColors } from '../constants/theme';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';
import { star } from './icons/iconGeometry';

type Props = {
    /** The marked-note colour unless a caller tints it. */
    color?: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

const STAR = star(12, 12.85, 9.5, 4.6);

/** A marked card: a five-point star with softened points. */
export default function StarGlyph({ color: tint, size = 16, filled = true, strokeWidth }: Props) {
    const colors = useThemeColors();
    const color = tint ?? colors.marked;
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d={STAR} {...(filled ? solid(color, width) : outline(color, width))} />
        </IconFrame>
    );
}
