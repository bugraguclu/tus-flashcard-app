import { Circle, Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Accessibility: the universal figure, arms open, in a circle. */
export default function AccessibilityGlyph({ color, size = 20, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Circle cx={12} cy={12} r={9} {...outline(color, width)} />
            <Circle cx={12} cy={7.6} r={1.45} fill={color} />
            <Path d="M7.75 10.25 12 11l4.25-.75M12 11v3.25m-2.5 3.75 2.5-3.75 2.5 3.75" {...outline(color, width)} />
        </IconFrame>
    );
}
