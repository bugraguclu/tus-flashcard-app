import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Keyboard, Pressable, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { readUriBytes } from '../lib/files';
import { saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import { mediaFilenameForPickedAsset, sanitizeMediaFilename } from '../lib/mediaFilename';
import { mediaReferenceSnippet, soundSafeMediaFilename, type MediaReferenceKind } from '../lib/mediaAttachment';
import {
    compressPhotoForAttachment,
    formatByteSize,
    planPhotoCompressionForUri,
    readUriByteLength,
    withPhotoExtension,
    type PhotoCompressionPlan,
} from '../lib/photoCompression';
import AudioRecordModal from './AudioRecordModal';
import PhotoEditorModal, { type EditablePhoto } from './PhotoEditorModal';
import PaperSwatch, { pageColorLabel, paperLabel } from './PaperSwatch';
import {
    BLANK_CANVAS_BACKGROUNDS,
    BLANK_CANVAS_PAPERS,
    BLANK_CANVAS_SHAPES,
    type BlankCanvasPage,
    type BlankCanvasShape,
} from '../lib/blankCanvas';
import {
    DEFAULT_BLANK_CANVAS_SETUP,
    blankCanvasPageFromSetup,
    loadBlankCanvasSetup,
    saveBlankCanvasSetup,
} from '../lib/blankCanvasSetup';
import { useI18n } from '../hooks/useI18n';
import SwipeDismissSheet from './SwipeDismissSheet';

interface MediaAttachButtonProps {
    /** Appends an Anki-style media reference (`<img src="…">`, `[sound:…]`, …) to the field. */
    onInsert: (snippet: string) => void;
}

export interface MediaAttachButtonHandle {
    open: () => void;
}

export { FIELD_MEDIA_RE } from '../lib/mediaAttachment';

type MediaKind = 'image' | 'audio' | 'video' | 'file';

/**
 * A picked photo, together with what is known about storing it.
 *
 * The size and the plan are read once, between the picker closing and the sheet opening, so the
 * sheet can put real numbers in front of the learner instead of offering to shrink a file that
 * has nothing to gain.
 */
type PickedPhoto = EditablePhoto & {
    byteLength: number | null;
    plan: PhotoCompressionPlan;
};

/** " (12,4 MB)" for a size that is known, and nothing at all for one that is not. */
function photoSizeSuffix(byteLength: number | null, locale = 'tr'): string {
    const size = formatByteSize(byteLength, locale);
    return size ? ` (${size})` : '';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const MediaAttachButton = forwardRef<MediaAttachButtonHandle, MediaAttachButtonProps>(function MediaAttachButton({ onInsert }, ref) {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [menuVisible, setMenuVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [photoToEdit, setPhotoToEdit] = useState<EditablePhoto | null>(null);
    // A picked photo waits here until the user says whether to insert it untouched or edit it.
    const [pickedPhoto, setPickedPhoto] = useState<PickedPhoto | null>(null);
    // The video sheet: where the clip is coming from, asked in the app's own sheet rather than a
    // two-button alert that offered no way back out.
    const [videoSource, setVideoSource] = useState(false);
    // The new-page sheet: the paper is chosen here, then the editor opens on it.
    const [pageSetup, setPageSetup] = useState(false);
    const [pagePaper, setPagePaper] = useState(DEFAULT_BLANK_CANVAS_SETUP.paper);
    const [pageBackground, setPageBackground] = useState(DEFAULT_BLANK_CANVAS_SETUP.background);
    const [pageShape, setPageShape] = useState<BlankCanvasShape>(DEFAULT_BLANK_CANVAS_SETUP.shape);
    const [pageToDraw, setPageToDraw] = useState<BlankCanvasPage | null>(null);

    const pendingActionRef = useRef<(() => void) | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSheetDismiss = () => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.();
    };

    // A pending action that outlives the screen would run against a component that is gone: it
    // would call `onInsert` on an unmounted editor, or leave a picker with nowhere to return to.
    useEffect(() => () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
        pendingActionRef.current = null;
    }, []);

    const closeMenu = () => {
        pendingActionRef.current = null;
        setMenuVisible(false);
    };

    /**
     * Close a sheet, then do the thing it was opened to do.
     *
     * On iOS a sheet is a presented view controller. Doing the next thing while it is still on its
     * way out is what broke "Olduğu gibi ekle": the file was copied and the snippet was handed to
     * the field's WebView while the sheet still held first responder, so WebKit refused the insert
     * and the photo was silently dropped. Waiting for the dismissal is also what lets the next
     * sheet — the photo editor, a picker — present at all rather than being swallowed.
     *
     * `onDismiss` is the real signal and the timer is only a floor under it, in case a dismissal
     * the runtime never reports would otherwise strand the action forever.
     */
    const runAfterSheetClose = (close: () => void, action: () => void) => {
        if (Platform.OS === 'ios') {
            pendingActionRef.current = action;
            close();
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = setTimeout(() => {
                handleSheetDismiss();
            }, 450);
            return;
        }
        close();
        action();
    };

    const runAfterMenuClose = (action: () => void) => runAfterSheetClose(() => setMenuVisible(false), action);
    const runAfterPhotoSheetClose = (action: () => void) => runAfterSheetClose(() => setPickedPhoto(null), action);

    const openMenu = () => {
        Keyboard.dismiss();
        setMenuVisible(true);
    };

    useImperativeHandle(ref, () => ({ open: openMenu }));

    const saveAndInsert = async (uri: string, name: string, kind: MediaReferenceKind) => {
        setBusy(true);
        try {
            // Brackets come out before the file is stored, not just before it is referenced, so a
            // `[sound:…]` marker and the file on disk cannot end up disagreeing.
            const filename = soundSafeMediaFilename(sanitizeMediaFilename(`${Date.now()}_${name}`));
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
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                await promptPermissionSettings({
                    title: l('İzin gerekli', 'Permission Required'),
                    message: l(
                        'Galeriye erişmek için izin vermeniz gerekiyor. Ayarlardan erişim iznini açabilirsiniz.',
                        'Allow photo library access to choose a photo. You can enable access in Settings.',
                    ),
                    settingsLabel: l('Ayarları Aç', 'Open Settings'),
                    cancelLabel: t('common.cancel'),
                });
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 1,
                selectionLimit: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await offerPickedPhoto(asset, 'gorsel');
        } catch (e) {
            console.warn('[MediaAttach] gallery pick failed:', e);
            alert(t('common.error'), l('Görsel seçilemedi.', 'Could not select the image.'));
        }
    };

    /**
     * Show the "how should this be added?" sheet for a photo that has just been picked or taken.
     *
     * The size and the compression plan are read here, before the sheet appears, so it can offer
     * a smaller copy only when there is one to be had and can say what it would actually cost.
     * Both reads are cheap — a stat and the first sixty-four bytes — so a three-hundred-megabyte
     * file is never loaded to decide what to do with it.
     */
    const offerPickedPhoto = async (
        asset: { uri: string; fileName?: string | null; width?: number; height?: number },
        fallbackName: string,
    ) => {
        const photo: EditablePhoto = {
            uri: asset.uri,
            name: mediaFilenameForPickedAsset({
                uri: asset.uri,
                name: asset.fileName || fallbackName,
                fallbackExtension: 'jpg',
            }),
            width: asset.width,
            height: asset.height,
        };
        const byteLength = await readUriByteLength(photo.uri);
        const plan = await planPhotoCompressionForUri(photo, byteLength);
        setPickedPhoto({ ...photo, byteLength, plan });
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
            await offerPickedPhoto(asset, 'kamera');
        } catch (e) {
            console.warn('[MediaAttach] camera capture failed:', e);
            alert(t('common.error'), l('Fotoğraf çekilemedi.', 'Could not take the photo.'));
        }
    };

    /** Insert the picked photo byte-for-byte, at its full original resolution. */
    const insertPickedPhotoUnchanged = (photo: PickedPhoto) => {
        runAfterPhotoSheetClose(() => { void saveAndInsert(photo.uri, photo.name, 'image'); });
    };

    /**
     * Insert a smaller copy of the picked photo.
     *
     * The re-encode is its own step so the spinner is up while it runs, and it can only ever help:
     * `compressPhotoForAttachment` hands back the original URI unchanged when the result came out
     * no smaller, when the file may carry transparency, or when anything at all went wrong.
     */
    const insertPickedPhotoOptimised = (photo: PickedPhoto) => {
        runAfterPhotoSheetClose(() => {
            void (async () => {
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
            })();
        });
    };

    const editPickedPhoto = (photo: PickedPhoto) => {
        runAfterPhotoSheetClose(() => setPhotoToEdit(photo));
    };

    const pickAudioClip = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: [
                    'audio/*',
                    'audio/mpeg',
                    'audio/mp4',
                    'audio/x-m4a',
                    'audio/wav',
                    'audio/aac',
                    'audio/ogg',
                    'audio/webm',
                ],
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'ses', fallbackExtension: 'm4a' });
            await saveAndInsert(asset.uri, name, 'audio');
        } catch (e) {
            console.warn('[MediaAttach] audio clip pick failed:', e);
            alert(t('common.error'), l('Ses klibi eklenemedi.', 'Could not attach the audio clip.'));
        }
    };

    const pickVideoFromGallery = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                await promptPermissionSettings({
                    title: l('İzin gerekli', 'Permission Required'),
                    message: l(
                        'Galeriye erişmek için izin vermeniz gerekiyor. Ayarlardan erişim iznini açabilirsiniz.',
                        'Allow photo library access to choose a video. You can enable access in Settings.',
                    ),
                    settingsLabel: l('Ayarları Aç', 'Open Settings'),
                    cancelLabel: t('common.cancel'),
                });
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsEditing: false,
                quality: 1,
                // A field takes one clip at a time, and the photo picker already says so; without
                // this the picker invites a multiple selection and every clip but the first is
                // dropped without a word.
                selectionLimit: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.fileName || 'video', fallbackExtension: 'mp4' });
            await saveAndInsert(asset.uri, name, 'video');
        } catch (e) {
            console.warn('[MediaAttach] gallery video pick failed:', e);
            alert(t('common.error'), l('Video klibi eklenemedi.', 'Could not attach the video clip.'));
        }
    };

    const pickVideoFromFiles = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: [
                    'video/*',
                    'video/mp4',
                    'video/quicktime',
                    'video/x-m4v',
                    'video/webm',
                ],
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'video', fallbackExtension: 'mp4' });
            await saveAndInsert(asset.uri, name, 'video');
        } catch (e) {
            console.warn('[MediaAttach] file video pick failed:', e);
            alert(t('common.error'), l('Video klibi eklenemedi.', 'Could not attach the video clip.'));
        }
    };

    /**
     * Ask where the clip is coming from.
     *
     * This was a two-button alert, which on iOS has no third answer: once the learner had tapped
     * "Video klibi ekle" there was no way back — dismissing it resolved to `false` and opened the
     * Files browser they had not asked for. The app's own sheet has a Cancel row like every other
     * one here, and matches them.
     */
    const pickVideoClip = () => {
        if (Platform.OS === 'web') {
            void pickVideoFromFiles();
            return;
        }
        setVideoSource(true);
    };

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            await saveAndInsert(asset.uri, mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.name || 'dosya' }), 'file');
        } catch (e) {
            console.warn('[MediaAttach] file pick failed:', e);
            alert(t('common.error'), l('Dosya eklenemedi.', 'Could not attach the file.'));
        }
    };

    /**
     * Open the sheet on the page the last drawing was made on. Read here rather than in the
     * initial state so the collection is certainly open: a read taken while it is still opening
     * would find no row and quietly pin the sheet to the defaults for the rest of the session.
     */
    const openPageSetup = () => {
        const stored = loadBlankCanvasSetup();
        setPagePaper(stored.paper);
        setPageBackground(stored.background);
        setPageShape(stored.shape);
        setPageSetup(true);
    };

    const startDrawing = () => {
        const setup = { paper: pagePaper, background: pageBackground, shape: pageShape };
        saveBlankCanvasSetup(setup);
        setPageSetup(false);
        setPageToDraw(blankCanvasPageFromSetup(setup));
    };

    const shapeLabel = (shape: BlankCanvasShape) => (
        shape === 'square' ? l('Kare', 'Square') : shape === 'portrait' ? l('Dikey', 'Portrait') : l('Yatay', 'Landscape')
    );

    const previewSize = useMemo(() => {
        const shape = BLANK_CANVAS_SHAPES.find((option) => option.id === pageShape) ?? BLANK_CANVAS_SHAPES[0];
        const longEdge = 168;
        const ratio = shape.width / shape.height;
        return ratio >= 1
            ? { width: longEdge, height: Math.round(longEdge / ratio) }
            : { width: Math.round(longEdge * ratio), height: longEdge };
    }, [pageShape]);

    const options: { icon: string; label: string; onPress: () => void }[] = [
        { icon: '🖼️', label: l('Galeriden fotoğraf seç', 'Choose Photo'), onPress: () => runAfterMenuClose(pickFromGallery) },
        { icon: '📷', label: l('Fotoğraf çek', 'Take Photo'), onPress: () => runAfterMenuClose(captureFromCamera) },
        { icon: '✏️', label: l('Boş tuvale çiz', 'Draw on Blank Canvas'), onPress: () => runAfterMenuClose(openPageSetup) },
        { icon: '🎙️', label: l('Ses kaydet', 'Record Audio'), onPress: () => runAfterMenuClose(() => setShowRecorder(true)) },
        { icon: '🎵', label: l('Ses klibi ekle', 'Attach Audio Clip'), onPress: () => runAfterMenuClose(pickAudioClip) },
        { icon: '🎬', label: l('Video klibi ekle', 'Attach Video Clip'), onPress: () => runAfterMenuClose(pickVideoClip) },
        { icon: '📄', label: l('Dosya ekle', 'Attach File'), onPress: () => runAfterMenuClose(pickFile) },
    ];

    return (
        <>
            <TouchableOpacity
                style={styles.addBtn}
                onPress={openMenu}
                accessibilityRole="button"
                accessibilityLabel={l('Ek ekle', 'Add attachment')}
                disabled={busy}
            >
                {busy ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                    <Svg width={23} height={23} viewBox="0 0 24 24">
                        <Path
                            d="M21.4 11.1l-9.2 9.1a6 6 0 01-8.5-8.5l9.2-9.1a4 4 0 015.7 5.6l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"
                            fill="none"
                            stroke={colors.textMuted}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </Svg>
                )}
            </TouchableOpacity>

            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={closeMenu}
                onDismiss={handleSheetDismiss}
            >
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel={l('Ek menüsünü kapat', 'Close attachment menu')} />
                    <SwipeDismissSheet active={menuVisible} style={styles.sheet} onDismiss={closeMenu}>
                        <Text style={styles.sheetTitle}>{l('Ek ekle', 'Add Attachment')}</Text>
                        {options.map((opt) => (
                            <TouchableOpacity
                                key={opt.label}
                                style={styles.optionRow}
                                onPress={opt.onPress}
                                accessibilityRole="button"
                                accessibilityLabel={opt.label}
                            >
                                <Text style={styles.optionIcon}>{opt.icon}</Text>
                                <Text style={styles.optionLabel}>{opt.label}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.cancelRow} onPress={closeMenu}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </SwipeDismissSheet>
                </View>
            </Modal>

            <Modal
                visible={pickedPhoto !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setPickedPhoto(null)}
                onDismiss={handleSheetDismiss}
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setPickedPhoto(null)}
                        accessibilityLabel={l('Fotoğraf seçimini kapat', 'Close photo options')}
                    />
                    <SwipeDismissSheet active={pickedPhoto !== null} style={styles.sheet} onDismiss={() => setPickedPhoto(null)}>
                        <Text style={styles.sheetTitle}>{l('Fotoğrafı nasıl ekleyelim?', 'How should the photo be added?')}</Text>
                        {pickedPhoto && (
                            <>
                                <TouchableOpacity
                                    style={styles.optionRow}
                                    onPress={() => insertPickedPhotoUnchanged(pickedPhoto)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Fotoğrafı olduğu gibi ekle', 'Insert the photo unchanged')}
                                >
                                    <Text style={styles.optionIcon}>🖼️</Text>
                                    <View style={styles.optionCopy}>
                                        <Text style={styles.optionLabel}>{l('Olduğu gibi ekle', 'Insert as is')}</Text>
                                        <Text style={styles.optionCaption}>
                                            {l('Kırpılmadan, tam çözünürlükte eklenir.', 'Added uncropped, at full resolution.')}
                                            {photoSizeSuffix(pickedPhoto.byteLength, locale)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                {/*
                                  * Only offered when there is something to gain. A photo already
                                  * stored efficiently, or one that may carry transparency, plans
                                  * to `keep` and this row never appears — so the choice is never
                                  * between "smaller" and "the same thing again".
                                  */}
                                {pickedPhoto.plan.action === 'recompress' && (
                                    <TouchableOpacity
                                        style={styles.optionRow}
                                        onPress={() => insertPickedPhotoOptimised(pickedPhoto)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Fotoğrafı küçülterek ekle', 'Add a smaller copy of the photo')}
                                    >
                                        <Text style={styles.optionIcon}>🪶</Text>
                                        <View style={styles.optionCopy}>
                                            <Text style={styles.optionLabel}>{l('Küçültüp ekle', 'Add optimised')}</Text>
                                            <Text style={styles.optionCaption}>
                                                {formatByteSize(pickedPhoto.byteLength, locale)}
                                                {' → ~'}
                                                {formatByteSize(pickedPhoto.plan.estimatedBytes, locale)}
                                                {' · '}
                                                {pickedPhoto.plan.width}×{pickedPhoto.plan.height}
                                            </Text>
                                            <Text style={styles.optionCaption}>
                                                {l(
                                                    'Ekranda görülebilir bir kalite kaybı olmadan. Sonuç küçülmezse orijinali eklenir.',
                                                    'No difference you can see on screen. The original is kept if it does not get smaller.',
                                                )}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={styles.optionRow}
                                    onPress={() => editPickedPhoto(pickedPhoto)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Fotoğrafı kırp ve düzenle', 'Crop and edit the photo')}
                                >
                                    <Text style={styles.optionIcon}>✂️</Text>
                                    <View style={styles.optionCopy}>
                                        <Text style={styles.optionLabel}>{l('Kırp ve düzenle', 'Crop & edit')}</Text>
                                        <Text style={styles.optionCaption}>
                                            {l('Kırpma, çizim, ok, metin ve örtme araçları.', 'Crop, draw, arrows, text and cover-ups.')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </>
                        )}
                        <TouchableOpacity style={styles.cancelRow} onPress={() => setPickedPhoto(null)}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </SwipeDismissSheet>
                </View>
            </Modal>

            <Modal
                visible={videoSource}
                transparent
                animationType="fade"
                onRequestClose={() => setVideoSource(false)}
                onDismiss={handleSheetDismiss}
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setVideoSource(false)}
                        accessibilityLabel={l('Video seçimini kapat', 'Close video options')}
                    />
                    <SwipeDismissSheet active={videoSource} style={styles.sheet} onDismiss={() => setVideoSource(false)}>
                        <Text style={styles.sheetTitle}>{l('Videoyu nereden seçelim?', 'Where is the video from?')}</Text>
                        <TouchableOpacity
                            style={styles.optionRow}
                            onPress={() => runAfterSheetClose(() => setVideoSource(false), () => { void pickVideoFromGallery(); })}
                            accessibilityRole="button"
                            accessibilityLabel={l('Galeriden video seç', 'Choose a video from the gallery')}
                        >
                            <Text style={styles.optionIcon}>🎬</Text>
                            <Text style={styles.optionLabel}>{l('Galeri', 'Gallery')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.optionRow}
                            onPress={() => runAfterSheetClose(() => setVideoSource(false), () => { void pickVideoFromFiles(); })}
                            accessibilityRole="button"
                            accessibilityLabel={l('Dosyalardan video seç', 'Choose a video from Files')}
                        >
                            <Text style={styles.optionIcon}>📁</Text>
                            <Text style={styles.optionLabel}>{l('Dosyalar', 'Files')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelRow} onPress={() => setVideoSource(false)}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </SwipeDismissSheet>
                </View>
            </Modal>

            <AudioRecordModal
                visible={showRecorder}
                onClose={() => setShowRecorder(false)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('audio', filename))}
            />
            <Modal visible={pageSetup} transparent animationType="fade" onRequestClose={() => setPageSetup(false)}>
                <View style={styles.overlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setPageSetup(false)}
                        accessibilityLabel={l('Sayfa seçimini kapat', 'Close page options')}
                    />
                    <SwipeDismissSheet active={pageSetup} style={styles.sheet} onDismiss={() => setPageSetup(false)}>
                        <Text style={styles.sheetTitle}>{l('Yeni çizim sayfası', 'New Drawing Page')}</Text>

                        <View style={styles.pagePreviewWrap}>
                            <PaperSwatch
                                paper={pagePaper}
                                background={pageBackground}
                                width={previewSize.width}
                                height={previewSize.height}
                                style={styles.pagePreview}
                            />
                        </View>

                        <Text style={styles.pageGroupLabel}>{l('Kağıt', 'Paper')}</Text>
                        <View style={styles.pageChipRow}>
                            {BLANK_CANVAS_PAPERS.map((option) => {
                                const isSelected = pagePaper === option;
                                return (
                                    <TouchableOpacity
                                        key={option}
                                        style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                        onPress={() => setPagePaper(option)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isSelected }}
                                        accessibilityLabel={paperLabel(option, l)}
                                    >
                                        <PaperSwatch
                                            paper={option}
                                            background={pageBackground}
                                            width={40}
                                            height={30}
                                            style={styles.pageChipSwatch}
                                        />
                                        <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                            {paperLabel(option, l)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={styles.pageGroupLabel}>{l('Zemin', 'Page colour')}</Text>
                        <View style={styles.pageChipRow}>
                            {BLANK_CANVAS_BACKGROUNDS.map((option) => {
                                const isSelected = pageBackground === option.color;
                                return (
                                    <TouchableOpacity
                                        key={option.id}
                                        style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                        onPress={() => setPageBackground(option.color)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isSelected }}
                                        accessibilityLabel={pageColorLabel(option.id, l)}
                                    >
                                        <View style={[styles.pageColorDot, { backgroundColor: option.color }]} />
                                        <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                            {pageColorLabel(option.id, l)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={styles.pageGroupLabel}>{l('Biçim', 'Shape')}</Text>
                        <View style={styles.pageChipRow}>
                            {BLANK_CANVAS_SHAPES.map((option) => {
                                const isSelected = pageShape === option.id;
                                return (
                                    <TouchableOpacity
                                        key={option.id}
                                        style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                        onPress={() => setPageShape(option.id)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isSelected }}
                                        accessibilityLabel={shapeLabel(option.id)}
                                    >
                                        <View
                                            style={[
                                                styles.pageShapeGlyph,
                                                {
                                                    width: option.width >= option.height ? 40 : 40 * (option.width / option.height),
                                                    height: option.height >= option.width ? 30 : 30 * (option.height / option.width),
                                                },
                                            ]}
                                        />
                                        <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                            {shapeLabel(option.id)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={styles.pageStartBtn}
                            onPress={startDrawing}
                            accessibilityRole="button"
                            accessibilityLabel={l('Bu sayfada çizmeye başla', 'Start drawing on this page')}
                        >
                            <Text style={styles.pageStartText}>{l('Çizmeye başla', 'Start Drawing')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelRow} onPress={() => setPageSetup(false)}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </SwipeDismissSheet>
                </View>
            </Modal>

            <PhotoEditorModal
                visible={photoToEdit !== null}
                photo={photoToEdit}
                onClose={() => setPhotoToEdit(null)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('image', filename))}
            />
            <PhotoEditorModal
                visible={pageToDraw !== null}
                photo={null}
                blankPage={pageToDraw}
                onClose={() => setPageToDraw(null)}
                onSaved={(filename) => onInsert(mediaReferenceSnippet('image', filename))}
            />
        </>
    );
});

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        addBtn: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
        },
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            paddingBottom: 32,
            ...Shadows.lg,
        },
        sheetTitle: {
            fontSize: FontSize.md,
            fontWeight: '700',
            color: colors.textPrimary,
            marginBottom: Spacing.sm,
        },
        optionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            gap: Spacing.md,
            paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        optionIcon: { fontSize: 20, width: 28, textAlign: 'center' },
        optionCopy: { flex: 1, gap: 2 },
        optionLabel: { fontSize: FontSize.md, color: colors.textPrimary },
        optionCaption: { fontSize: FontSize.xs, color: colors.textMuted },
        cancelRow: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
        pagePreviewWrap: { alignItems: 'center', paddingVertical: Spacing.sm },
        pagePreview: {
            borderRadius: BorderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            ...Shadows.sm,
        },
        pageGroupLabel: {
            fontSize: FontSize.sm,
            fontWeight: '700',
            color: colors.textSecondary,
            marginTop: Spacing.sm,
            marginBottom: Spacing.xs,
        },
        pageChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        pageChip: {
            minWidth: 72,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.md,
            borderWidth: 2,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        pageChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        pageChipSwatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pageChipText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
        pageChipTextActive: { color: colors.textPrimary },
        pageColorDot: {
            width: 40,
            height: 30,
            borderRadius: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        pageShapeGlyph: {
            borderRadius: 4,
            borderWidth: 2,
            borderColor: colors.textMuted,
        },
        pageStartBtn: {
            marginTop: Spacing.lg,
            minHeight: 50,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pageStartText: { color: colors.white, fontWeight: '800', fontSize: FontSize.md },
    });
}

export default MediaAttachButton;
