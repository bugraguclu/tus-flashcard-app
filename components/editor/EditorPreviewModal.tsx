import { CardPreviewContent, type CardPreviewPayload } from '../CardPreviewContent';
import type { ComponentProps } from 'react';
import CardWebView from '../CardWebView';
import { AppDialog } from '../ui/Dialog';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

type CardWebViewProps = ComponentProps<typeof CardWebView>;

export type EditorPreviewPayload = CardPreviewPayload;

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
            <CardPreviewContent payload={payload} deck={deck} side={side}
                onSideChange={onSideChange} bodyHeight={bodyHeight} audioPlaybackRate={audioPlaybackRate}
                metaStyle={styles.previewMeta} bodyStyle={styles.previewBody} />
        </AppDialog>
    );
}
