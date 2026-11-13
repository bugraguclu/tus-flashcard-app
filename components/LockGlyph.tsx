import { Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    /** Draws the shackle open, for content the learner has already unlocked. */
    open?: boolean;
    strokeWidth?: number;
};

/** Padlock used wherever purchased content is shown before it is owned. */
export default function LockGlyph({ color, size = 16, open = false, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d={open ? 'M8 11V8a4 4 0 0 1 7.75-1.4' : 'M8 11V8a4 4 0 1 1 8 0v3'} {...outline(color, width)} />
            <Rect x={5} y={11} width={14} height={9.5} rx={2.5} {...solid(color, width)} />
        </IconFrame>
    );
}
