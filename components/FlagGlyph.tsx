import { Path } from 'react-native-svg';
import { useThemeColors } from '../constants/theme';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    /** The accent unless a caller tints it, usually with the flag's own colour. */
    color?: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

const CLOTH = 'M5.5 4.75C9.25 2.9 12 6.1 15.25 5.1c1.2-.37 2.2-.85 3.25-1.35v9.5c-1.05.5-2.05.98-3.25 1.35C12 15.6 9.25 12.4 5.5 14.25Z';

/** A card flag: a pennant on a pole, filled when the flag is set. */
export default function FlagGlyph({ color: tint, size = 16, filled = true, strokeWidth }: Props) {
    const colors = useThemeColors();
    const color = tint ?? colors.accent;
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d={CLOTH} {...(filled ? solid(color, width) : outline(color, width))} />
            <Path d="M5.5 4.75V21" {...outline(color, width)} />
        </IconFrame>
    );
}
