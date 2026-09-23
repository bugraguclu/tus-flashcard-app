import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Keyboard, Pressable, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, choose } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { readUriBytes } from '../lib/files';
import { saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import { mediaFilenameForPickedAsset, sanitizeMediaFilename } from '../lib/mediaFilename';
import { mediaReferenceSnippet, soundSafeMediaFilename, type MediaReferenceKind } from '../lib/mediaAttachment';
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

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const MediaAttachButton = forwardRef<MediaAttachButtonHandle, MediaAttachButtonProps>(function MediaAttachButton({ onInsert }, ref) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [menuVisible, setMenuVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [photoToEdit, setPhotoToEdit] = useState<EditablePhoto | null>(null);
    // A picked photo waits here until the user says whether to insert it untouched or edit it.
    const [pickedPhoto, setPickedPhoto] = useState<EditablePhoto | null>(null);
    // The new-page sheet: the paper is chosen here, then the editor opens on it.
    const [pageSetup, setPageSetup] = useState(false);
    const [pagePaper, setPagePaper] = useState(DEFAULT_BLANK_CANVAS_SETUP.paper);
    const [pageBackground, setPageBackground] = useState(DEFAULT_BLANK_CANVAS_SETUP.background);
    const [pageShape, setPageShape] = useState<BlankCanvasShape>(DEFAULT_BLANK_CANVAS_SETUP.shape);
    const [pageToDraw, setPageToDraw] = useState<BlankCanvasPage | null>(null);

    const pendingActionRef = useRef<(() => void) | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMenuDismiss = () => {
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
            dismissTimerRef.current = setTimeout(() => {
                handleMenuDismiss();
            }, 450);
            return;
        }
        setMenuVisible(false);
        action();
    };

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
            setPickedPhoto({
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
            setPickedPhoto({
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
        setPhotoToEdit(photo);
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

    const pickVideoClip = async () => {
        if (Platform.OS === 'web') {
            await pickVideoFromFiles();
            return;
        }
        const pickFromGaleri = await choose(
            l('Video klibi ekle', 'Attach Video Clip'),
            l('Videoyu nereden seçmek istersiniz?', 'Where would you like to choose the video from?'),
            l('Galeri', 'Gallery'),
            l('Dosyalar', 'Files'),
        );
        if (pickFromGaleri) {
            await pickVideoFromGallery();
        } else {
            await pickVideoFromFiles();
        }
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
                onDismiss={handleMenuDismiss}
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
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setPickedPhoto(null)}
                        accessibilityLabel={l('Fotoğraf seçimini kapat', 'Close photo options')}
                    />
                    <SwipeDismissSheet active={pickedPhoto !== null} style={styles.sheet} onDismiss={() => setPickedPhoto(null)}>
                        <Text style={styles.sheetTitle}>{l('Fotoğrafı nasıl ekleyelim?', 'How should the photo be added?')}</Text>
                        <TouchableOpacity
                            style={styles.optionRow}
                            onPress={insertPickedPhotoUnchanged}
                            accessibilityRole="button"
                            accessibilityLabel={l('Fotoğrafı olduğu gibi ekle', 'Insert the photo unchanged')}
                        >
                            <Text style={styles.optionIcon}>🖼️</Text>
                            <View style={styles.optionCopy}>
                                <Text style={styles.optionLabel}>{l('Olduğu gibi ekle', 'Insert as is')}</Text>
                                <Text style={styles.optionCaption}>
                                    {l('Kırpılmadan, tam çözünürlükte eklenir.', 'Added uncropped, at full resolution.')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.optionRow}
                            onPress={editPickedPhoto}
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
                        <TouchableOpacity style={styles.cancelRow} onPress={() => setPickedPhoto(null)}>
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
