import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import AudioRecordModal from './AudioRecordModal';
import DrawingCanvasModal from './DrawingCanvasModal';

interface MediaAttachButtonProps {
    /** Appends an Anki-style media reference (`<img src="…">`, `[sound:…]`, …) to the field. */
    onInsert: (snippet: string) => void;
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

type MediaKind = 'image' | 'audio' | 'video';

export default function MediaAttachButton({ onInsert }: MediaAttachButtonProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [menuVisible, setMenuVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [showDrawing, setShowDrawing] = useState(false);

    const closeMenu = () => setMenuVisible(false);

    const saveAndInsert = async (uri: string, name: string, kind: MediaKind) => {
        setBusy(true);
        try {
            const bytes = await readUriBytes(uri);
            const filename = sanitizeMediaFilename(`${Date.now()}_${name}`);
            await saveMediaBytes(filename, bytes);
            if (kind === 'image') onInsert(`<img src="${filename}">`);
            else if (kind === 'audio') onInsert(`[sound:${filename}]`);
            else onInsert(`<video controls src="${filename}"></video>`);
        } catch (e) {
            console.warn('[MediaAttach] save failed:', e);
            alert('Hata', 'Dosya eklenemedi.');
        } finally {
            setBusy(false);
        }
    };

    const pickFromGallery = async () => {
        closeMenu();
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                alert('İzin gerekli', 'Galeriye erişmek için izin vermeniz gerekiyor.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await saveAndInsert(asset.uri, asset.fileName || 'gorsel.jpg', 'image');
        } catch (e) {
            console.warn('[MediaAttach] gallery pick failed:', e);
            alert('Hata', 'Görsel seçilemedi.');
        }
    };

    const captureFromCamera = async () => {
        closeMenu();
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                alert('İzin gerekli', 'Kamerayı kullanmak için izin vermeniz gerekiyor.');
                return;
            }
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await saveAndInsert(asset.uri, asset.fileName || 'kamera.jpg', 'image');
        } catch (e) {
            console.warn('[MediaAttach] camera capture failed:', e);
            alert('Hata', 'Fotoğraf çekilemedi.');
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
            alert('Hata', 'Ses klibi eklenemedi.');
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
            alert('Hata', 'Video klibi eklenemedi.');
        }
    };

    const options: { icon: string; label: string; onPress: () => void }[] = [
        { icon: '🖼️', label: 'Galeri', onPress: pickFromGallery },
        { icon: '📷', label: 'Kamera', onPress: captureFromCamera },
        { icon: '✏️', label: 'Çizim', onPress: () => { closeMenu(); setShowDrawing(true); } },
        { icon: '🎙️', label: 'Ses Kaydet', onPress: () => { closeMenu(); setShowRecorder(true); } },
        { icon: '🎵', label: 'Ses Klibi Ekle', onPress: pickAudioClip },
        { icon: '🎬', label: 'Video Klibi Ekle', onPress: pickVideoClip },
    ];

    return (
        <>
            <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setMenuVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Ek ekle"
                disabled={busy}
            >
                {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.addBtnText}>＋</Text>}
            </TouchableOpacity>

            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeMenu}>
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Ek Ekle</Text>
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
                            <Text style={styles.cancelText}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
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
        </>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        addBtn: {
            width: 28,
            height: 28,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
        },
        addBtnText: { fontSize: 16, fontWeight: '700', color: colors.accent, lineHeight: 18 },
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
            paddingBottom: Spacing.xl,
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
            gap: Spacing.md,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        optionIcon: { fontSize: 20, width: 28, textAlign: 'center' },
        optionLabel: { fontSize: FontSize.md, color: colors.textPrimary },
        cancelRow: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.xs },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
    });
}
