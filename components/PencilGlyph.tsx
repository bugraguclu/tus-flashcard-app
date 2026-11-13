import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Edit: a pencil at forty-five degrees, its point sharpened off the body. */
export default function PencilGlyph({ color, size = 24, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path
                d="M4.5 19.5l1.1-4.4L15.85 4.85a1.8 1.8 0 0 1 2.55 0l.75.75a1.8 1.8 0 0 1 0 2.55L8.9 18.4ZM5.6 15.1l3.3 3.3M14.1 6.6l3.3 3.3"
                {...outline(color, width)}
            />
        </IconFrame>
    );
}
