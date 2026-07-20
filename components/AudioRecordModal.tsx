import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import {
    useAudioRecorder,
    useAudioRecorderState,
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
} from 'expo-audio';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { saveMediaBytes } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';

interface AudioRecordModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called with the saved media filename once a recording is kept. */
    onSaved: (filename: string) => void;
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function AudioRecordModal({ visible, onClose, onSaved }: AudioRecordModalProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const state = useAudioRecorderState(recorder, 200);
    const [saving, setSaving] = useState(false);

    const startRecording = async () => {
        try {
            const perm = await requestRecordingPermissionsAsync();
            if (!perm.granted) {
                alert('İzin gerekli', 'Ses kaydetmek için mikrofon izni vermeniz gerekiyor.');
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
        } catch (e) {
            console.warn('[AudioRecordModal] start failed:', e);
            alert('Hata', 'Kayıt başlatılamadı.');
        }
    };

    const stopAndSave = async () => {
        try {
            await recorder.stop();
            const uri = recorder.uri;
            if (!uri) {
                onClose();
                return;
            }
            setSaving(true);
            const response = await fetch(uri);

            // The browser records into whatever container it supports (typically webm/opus),
            // not m4a — name the file after the real container and keep its MIME type, or
            // the <audio> player will refuse the mislabeled bytes.
            let extension = 'm4a';
            let mimeType: string | undefined;
            if (Platform.OS === 'web') {
                const blobType = (await response.clone().blob()).type;
                if (blobType) {
                    mimeType = blobType;
                    if (blobType.includes('webm')) extension = 'webm';
                    else if (blobType.includes('ogg')) extension = 'ogg';
                    else if (blobType.includes('wav')) extension = 'wav';
                    else if (blobType.includes('mp4') || blobType.includes('aac')) extension = 'm4a';
                }
            }

            const bytes = new Uint8Array(await response.arrayBuffer());
            const filename = sanitizeMediaFilename(`${Date.now()}_kayit.${extension}`);
            await saveMediaBytes(filename, bytes, mimeType);
            onSaved(filename);
            onClose();
        } catch (e) {
            console.warn('[AudioRecordModal] save failed:', e);
            alert('Hata', 'Ses kaydı kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const discardAndClose = async () => {
        try {
            if (state.isRecording) await recorder.stop();
        } catch (e) {
            console.warn('[AudioRecordModal] discard failed:', e);
        }
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={discardAndClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>🎙️ Ses Kaydet</Text>
                    <Text style={styles.duration}>{formatDuration(state.durationMillis)}</Text>
                    <Text style={styles.status}>
                        {state.isRecording ? 'Kaydediliyor…' : saving ? 'Kaydediliyor (dosya)…' : 'Başlamak için mikrofona basın'}
                    </Text>

                    <TouchableOpacity
                        style={[styles.recordBtn, state.isRecording && styles.recordBtnActive]}
                        onPress={state.isRecording ? stopAndSave : startRecording}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={state.isRecording ? 'Kaydı durdur ve kaydet' : 'Kaydı başlat'}
                    >
                        <Text style={styles.recordBtnText}>{state.isRecording ? '⏹️' : '🎙️'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.cancelBtn} onPress={discardAndClose} disabled={saving}>
                        <Text style={styles.cancelText}>Vazgeç</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 320,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.xl,
            alignItems: 'center',
            gap: Spacing.sm,
            ...Shadows.lg,
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        duration: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, marginTop: Spacing.sm },
        status: { fontSize: FontSize.sm, color: colors.textMuted, marginBottom: Spacing.md },
        recordBtn: {
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.badgeNewBg,
            borderWidth: 2,
            borderColor: colors.badgeNew,
            alignItems: 'center',
            justifyContent: 'center',
        },
        recordBtnActive: { backgroundColor: colors.badgeNew },
        recordBtnText: { fontSize: 28 },
        cancelBtn: { marginTop: Spacing.lg, paddingVertical: 6 },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
    });
}
