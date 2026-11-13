import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    expanded: boolean;
    color: string;
    size?: number;
};

/** A geometrically centred disclosure arrow shared by deck trees. */
export default function DisclosureChevron({ expanded, color, size = 20 }: Props) {
    return (
        <IconFrame size={size}>
            <Path d={expanded ? 'M6.5 9.25 12 14.75l5.5-5.5' : 'M9.25 6.5 14.75 12l-5.5 5.5'} {...outline(color, iconStroke(size, 1.15))} />
        </IconFrame>
    );
}
