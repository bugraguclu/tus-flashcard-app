import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import CardWebView from '../CardWebView';
import { AppDialog } from '../ui/Dialog';
import { SegmentedControl } from '../ui/Choice';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

type CardWebViewProps = ComponentProps<typeof CardWebView>;

/** The unsaved note rendered as a card, with the note, card and note type it would produce. */
export interface EditorPreviewPayload {
    noteType: CardWebViewProps['noteType'];
    note: CardWebViewProps['note'];
    card: CardWebViewProps['card'];
}

interface EditorPreviewModalProps extends EditorI18n {
    visible: boolean;
    deck: CardWebViewProps['deck'];
    side: 'question' | 'answer';
    onSideChange: (side: 'question' | 'answer') => void;
    payload: EditorPreviewPayload | null;
    bodyHeight: number;
    audioPlaybackRate: number;
    onClose: () => void;
    styles: EditorStyles;
}

/** Shows the note being written as the reviewer will render it, question or answer side. */
export function EditorPreviewModal({
    visible,
    deck,
    side,
    onSideChange,
    payload,
    bodyHeight,
    audioPlaybackRate,
    onClose,
    styles,
    l,
}: EditorPreviewModalProps) {
    return (
        <AppDialog visible={visible} onClose={onClose} title={l('Önizleme', 'Preview')} closeButton>
            <Text style={styles.previewMeta} numberOfLines={1}>
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
            <View style={[styles.previewBody, { height: bodyHeight }]}>
                {payload && (
                    <CardWebView
                        noteType={payload.noteType}
                        note={payload.note}
                        card={payload.card}
                        deck={deck}
                        side={side}
                        scrollMode="contained"
                        maxHeight={bodyHeight}
                        audioPlaybackRate={audioPlaybackRate}
                    />
                )}
            </View>
        </AppDialog>
    );
}
