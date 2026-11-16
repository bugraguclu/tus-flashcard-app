import React from 'react';
import { type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import PressableScale from '../PressableScale';

type Props = {
    label: string;
    /** Spoken name of what the tap opens. */
    accessibilityLabel: string;
    /** Missing when the part names no deck that can be opened: it then stays plain text. */
    onPress?: () => void;
    textStyle: StyleProp<TextStyle>;
    /** How the part shares the row: the same flex rules the plain text would have had. */
    style?: StyleProp<ViewStyle>;
};

// The line is 28 pt tall; the slop brings each part to the 44 pt a finger needs.
const HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

/** One part of the study screen's "course › topic" line, which opens the deck it names. */
export default function CardContextCrumb({ label, accessibilityLabel, onPress, textStyle, style }: Props) {
    if (!onPress) return <Text style={[textStyle, style as StyleProp<TextStyle>]} numberOfLines={1}>{label}</Text>;
    return (
        <PressableScale
            style={style}
            onPress={onPress}
            hitSlop={HIT_SLOP}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            <Text style={textStyle} numberOfLines={1}>{label}</Text>
        </PressableScale>
    );
}
