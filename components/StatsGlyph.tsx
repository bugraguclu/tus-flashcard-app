import { Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

/** The three bars of the statistics chart, shared by every analytics control. */
const STATS_BARS = [
    { x: 3.5, y: 12, height: 8.5 },
    { x: 10.2, y: 4.5, height: 16 },
    { x: 16.9, y: 8.75, height: 11.75 },
] as const;

/** Statistics: three rounded bars of different heights. */
export default function StatsGlyph({ color, size = 20, filled = false, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    const paint = filled ? solid(color, width) : outline(color, width);
    return (
        <IconFrame size={size}>
            {STATS_BARS.map((bar) => (
                <Rect key={bar.x} x={bar.x} y={bar.y} width={3.6} height={bar.height} rx={1.2} {...paint} />
            ))}
        </IconFrame>
    );
}
