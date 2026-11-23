import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { AppSheet } from '../ui/Sheet';
import { CardPreviewContent, type CardPreviewPayload } from '../CardPreviewContent';
import type { Deck } from '../../lib/models';
import { useI18n } from '../../hooks/useI18n';

interface Props {
    visible: boolean;
    payload: CardPreviewPayload | null;
    deck: Deck | null;
    audioPlaybackRate: number;
    onClose: () => void;
}

/** A thumbnail opens both card faces directly above the unchanged Browser. */
export function BrowserImagePreviewSheet({ visible, payload, deck, audioPlaybackRate, onClose }: Props) {
    const { l } = useI18n();
    const { height } = useWindowDimensions();
    return (
        <AppSheet visible={visible} onClose={onClose} title={l('Önizleme', 'Preview')}>
            {visible ? <BrowserCardPreview key={payload?.card.id ?? 'missing'}
                payload={payload} deck={deck} audioPlaybackRate={audioPlaybackRate}
                bodyHeight={Math.max(160, Math.min(560, height * 0.6))} /> : null}
        </AppSheet>
    );
}

function BrowserCardPreview(props: Pick<Props, 'payload' | 'deck' | 'audioPlaybackRate'> & { bodyHeight: number }) {
    const [side, setSide] = useState<'question' | 'answer'>('question');
    return <CardPreviewContent {...props} inSheet side={side} onSideChange={setSide} />;
}
