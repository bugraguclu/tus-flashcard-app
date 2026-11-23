import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from './AppText';
import CardWebView from './CardWebView';
import { SheetNoDrag } from './SwipeDismissSheet';
import { EmptyState } from './ui/Feedback';
import { SegmentedControl } from './ui/Choice';
import { Radius } from './ui/tokens';
import { FontSize, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';

type CardProps = ComponentProps<typeof CardWebView>;
export interface CardPreviewPayload {
    noteType: CardProps['noteType'];
    note: CardProps['note'];
    card: CardProps['card'];
}
interface Props {
    payload: CardPreviewPayload | null;
    deck: CardProps['deck'];
    side: 'question' | 'answer';
    onSideChange: (side: 'question' | 'answer') => void;
    bodyHeight: number;
    audioPlaybackRate?: number;
    metaStyle?: StyleProp<TextStyle>;
    bodyStyle?: StyleProp<ViewStyle>;
    /** Let the contained card scroll without pulling a surrounding sheet. */
    inSheet?: boolean;
}

/** The editor and Browse render the same card templates, including every image on each side. */
export function CardPreviewContent({ payload, deck, side, onSideChange, bodyHeight,
    audioPlaybackRate = 1, metaStyle, bodyStyle, inSheet = false }: Props) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const Body = inSheet ? SheetNoDrag : View;
    return <>
        <Text style={metaStyle ?? [styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {deck?.name.replaceAll('::', ' › ') ?? '—'}
        </Text>
        <SegmentedControl
            options={[
                { value: 'question', label: l('Soru', 'Question') },
                { value: 'answer', label: l('Cevap', 'Answer') },
            ]}
            value={side}
            onChange={onSideChange}
            accessibilityLabel={l('Önizleme', 'Preview')}
        />
        <Body style={[bodyStyle ?? [styles.body, { backgroundColor: colors.bgSecondary, borderColor: colors.border }], { height: bodyHeight }]}>
            {payload ? <CardWebView
                noteType={payload.noteType}
                note={payload.note}
                card={payload.card}
                deck={deck}
                side={side}
                scrollMode="contained"
                maxHeight={bodyHeight}
                audioPlaybackRate={audioPlaybackRate}
            /> : <EmptyState title={l('Kart önizlenemedi.', 'Could not preview the card.')} />}
        </Body>
    </>;
}

const styles = StyleSheet.create({
    meta: { fontSize: FontSize.xs },
    body: { borderRadius: Radius.inset, overflow: 'hidden', borderWidth: 1 },
});
