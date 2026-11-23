import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppSheet } from '../ui/Sheet';
import { MenuItem } from '../ui/Menu';
import { EmptyState, LoadingState } from '../ui/Feedback';
import { Button } from '../ui/Button';
import { useI18n } from '../../hooks/useI18n';
import { ensureMediaDir, onMediaChanged, readWebMediaBlob } from '../../lib/mediaStore';
import { localMediaFilename } from '../../lib/mediaAttachment';
import { isPreviewableThumbnailFilename } from '../../lib/browserThumbnail';

export type BrowserImagePreview = { filename: string; showActions: boolean };
interface Props { image: BrowserImagePreview | null; onClose: () => void }

/** Both the long-press action and the full original stay in one sheet above the unchanged list. */
export function BrowserImagePreviewSheet({ image, onClose }: Props) {
    const { l } = useI18n();
    const [opened, setOpened] = useState<BrowserImagePreview | null>(null);
    const showImage = image !== null && (!image.showActions || opened === image);
    return (
        <AppSheet visible={image !== null} onClose={onClose} title={l('Görsel', 'Image')}>
            {image && !showImage ? (
                <MenuItem label={l('Görseli aç', 'Open image')} onPress={() => setOpened(image)} />
            ) : null}
            {image && showImage ? <OriginalImage key={image.filename} filename={image.filename} /> : null}
        </AppSheet>
    );
}

function OriginalImage({ filename }: { filename: string }) {
    const { l } = useI18n();
    const { height } = useWindowDimensions();
    const [revision, setRevision] = useState(0);
    const [source, setSource] = useState<{ uri: string } | null>(null);
    const [missing, setMissing] = useState(false);
    useEffect(() => onMediaChanged(names => {
        if (names.includes(filename)) setRevision(value => value + 1);
    }), [filename]);
    useEffect(() => {
        let active = true;
        let ownedUrl: string | null = null;
        setSource(null);
        setMissing(false);
        const load = async () => {
            // Only local raster references accepted by the thumbnail can reach this viewer.
            const safe = localMediaFilename(filename);
            if (!safe || safe !== filename || !isPreviewableThumbnailFilename(safe)) throw new Error('Invalid image');
            if (Platform.OS === 'web') {
                const blob = await readWebMediaBlob(safe);
                if (!active) return;
                if (!blob) throw new Error('Missing image');
                ownedUrl = URL.createObjectURL(blob);
                setSource({ uri: ownedUrl });
            } else {
                const dir = await ensureMediaDir();
                if (active) setSource({ uri: `${dir}${encodeURIComponent(safe)}` });
            }
        };
        void load().catch(() => { if (active) setMissing(true); });
        return () => {
            active = false;
            if (ownedUrl) URL.revokeObjectURL(ownedUrl);
        };
    }, [filename, revision]);

    return (
        <View style={[styles.preview, { height: Math.max(160, Math.min(560, height * 0.6)) }]}>
            {missing ? <EmptyState
                title={l('Görsel açılamadı', 'Could not open image')}
                body={l('Dosya bu cihazda bulunamıyor veya okunamıyor.', 'The file is missing or unreadable on this device.')}
                action={<Button label={l('Tekrar dene', 'Try again')} variant="plain" onPress={() => setRevision(value => value + 1)} />}
            /> : source ? <Image source={source} style={styles.image} resizeMode="contain"
                accessibilityLabel={l('Kartın görseli', 'Card image')} onError={() => setMissing(true)} />
                : <LoadingState label={l('Görsel açılıyor', 'Opening image')} />}
        </View>
    );
}

const styles = StyleSheet.create({
    preview: { width: '100%', justifyContent: 'center' },
    image: { width: '100%', height: '100%' },
});
