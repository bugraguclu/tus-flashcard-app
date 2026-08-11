import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import AudioRecordModal from './AudioRecordModal';
import DrawingCanvasModal from './DrawingCanvasModal';
import PhotoEditorModal, { type EditablePhoto } from './PhotoEditorModal';
import { useI18n } from '../hooks/useI18n';

interface MediaAttachButtonProps {
    /** Appends an Anki-style media reference (`<img src="…">`, `[sound:…]`, …) to the field. */
    onInsert: (snippet: string) => void;
    /** Visually marks that the field already contains media; Anki permits additional files. */
    hasMedia?: boolean;
}

export interface MediaAttachButtonHandle {
    open: () => void;
}

/** Matches any media reference a field can carry (image/video/audio tag or [sound:] marker). */
export const FIELD_MEDIA_RE = /<img\b|<video\b|<audio\b|<a\b[^>]*\bhref=|\[sound:/i;

async function readUriBytes(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

type MediaKind = 'image' | 'audio' | 'video' | 'file';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const MediaAttachButton = forwardRef<MediaAttachButtonHandle, MediaAttachButtonProps>(function MediaAttachButton({ onInsert, hasMedia }, ref) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [menuVisible, setMenuVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [showDrawing, setShowDrawing] = useState(false);
    const [photoToEdit, setPhotoToEdit] = useState<EditablePhoto | null>(null);

    const closeMenu = () => setMenuVisible(false);
    const openMenu = () => setMenuVisible(true);

    useImperativeHandle(ref, () => ({ open: openMenu }));

    const saveAndInsert = async (uri: string, name: string, kind: MediaKind) => {
        setBusy(true);
        try {
            const bytes = await readUriBytes(uri);
            const filename = sanitizeMediaFilename(`${Date.now()}_${name}`);
            await saveMediaBytes(filename, bytes);
            if (kind === 'image') onInsert(`<img src="${filename}">`);
            else if (kind === 'audio') onInsert(`[sound:${filename}]`);
            else if (kind === 'video') onInsert(`<video controls src="${filename}"></video>`);
            else onInsert(`<a href="${filename}">${escapeHtml(name)}</a>`);
        } catch (e) {
            console.warn('[MediaAttach] save failed:', e);
            alert(t('common.error'), l('Dosya eklenemedi.', 'Could not attach the file.'));
        } finally {
            setBusy(false);
        }
    };

    const pickFromGallery = async () => {
        closeMenu();
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                alert(l('İzin Gerekli', 'Permission Required'), l('Galeriye erişmek için izin vermeniz gerekiyor.', 'Allow photo library access to choose a photo.'));
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 1,
                selectionLimit: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            setPhotoToEdit({
                uri: asset.uri,
                name: asset.fileName || 'gorsel.jpg',
                width: asset.width,
                height: asset.height,
            });
        } catch (e) {
            console.warn('[MediaAttach] gallery pick failed:', e);
            alert(t('common.error'), l('Görsel seçilemedi.', 'Could not select the image.'));
        }
    };

    const captureFromCamera = async () => {
        closeMenu();
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                alert(l('İzin Gerekli', 'Permission Required'), l('Kamerayı kullanmak için izin vermeniz gerekiyor.', 'Allow camera access to take a photo.'));
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 1,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            setPhotoToEdit({
                uri: asset.uri,
                name: asset.fileName || 'kamera.jpg',
                width: asset.width,
                height: asset.height,
            });
        } catch (e) {
            console.warn('[MediaAttach] camera capture failed:', e);
            alert(t('common.error'), l('Fotoğraf çekilemedi.', 'Could not take the photo.'));
        }
    };

    const pickAudioClip = async () => {
        closeMenu();
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            await saveAndInsert(asset.uri, asset.name, 'audio');
        } catch (e) {
            console.warn('[MediaAttach] audio clip pick failed:', e);
            alert(t('common.error'), l('Ses klibi eklenemedi.', 'Could not attach the audio clip.'));
        }
    };

    const pickVideoClip = async () => {
        closeMenu();
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            await saveAndInsert(asset.uri, asset.name, 'video');
        } catch (e) {
            console.warn('[MediaAttach] video clip pick failed:', e);
            alert(t('common.error'), l('Video klibi eklenemedi.', 'Could not attach the video clip.'));
        }
    };

    const pickFile = async () => {
        closeMenu();
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            await saveAndInsert(asset.uri, asset.name, 'file');
        } catch (e) {
            console.warn('[MediaAttach] file pick failed:', e);
            alert(t('common.error'), l('Dosya eklenemedi.', 'Could not attach the file.'));
        }
    };

    const options: { icon: string; label: string; onPress: () => void }[] = [
        { icon: '▧', label: l('Fotoğraf Seç ve Düzenle', 'Choose & Edit Photo'), onPress: pickFromGallery },
        { icon: '⌾', label: l('Fotoğraf Çek ve Düzenle', 'Take & Edit Photo'), onPress: captureFromCamera },
        { icon: '✎', label: l('Boş Tuvale Çiz', 'Draw on Blank Canvas'), onPress: () => { closeMenu(); setShowDrawing(true); } },
        { icon: '●', label: l('Ses Kaydet', 'Record Audio'), onPress: () => { closeMenu(); setShowRecorder(true); } },
        { icon: '♪', label: l('Ses Klibi Ekle', 'Attach Audio Clip'), onPress: pickAudioClip },
        { icon: '▻', label: l('Video Klibi Ekle', 'Attach Video Clip'), onPress: pickVideoClip },
        { icon: '□', label: l('Dosya Ekle', 'Attach File'), onPress: pickFile },
    ];

    return (
        <>
            <TouchableOpacity
                style={[styles.addBtn, hasMedia && styles.addBtnHasMedia]}
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
                            stroke={hasMedia ? colors.accent : colors.textSecondary}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </Svg>
                )}
            </TouchableOpacity>

            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel={l('Ek menüsünü kapat', 'Close attachment menu')} />
                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>{l('Ek Ekle', 'Add Attachment')}</Text>
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
                    </View>
                </View>
            </Modal>

            <AudioRecordModal
                visible={showRecorder}
                onClose={() => setShowRecorder(false)}
                onSaved={(filename) => onInsert(`[sound:${filename}]`)}
            />
            <DrawingCanvasModal
                visible={showDrawing}
                onClose={() => setShowDrawing(false)}
                onSaved={(filename) => onInsert(`<img src="${filename}">`)}
            />
            <PhotoEditorModal
                visible={photoToEdit !== null}
                photo={photoToEdit}
                onClose={() => setPhotoToEdit(null)}
                onSaved={(filename) => onInsert(`<img src="${filename}">`)}
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
        addBtnHasMedia: { backgroundColor: colors.accentLight },
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            padding: Spacing.lg,
            paddingBottom: 32,
            ...Shadows.lg,
        },
        sheetHandle: {
            width: 42,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginTop: -8,
            marginBottom: Spacing.md,
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
        optionLabel: { fontSize: FontSize.md, color: colors.textPrimary },
        cancelRow: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
    });
}

export default MediaAttachButton;
