import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Pressable } from 'react-native';
import {
    useAudioRecorder,
    useAudioRecorderState,
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
} from 'expo-audio';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirmAsync } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import { useI18n } from '../hooks/useI18n';

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
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const state = useAudioRecorderState(recorder, 200);
    const [saving, setSaving] = useState(false);
    // The recorder outlives the dialog, and so does the duration of the last take. Without this
    // the dialog reopens still showing "0:37" from the recording before it.
    const [started, setStarted] = useState(false);
    useEffect(() => { if (visible) setStarted(false); }, [visible]);

    /**
     * Hand the audio session back.
     *
     * Recording puts iOS into `playAndRecord`, which routes playback to the receiver rather than
     * the speaker. This was set when a recording started and never unset, so one recording left
     * every card sound and every text-to-speech reading for the rest of the session playing
     * quietly out of the earpiece.
     */
    const releaseRecordingSession = async () => {
        try {
            await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        } catch (e) {
            console.warn('[AudioRecordModal] could not release the audio session:', e);
        }
    };

    const startRecording = async () => {
        try {
            const perm = await requestRecordingPermissionsAsync();
            if (!perm.granted) {
                await promptPermissionSettings({
                    title: l('İzin gerekli', 'Permission Required'),
                    message: l(
                        'Ses kaydetmek için mikrofon izni vermeniz gerekiyor. Ayarlardan mikrofon iznini açabilirsiniz.',
                        'Allow microphone access to record audio. You can enable microphone access in Settings.',
                    ),
                    settingsLabel: l('Ayarları Aç', 'Open Settings'),
                    cancelLabel: t('common.cancel'),
                });
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
            setStarted(true);
        } catch (e) {
            console.warn('[AudioRecordModal] start failed:', e);
            alert(t('common.error'), l('Kayıt başlatılamadı.', 'Could not start recording.'));
        }
    };

    const stopAndSave = async () => {
        try {
            await recorder.stop();
            await releaseRecordingSession();
            const uri = recorder.uri;
            if (!uri) {
                onClose();
                return;
            }
            setSaving(true);

            let extension = 'm4a';
            let mimeType: string | undefined = 'audio/mp4';
            if (Platform.OS === 'web') {
                const response = await fetch(uri);
                const blobType = (await response.clone().blob()).type;
                if (blobType) {
                    mimeType = blobType;
                    if (blobType.includes('webm')) extension = 'webm';
                    else if (blobType.includes('ogg')) extension = 'ogg';
                    else if (blobType.includes('wav')) extension = 'wav';
                    else if (blobType.includes('mp4') || blobType.includes('aac')) extension = 'm4a';
                }
                const bytes = new Uint8Array(await response.arrayBuffer());
                const filename = sanitizeMediaFilename(`${Date.now()}_kayit.${extension}`);
                await saveMediaBytes(filename, bytes, mimeType);
                onSaved(filename);
                onClose();
            } else {
                const filename = sanitizeMediaFilename(`${Date.now()}_kayit.${extension}`);
                await saveMediaFromUri(filename, uri, mimeType);
                onSaved(filename);
                onClose();
            }
        } catch (e) {
            console.warn('[AudioRecordModal] save failed:', e);
            alert(t('common.error'), l('Ses kaydı kaydedilemedi.', 'Could not save the audio recording.'));
        } finally {
            setSaving(false);
        }
    };

    /**
     * Leave without keeping the recording.
     *
     * A recording in progress is unsaved work and the overlay behind the dialog is a large,
     * easy target, so throwing one away is confirmed the way any other destructive action is.
     */
    const discardAndClose = async () => {
        if (state.isRecording) {
            const discard = await confirmAsync(
                l('Kayıt silinsin mi?', 'Discard recording?'),
                l('Süren kayıt kaydedilmeden silinecek.', 'The recording in progress will be discarded.'),
                { destructive: true },
            );
            if (!discard) return;
        }
        try {
            if (state.isRecording) await recorder.stop();
        } catch (e) {
            console.warn('[AudioRecordModal] discard failed:', e);
        }
        await releaseRecordingSession();
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={discardAndClose}>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={discardAndClose}
                    accessibilityLabel={l('Ses kaydı penceresini kapat', 'Close audio recording dialog')}
                />
                <View style={styles.card}>
                    <Text style={styles.title}>🎙️ {l('Ses kaydet', 'Record Audio')}</Text>
                    <Text style={styles.duration}>{formatDuration(started ? state.durationMillis : 0)}</Text>
                    <Text style={styles.status}>
                        {state.isRecording ? l('Kayıt sürüyor…', 'Recording…') : saving ? l('Dosya kaydediliyor…', 'Saving recording…') : l('Başlamak için mikrofona dokunun', 'Tap the microphone to start')}
                    </Text>

                    <TouchableOpacity
                        style={[styles.recordBtn, state.isRecording && styles.recordBtnActive]}
                        onPress={state.isRecording ? stopAndSave : startRecording}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={state.isRecording ? l('Kaydı durdur ve kaydet', 'Stop and save recording') : l('Kaydı başlat', 'Start recording')}
                    >
                        <Text style={styles.recordBtnText}>{state.isRecording ? '⏹️' : '🎙️'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.cancelBtn} onPress={discardAndClose} disabled={saving}>
                        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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
