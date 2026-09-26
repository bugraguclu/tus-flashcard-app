import Svg, { Circle, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../../components/decorativeSvgProps';

export function SearchIcon({ color }: { color: string }) {
    return (
        <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            {...DECORATIVE_SVG_PROPS}
        >
            <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={1.8} />
            <Path d="M15.4 15.4 21 21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
    );
}

export function SelectionDeckIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"
                stroke={color}
                strokeWidth={1.8}
            />
            <Path
                d="M8 9h8M8 13h8M8 17h5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
        </Svg>
    );
}

export function SelectionSuspendIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M7 5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 11 5v14a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 19V5zm6 0a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5V5z"
                fill={color}
            />
        </Svg>
    );
}

export function SelectionFlagIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M5 21V4m0 1h12.5a1 1 0 0 1 .8 1.6L16.2 9.5l2.1 2.9a1 1 0 0 1-.8 1.6H5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={color}
            />
        </Svg>
    );
}

export function SelectionMoreIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={5} r={2} fill={color} />
            <Circle cx={12} cy={12} r={2} fill={color} />
            <Circle cx={12} cy={19} r={2} fill={color} />
        </Svg>
    );
}
