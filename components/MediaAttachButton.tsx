import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, ActivityIndicator, Keyboard, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Spacing, useThemeColors } from '../constants/theme';
import { alert } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { saveMediaFromUri } from '../lib/mediaStore';
import { attachmentMediaFilename, mediaFilenameForPickedAsset } from '../lib/mediaFilename';
import { mediaReferenceSnippet, soundSafeMediaFilename, type MediaReferenceKind } from '../lib/mediaAttachment';
import { attachmentKindFor } from '../lib/attachmentKind';
import AudioRecordModal from './AudioRecordModal';
import PhotoEditorModal, { type EditablePhoto } from './photo-editor/PhotoEditorModal';
import DrawingPadModal from './drawing/DrawingPadModal';
import { useI18n } from '../hooks/useI18n';
import { Button, IconButton } from './ui/Button';
import { PaperclipGlyph } from './UiGlyphs';
import { Card } from './ui/Card';
import { MenuItem } from './ui/Menu';
import { AppSheet } from './ui/Sheet';
import {
    CameraIcon,
    CropIcon,
    DocumentIcon,
    DrawIcon,
    MicIcon,
    MusicIcon,
    PhotoIcon,
    ShrinkIcon,
    VideoIcon,
} from './editor/AttachmentIcons';
import {
    compressPhotoForAttachment,
    formatByteSize,
    planPhotoCompressionForUri,
    readUriByteLength,
    withPhotoExtension,
    type PhotoCompressionPlan,
} from '../lib/photoCompression';

interface MediaAttachButtonProps {
    /** Appends an Anki-style media reference (`<img src="…">`, `[sound:…]`, …) to the field. */
    onInsert: (snippet: string) => void;
    /**
     * Runs before the menu opens. The editor lets its fields go here: a WebView field keeps its
     * keyboard through `Keyboard.dismiss()`, which reaches only native text inputs, and that
     * keyboard would otherwise sit over the menu and the sheets that follow it.
     */
    onBeforeOpen?: () => void;
}

export interface MediaAttachButtonHandle {
    open: () => void;
}

/** A picked photo with its size and what shrinking it would do, read before the sheet opens. */
type PickedPhoto = EditablePhoto & {
    byteLength: number | null;
    plan: PhotoCompressionPlan;
};

/** A picked file on its way into the field, with the reference it will be written as. */
type PickedFile = {
    uri: string;
    name: string;
    mimeType?: string | null;
    kind: MediaReferenceKind;
};

/**
 * iOS presents nothing new (a picker, the editor, the recorder) while a sheet's modal is still on
 * screen, so what was chosen in a sheet runs from the sheet's onDismiss. For the attach menu a timer
 * covers a dismissal that is not reported; the sheet's own exit gives up at 550 ms.
 */
const MENU_GONE_FALLBACK_MS = 700;

