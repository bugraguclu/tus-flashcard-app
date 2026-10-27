import Svg, { Path } from 'react-native-svg';

/** The reviewer toolbar's line icons. */

export function DownChevron({ color }: { color: string }) {
    return (
        <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path
                d="M3 5.25 7 9l4-3.75"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export function ReviewerBackIcon({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
                d="M15 4 7 12l8 8"
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** AnkiDroid-style reviewer action: reverse the most recent grading operation. */
export function UndoReviewIcon({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
                d="M9 7H4V2M4.5 7A8 8 0 1 1 6 18"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export function ReviewerSettingsIcon({ color }: { color: string }) {
    return (
        <Svg width={21} height={21} viewBox="0 0 24 24">
            <Path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
            />
            <Path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
