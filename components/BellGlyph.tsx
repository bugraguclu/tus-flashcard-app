import { Path } from 'react-native-svg';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
    /** Crosses the bell out, for alerts that are switched off. */
    muted?: boolean;
    strokeWidth?: number;
};

const BELL = 'M6.75 9.5a5.25 5.25 0 0 1 10.5 0v3.1c0 .95.3 1.85.85 2.55l1.2 1.5a.45.45 0 0 1-.35.75H5.05a.45.45 0 0 1-.35-.75l1.2-1.5c.55-.7.85-1.6.85-2.55Z';
const CLAPPER = 'M10 19.5a2 2 0 0 0 4 0';
/** The bell outline's length and where the mute slash crosses it, measured along the path. */
const BELL_LENGTH = 48.01;
const SLASH_CROSSINGS = [2.53, 27.18] as const;

/** Dashes that open the bell outline where the slash passes, leaving a clear gap either side. */
function muteGaps(width: number) {
    const half = 0.9 + 1.2 * width;
    const [first, second] = SLASH_CROSSINGS;
    return {
        strokeDasharray: [second - first - 2 * half, 2 * half, BELL_LENGTH - (second - first) - 2 * half, 2 * half],
        strokeDashoffset: BELL_LENGTH - first - half,
    };
}

/** Notifications: a bell with its clapper; crossed out when muted. */
export default function BellGlyph({ color, size = 20, filled = false, muted = false, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d={BELL} {...(filled && !muted ? solid(color, width) : outline(color, width))} {...(muted ? muteGaps(width) : null)} />
            <Path d={CLAPPER} {...outline(color, width)} />
            {muted && <Path d="M4 3.5 20 20.5" {...outline(color, width)} />}
        </IconFrame>
    );
}