const MediaAttachButton = forwardRef<MediaAttachButtonHandle, MediaAttachButtonProps>(function MediaAttachButton({ onInsert, onBeforeOpen }, ref) {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const [menuVisible, setMenuVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [photoToEdit, setPhotoToEdit] = useState<EditablePhoto | null>(null);
    // A picked photo waits here until the user says whether to insert it untouched or edit it.
    const [pickedPhoto, setPickedPhoto] = useState<PickedPhoto | null>(null);
    // The photo sheet keeps showing the photo it was opened for while it slides away.
    const shownPhotoRef = useRef<PickedPhoto | null>(null);
    if (pickedPhoto) shownPhotoRef.current = pickedPhoto;
    const shownPhoto = pickedPhoto ?? shownPhotoRef.current;
    // The blank drawing page opens straight away, on the paper the last drawing used.
    const [drawing, setDrawing] = useState(false);

    const pendingActionRef = useRef<(() => void) | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Both sheets' onDismiss: whatever was chosen in the sheet that has just gone. */
    const runPendingAction = () => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.();
    };

    const closeMenu = () => {
        pendingActionRef.current = null;
        setMenuVisible(false);
    };

    const runAfterMenuClose = (action: () => void) => {
        if (Platform.OS === 'ios') {
            pendingActionRef.current = action;
            setMenuVisible(false);
            dismissTimerRef.current = setTimeout(runPendingAction, MENU_GONE_FALLBACK_MS);
            return;
        }
        setMenuVisible(false);
        action();
    };

    const openMenu = () => {
        Keyboard.dismiss();
        onBeforeOpen?.();
        setMenuVisible(true);
    };

    useImperativeHandle(ref, () => ({ open: openMenu }));

    const saveAndInsert = async (uri: string, name: string, kind: MediaReferenceKind) => {
        setBusy(true);
        try {
            // Brackets come out before the file is stored, not just before it is referenced, so a
            // `[sound:…]` marker and the file on disk cannot end up disagreeing.
            const filename = soundSafeMediaFilename(attachmentMediaFilename(`${Date.now()}_${name}`));
            await saveMediaFromUri(filename, uri);
            onInsert(mediaReferenceSnippet(kind, filename, name));
        } catch (e) {
            console.warn('[MediaAttach] save failed:', e);
            alert(t('common.error'), l('Dosya eklenemedi.', 'Could not attach the file.'));
        } finally {
            setBusy(false);
        }
    };

    const pickFromGallery = async () => {
        try {
            // The system photo picker runs outside the app and hands over only what is chosen, so
            // it needs no photo library permission; asking for one only put a prompt in the way,
            // and a "Don't Allow" there used to shut the gallery for good.
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 1,
                selectionLimit: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await offerPickedPhoto({
                uri: asset.uri,
                name: mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.fileName || 'gorsel', fallbackExtension: 'jpg' }),
                width: asset.width,
                height: asset.height,
            });
        } catch (e) {
            console.warn('[MediaAttach] gallery pick failed:', e);
            alert(t('common.error'), l('Görsel seçilemedi.', 'Could not select the image.'));
        }
    };

    const captureFromCamera = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                await promptPermissionSettings({
                    title: l('İzin gerekli', 'Permission Required'),
                    message: l(
                        'Kamerayı kullanmak için izin vermeniz gerekiyor. Ayarlardan kamera iznini açabilirsiniz.',
                        'Allow camera access to take a photo. You can enable camera access in Settings.',
                    ),
                    settingsLabel: l('Ayarları Aç', 'Open Settings'),
                    cancelLabel: t('common.cancel'),
                });
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await offerPickedPhoto({
                uri: asset.uri,
                name: mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.fileName || 'kamera', fallbackExtension: 'jpg' }),
                width: asset.width,
                height: asset.height,
            });
        } catch (e) {
            console.warn('[MediaAttach] camera capture failed:', e);
            alert(t('common.error'), l('Fotoğraf çekilemedi.', 'Could not take the photo.'));
        }
    };

    const offerPickedPhoto = async (photo: EditablePhoto) => {
        // Sizing up a large photo takes a moment after the picker closes; the button shows it.
        setBusy(true);
        try {
            const byteLength = await readUriByteLength(photo.uri);
            const plan = await planPhotoCompressionForUri(photo, byteLength);
            setPickedPhoto({ ...photo, byteLength, plan });
        } finally {
            setBusy(false);
        }
    };

    /**
     * Insert a smaller copy of the picked photo. `compressPhotoForAttachment` hands back the
     * original when the result is not meaningfully smaller, may carry transparency, or fails.
     */
    const insertPickedPhotoOptimised = async () => {
        const photo = pickedPhoto;
        if (!photo) return;
        setPickedPhoto(null);
        setBusy(true);
        let source = photo.uri;
        let name = photo.name;
        try {
            const result = await compressPhotoForAttachment(photo);
            source = result.uri;
            if (result.extension) name = withPhotoExtension(photo.name, result.extension);
        } catch (e) {
            console.warn('[MediaAttach] optimise failed, storing the original:', e);
        } finally {
            setBusy(false);
        }
        await saveAndInsert(source, name, 'image');
    };

    /** Insert the picked photo byte-for-byte, at its full original resolution. */
    const insertPickedPhotoUnchanged = async () => {
        const photo = pickedPhoto;
        if (!photo) return;
        setPickedPhoto(null);
        await saveAndInsert(photo.uri, photo.name, 'image');
    };

    const editPickedPhoto = () => {
        const photo = pickedPhoto;
        if (!photo) return;
        setPickedPhoto(null);
        // The editor is a modal of its own: on iOS it opens once the photo sheet has gone.
        if (Platform.OS === 'ios') {
            pendingActionRef.current = () => setPhotoToEdit(photo);
            return;
        }
        setPhotoToEdit(photo);
    };

    /**
     * Store every picked file and write all of their references into the field at once. A file
     * that cannot be copied is reported without losing the ones that could.
     */
    const attachFiles = async (files: PickedFile[]) => {
        if (files.length === 0) return;
        setBusy(true);
        const snippets: string[] = [];
        let lastKind: MediaReferenceKind | null = null;
        let failed = 0;
        const stamp = Date.now();
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            try {
                // Each file gets its own timestamp, so two picked files of the same name never
                // overwrite one another.
                const filename = soundSafeMediaFilename(attachmentMediaFilename(`${stamp + index}_${file.name}`));
                await saveMediaFromUri(filename, file.uri, file.mimeType ?? undefined);
                snippets.push(mediaReferenceSnippet(file.kind, filename, file.name));
                lastKind = file.kind;
            } catch (e) {
                console.warn('[MediaAttach] save failed:', e);
                failed += 1;
            }
        }
        setBusy(false);
        // A file link is text, so the next link or word would run straight into it
        // ("notlar.pdfvaka.zip"). A non-breaking space keeps them apart; the editor drops a
        // plain trailing space as unrendered.
        if (snippets.length > 0) onInsert(snippets.join(' ') + (lastKind === 'file' ? '&nbsp;' : ''));
        if (failed > 0) {
            alert(t('common.error'), failed === files.length
                ? l('Dosya eklenemedi.', 'Could not attach the file.')
                : l(`${failed} dosya eklenemedi; diğerleri eklendi.`, `${failed} of the files could not be attached; the others were added.`));
        }
    };

    const pickAudioClip = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], multiple: true, copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            await attachFiles(picked.assets.map((asset) => {
                const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'ses', fallbackExtension: 'm4a' });
                // A sound in a video container is still a sound clip here; anything else a browser
                // lets past the audio filter goes in as what it is.
                const kind = attachmentKindFor(name, asset.mimeType);
                return { uri: asset.uri, name, mimeType: asset.mimeType, kind: kind === 'video' ? 'audio' : kind };
            }));
        } catch (e) {
            console.warn('[MediaAttach] audio clip pick failed:', e);
            alert(t('common.error'), l('Ses klibi eklenemedi.', 'Could not attach the audio clip.'));
        }
    };

    const pickVideoClip = async () => {
        try {
            if (Platform.OS === 'web') {
                const picked = await DocumentPicker.getDocumentAsync({ type: ['video/*'], copyToCacheDirectory: true });
                if (picked.canceled || !picked.assets?.length) return;
                const asset = picked.assets[0];
                const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'video', fallbackExtension: 'mp4' });
                await attachFiles([{ uri: asset.uri, name, mimeType: asset.mimeType, kind: 'video' }]);
                return;
            }
            // The system photo picker runs outside the app, so it needs no library permission.
            // Copying a long or iCloud-only clip takes a moment after it closes; the button
            // shows that wait. A clip kept in Files goes in through "Dosya ekle".
            setBusy(true);
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsEditing: false,
                quality: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.fileName || 'video', fallbackExtension: 'mp4' });
            await attachFiles([{ uri: asset.uri, name, mimeType: asset.mimeType, kind: 'video' }]);
        } catch (e) {
            console.warn('[MediaAttach] video pick failed:', e);
            alert(t('common.error'), l('Video klibi eklenemedi.', 'Could not attach the video clip.'));
        } finally {
            setBusy(false);
        }
    };

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            await attachFiles(picked.assets.map((asset) => {
                const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'dosya' });
                // A picture, sound or video chosen here goes into the card as one, not as a link.
                return { uri: asset.uri, name, mimeType: asset.mimeType, kind: attachmentKindFor(name, asset.mimeType) };
            }));
        } catch (e) {
            console.warn('[MediaAttach] file pick failed:', e);
            alert(t('common.error'), l('Dosya eklenemedi.', 'Could not attach the file.'));
        }
    };

    // A menu item's icon is drawn in the muted text colour, as in every action sheet.
    const icon = colors.textMuted;
    const originalSize = formatByteSize(shownPhoto?.byteLength, locale);
    const options: { icon: ReactNode; label: string; onPress: () => void }[] = [
        { icon: <PhotoIcon color={icon} size={22} />, label: l('Galeriden fotoğraf seç', 'Choose Photo'), onPress: () => runAfterMenuClose(pickFromGallery) },
        { icon: <CameraIcon color={icon} size={22} />, label: l('Fotoğraf çek', 'Take Photo'), onPress: () => runAfterMenuClose(captureFromCamera) },
        { icon: <DrawIcon color={icon} size={22} />, label: l('Boş tuvale çiz', 'Draw on Blank Canvas'), onPress: () => runAfterMenuClose(() => setDrawing(true)) },
        { icon: <MicIcon color={icon} size={22} />, label: l('Ses kaydet', 'Record Audio'), onPress: () => runAfterMenuClose(() => setShowRecorder(true)) },
        { icon: <MusicIcon color={icon} size={22} />, label: l('Ses klibi ekle', 'Attach Audio Clip'), onPress: () => runAfterMenuClose(pickAudioClip) },
        { icon: <VideoIcon color={icon} size={22} />, label: l('Video klibi ekle', 'Attach Video Clip'), onPress: () => runAfterMenuClose(pickVideoClip) },
        { icon: <DocumentIcon color={icon} size={22} />, label: l('Dosya ekle', 'Attach File'), onPress: () => runAfterMenuClose(pickFile) },
    ];

    return (
        <>
            <IconButton accessibilityLabel={l('Ek ekle', 'Add attachment')} onPress={openMenu} disabled={busy}>
                {busy
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <PaperclipGlyph color={colors.textMuted} size={23} />}
            </IconButton>

            <AppSheet
                visible={menuVisible}
                onClose={closeMenu}
                title={l('Ek ekle', 'Add Attachment')}
                backdropLabel={l('Ek menüsünü kapat', 'Close attachment menu')}
                onDismiss={runPendingAction}
            >
                <Card divided>
                    {options.map((opt) => (
                        <MenuItem key={opt.label} label={opt.label} icon={opt.icon} onPress={opt.onPress} />
                    ))}
                </Card>
                <Button label={t('common.cancel')} variant="plain" onPress={closeMenu} style={styles.cancel} />
            </AppSheet>

            <AppSheet
                visible={pickedPhoto !== null}
                onClose={() => setPickedPhoto(null)}
                title={l('Fotoğrafı nasıl ekleyelim?', 'How should the photo be added?')}
                backdropLabel={l('Fotoğraf seçimini kapat', 'Close photo options')}
                onDismiss={runPendingAction}
            >
                <Card divided>
                    <MenuItem
                        label={l('Olduğu gibi ekle', 'Insert as is')}
                        hint={`${l('Kırpılmadan, tam çözünürlükte eklenir.', 'Added uncropped, at full resolution.')}${originalSize ? ` (${originalSize})` : ''}`}
                        icon={<PhotoIcon color={icon} size={22} />}
                        onPress={insertPickedPhotoUnchanged}
                        accessibilityLabel={l('Fotoğrafı olduğu gibi ekle', 'Insert the photo unchanged')}
                    />
                    {/* Offered only when shrinking gains something; an efficient or transparent photo plans to keep. */}
                    {shownPhoto?.plan.action === 'recompress' ? (
                        <MenuItem
                            label={l('Küçültüp ekle', 'Add optimised')}
                            hint={[
                                `${formatByteSize(shownPhoto.byteLength, locale)} → ~${formatByteSize(shownPhoto.plan.estimatedBytes, locale)} · ${shownPhoto.plan.width}×${shownPhoto.plan.height}`,
                                l(
                                    'Ekranda görülebilir bir kalite kaybı olmadan. Sonuç küçülmezse orijinali eklenir.',
                                    'No difference you can see on screen. The original is kept if it does not get smaller.',
                                ),
                            ].join('\n')}
                            icon={<ShrinkIcon color={icon} size={22} />}
                            onPress={insertPickedPhotoOptimised}
                            accessibilityLabel={l('Fotoğrafı küçülterek ekle', 'Add a smaller copy of the photo')}
                        />
                    ) : null}
                    <MenuItem
                        label={l('Kırp ve düzenle', 'Crop & edit')}
                        hint={l(
                            'Kırpma, döndürme, ışık ve renk ayarı; kalem, metin, ok ve örtme.',
                            'Crop, rotate, light and colour; pen, text, arrows and cover-ups.',
                        )}
                        icon={<CropIcon color={icon} size={22} />}
                        onPress={editPickedPhoto}
                        accessibilityLabel={l('Fotoğrafı kırp ve düzenle', 'Crop and edit the photo')}
                    />
                </Card>
                <Button label={t('common.cancel')} variant="plain" onPress={() => setPickedPhoto(null)} style={styles.cancel} />
            </AppSheet>

            <AudioRecordModal
                visible={showRecorder}
                onClose={() => setShowRecorder(false)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('audio', filename))}
            />
            <PhotoEditorModal
                visible={photoToEdit !== null}
                photo={photoToEdit}
                onClose={() => setPhotoToEdit(null)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('image', filename))}
            />
            <DrawingPadModal
                visible={drawing}
                onClose={() => setDrawing(false)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('image', filename))}
            />
        </>
    );
});

const styles = StyleSheet.create({
    cancel: { marginTop: Spacing.sm },
});

export default MediaAttachButton;
