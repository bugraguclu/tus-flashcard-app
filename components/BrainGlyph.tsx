import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    strokeWidth?: number;
};

/** Memory and reviewing: a brain seen from above, two lobed hemispheres and a fold in each. */
export default function BrainGlyph({ color, size = 20, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path
                d="M12 5.25a3 3 0 0 0-5.6-1.1A3.25 3.25 0 0 0 4.5 9a3.5 3.5 0 0 0 .4 6.1 3.25 3.25 0 0 0 3.6 4.15A2.4 2.4 0 0 0 12 20.25M12 5.25a3 3 0 0 1 5.6-1.1A3.25 3.25 0 0 1 19.5 9a3.5 3.5 0 0 1-.4 6.1 3.25 3.25 0 0 1-3.6 4.15A2.4 2.4 0 0 1 12 20.25M12 5.25v15"
                {...outline(color, width)}
            />
            <Path d="M4.9 9.1c1.6.15 2.85 1.2 3.1 2.65M19.1 9.1c-1.6.15-2.85 1.2-3.1 2.65M8.5 19.25c-.1-1.6.6-2.8 1.9-3.4M15.5 19.25c.1-1.6-.6-2.8-1.9-3.4" {...outline(color, width)} />
        </IconFrame>
    );
}
