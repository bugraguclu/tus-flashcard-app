import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { alert } from '../lib/confirm';
import { attachmentDisplayName, canPreviewAttachment } from '../lib/attachmentKind';
import { getLegacyFileSystem, shareOrDownloadFileWeb } from '../lib/files';
import { getMediaBaseUrl, guessMimeFromFilename, readMediaBytes } from '../lib/mediaStore';
import { DocumentIcon, ShareIcon } from './editor/AttachmentIcons';
import { Button, IconButton } from './ui/Button';
import { EmptyState } from './ui/Feedback';
import { Radius, Type } from './ui/tokens';

/** Where a stored attachment is read from on native, as a URL a WebView can load. */
function attachmentFileUri(filename: string): string {
    return `${getMediaBaseUrl()}${encodeURIComponent(filename)}`;
}

function decodedUrl(url: string): string {
    try {
        return decodeURIComponent(url);
    } catch {
        return url;
    }
}

/**
 * Hand the file to the iOS share sheet under the name the person gave it, so "Save to Files"
 * or another app receives `Kardiyoloji notları.pdf` rather than its timestamped stored name.
 */
async function shareAttachment(filename: string): Promise<void> {
    const fs = getLegacyFileSystem();
    const folder = `${fs.cacheDirectory ?? ''}attachment-share/`;
    await fs.makeDirectoryAsync(folder, { intermediates: true });
    const copy = `${folder}${encodeURIComponent(attachmentDisplayName(filename))}`;
    await fs.deleteAsync(copy, { idempotent: true });
    await fs.copyAsync({ from: attachmentFileUri(filename), to: copy });
    await Sharing.shareAsync(copy, {
        mimeType: guessMimeFromFilename(filename) || undefined,
        dialogTitle: attachmentDisplayName(filename),
    });
}

/** The browser has no viewer of its own to offer: the file is shared or downloaded. */
async function openWebAttachment(filename: string): Promise<boolean> {
    const bytes = await readMediaBytes(filename);
    if (!bytes) return false;
    await shareOrDownloadFileWeb(
        attachmentDisplayName(filename),
        bytes,
        guessMimeFromFilename(filename) || 'application/octet-stream',
    );
    return true;
}

interface AttachmentViewerProps {
    filename: string | null;
    onClose: () => void;
}

/**
 * A file attached to a note, opened from its link on the card: shown in place when iOS can draw
 * it (PDF, Office and iWork documents, pictures, text), with Share for everything else.
 */
function AttachmentViewer({ filename, onClose }: AttachmentViewerProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [missing, setMissing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const name = filename ? attachmentDisplayName(filename) : '';
    const uri = filename ? attachmentFileUri(filename) : '';

    useEffect(() => {
        if (!filename) return;
        let cancelled = false;
        setMissing(false);
        getLegacyFileSystem().getInfoAsync(attachmentFileUri(filename))
            .then((info) => { if (!cancelled) setMissing(!info.exists); })
            .catch(() => { if (!cancelled) setMissing(true); });
        return () => { cancelled = true; };
    }, [filename]);

    const share = async () => {
        if (!filename || sharing) return;
        setSharing(true);
        try {
            await shareAttachment(filename);
        } catch (error) {
            console.warn('[AttachmentViewer] share failed:', error);
            alert(l('Paylaşılamadı', 'Could not share'), l('Dosya paylaşılamadı.', 'The file could not be shared.'));
        } finally {
            setSharing(false);
        }
    };

    let body: ReactNode;
    if (missing) {
        body = (
            <EmptyState
                icon={<DocumentIcon color={colors.textMuted} size={44} />}
                title={l('Dosya bulunamadı', 'File not found')}
                body={l('Bu bağlantının dosyası bu cihazda yok.', 'The file this link points to is not on this device.')}
                style={styles.notice}
            />
        );
    } else if (filename && canPreviewAttachment(filename)) {
        body = (
            <WebView
                source={{ uri }}
                originWhitelist={['file://*']}
                // Read access to this one file only; the page cannot reach the rest of the media.
                allowingReadAccessToURL={uri}
                allowFileAccess
                javaScriptEnabled={false}
                onShouldStartLoadWithRequest={(request) => decodedUrl(request.url) === decodedUrl(uri)}
                incognito
                cacheEnabled={false}
                setSupportMultipleWindows={false}
                allowsLinkPreview={false}
                dataDetectorTypes="none"
                allowsInlineMediaPlayback
                style={styles.preview}
            />
        );
    } else {
        body = (
            <EmptyState
                icon={<DocumentIcon color={colors.accent} size={44} />}
                title={name}
                body={l('Bu dosya burada gösterilemiyor; başka bir uygulamada açabilirsiniz.', 'This file cannot be shown here; you can open it in another app.')}
                action={<Button label={l('Başka uygulamada aç', 'Open in Another App')} onPress={share} disabled={sharing} />}
                style={styles.notice}
            />
        );
    }

    return (
        <Modal
            visible={filename !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            allowSwipeDismissal
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* React Native's page sheet draws no grabber of its own; this one shows the pull-down. */}
                <View style={[styles.grabberArea, { pointerEvents: 'none' }]}>
                    <View style={styles.grabber} />
                </View>
                <View style={styles.header}>
                    <View style={styles.headerSide}>
                        <Button label={l('Kapat', 'Close')} variant="plain" onPress={onClose} />
                    </View>
                    <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{name}</Text>
                    <View style={[styles.headerSide, styles.headerSideEnd]}>
                        <IconButton accessibilityLabel={l('Paylaş', 'Share')} onPress={share} disabled={missing || sharing}>
                            {sharing
                                ? <ActivityIndicator size="small" color={colors.accent} />
                                : <ShareIcon color={colors.accent} />}
                        </IconButton>
                    </View>
                </View>
                {body}
            </View>
        </Modal>
    );
}

/**
 * Opens a file a card links to. Native shows it in the viewer above whatever is on screen —
 * the reviewer, a preview sheet or the editor's preview — so no screen has to route there.
 */
export function useAttachmentViewer(): { open: (filename: string) => void; viewer: ReactNode } {
    const { l } = useI18n();
    const [filename, setFilename] = useState<string | null>(null);
    const open = useCallback((name: string) => {
        if (Platform.OS !== 'web') {
            setFilename(name);
            return;
        }
        openWebAttachment(name)
            .then((found) => {
                if (!found) alert(l('Dosya bulunamadı', 'File not found'), l('Bu bağlantının dosyası bu cihazda yok.', 'The file this link points to is not on this device.'));
            })
            .catch((error) => console.warn('[AttachmentViewer] web open failed:', error));
    }, [l]);
    const close = useCallback(() => setFilename(null), []);
    const viewer = Platform.OS === 'web' ? null : <AttachmentViewer filename={filename} onClose={close} />;
    return { open, viewer };
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        grabberArea: { alignItems: 'center', paddingTop: 8 },
        grabber: { width: 36, height: 5, borderRadius: Radius.pill, backgroundColor: colors.border },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 48,
            paddingHorizontal: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        // Equal sides keep the file name centred between Close and Share.
        headerSide: { minWidth: 72, alignItems: 'flex-start' },
        headerSideEnd: { alignItems: 'flex-end' },
        title: { ...Type.title, flex: 1, textAlign: 'center', color: colors.textPrimary },
        preview: { flex: 1, backgroundColor: colors.bgCard },
        notice: { flex: 1 },
    });
}
