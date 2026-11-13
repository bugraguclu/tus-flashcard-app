import { Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Data and backups: an archive box with its lid and handle. */
export default function ArchiveBoxGlyph({ color, size = 20, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Rect x={3.5} y={4} width={17} height={4.75} rx={1.75} {...outline(color, width)} />
            <Path d="M5 8.75v9a2.75 2.75 0 0 0 2.75 2.75h8.5A2.75 2.75 0 0 0 19 17.75v-9M10 12.5h4" {...outline(color, width)} />
        </IconFrame>
    );
}
