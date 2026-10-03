import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

const FUR = '#ffffff';
const PATCH = '#2f3437';
const PINK = '#f2a7b5';

/**
 * A panda asleep on its front, drawn for the Kronometre's empty days. The outline keeps the white
 * fur visible on a light background as well as on a dark one.
 */
export default function SleepingPanda({ width = 120, snoreColor }: { width?: number; snoreColor: string }) {
    return (
        <Svg width={width} height={width * 0.75} viewBox="0 0 120 90" {...DECORATIVE_SVG_PROPS}>
            <Path d="M78 10h10l-10 11h10" fill="none" stroke={snoreColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M94 2h8l-8 9h8" fill="none" stroke={snoreColor} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />

            <Ellipse cx={72} cy={67} rx={36} ry={17} fill={FUR} stroke={PATCH} strokeWidth={1.6} />
            <Ellipse cx={95} cy={72} rx={12} ry={10} fill={PATCH} />
            <Ellipse cx={74} cy={80} rx={11} ry={6} fill={PATCH} />

            <Circle cx={24} cy={34} r={9} fill={PATCH} />
            <Circle cx={24} cy={34} r={4.2} fill={PINK} />
            <Circle cx={55} cy={31} r={9} fill={PATCH} />
            <Circle cx={55} cy={31} r={4.2} fill={PINK} />

            <Ellipse cx={40} cy={54} rx={26} ry={23} fill={FUR} stroke={PATCH} strokeWidth={1.6} />
            <Ellipse cx={30} cy={54} rx={7.5} ry={6} fill={PATCH} />
            <Ellipse cx={50} cy={54} rx={7.5} ry={6} fill={PATCH} />
            <Path d="M26 54.5q4 3 8 0M46 54.5q4 3 8 0" fill="none" stroke={FUR} strokeWidth={1.6} strokeLinecap="round" />
            <Ellipse cx={40} cy={63} rx={3.4} ry={2.4} fill={PATCH} />
            <Path d="M36.5 67.5q3.5 2.4 7 0" fill="none" stroke={PATCH} strokeWidth={1.4} strokeLinecap="round" />
            <Circle cx={24} cy={64} r={3.2} fill={PINK} opacity={0.75} />
            <Circle cx={56} cy={64} r={3.2} fill={PINK} opacity={0.75} />

            <Ellipse cx={26} cy={78} rx={10} ry={6} fill={PATCH} />
            <Ellipse cx={51} cy={80} rx={9} ry={5.5} fill={PATCH} />
        </Svg>
    );
}
