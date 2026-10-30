import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    setIsAudioActiveAsync,
    useAudioPlayer,
    useAudioPlayerStatus,
    useAudioRecorder,
    useAudioRecorderState,
    type RecordingOptions,
} from 'expo-audio';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirmAsync } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import {
    MIN_RECORDING_MS,
    emptyLevels,
    formatRecordingTime,
    levelFromMetering,
    pushLevel,
    recordingFileType,
    type RecorderPhase,
} from '../lib/audioRecording';
import { useI18n } from '../hooks/useI18n';
import SwipeDismissSheet from './SwipeDismissSheet';
import { PauseIcon, PlayIcon, RetakeIcon } from './editor/AttachmentIcons';

interface AudioRecordModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called with the saved media filename once a recording is kept. */
    onSaved: (filename: string) => void;
}

interface RecorderSheetProps extends AudioRecordModalProps {
    /** The modal has finished fading out, so the recorder can be let go. */
    onDismissed: () => void;
}

/** A voice note: one microphone needs one channel, which halves the file of the stereo preset. */
const VOICE_RECORDING: RecordingOptions = {
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 96000,
    isMeteringEnabled: true,
};

type Take = { uri: string; durationMillis: number };

/** Copy a finished take into the collection's media and return the name it is stored under. */
async function storeTake(uri: string): Promise<string> {
    if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        const { extension, mimeType } = recordingFileType(blob.type);
        const filename = sanitizeMediaFilename(`${Date.now()}_kayit.${extension}`);
        await saveMediaBytes(filename, new Uint8Array(await blob.arrayBuffer()), mimeType);
        return filename;
    }
    const { extension, mimeType } = recordingFileType();
    const filename = sanitizeMediaFilename(`${Date.now()}_kayit.${extension}`);
    await saveMediaFromUri(filename, uri, mimeType);
    return filename;
}

/**
 * Hand the audio session back once the microphone is no longer needed. Left in record mode,
 * Bluetooth headphones stay in their low-quality call profile and other apps' audio stays off.
 */
async function releaseAudioSession(): Promise<void> {
    try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        await setIsAudioActiveAsync(false);
    } catch (error) {
        console.warn('[AudioRecordModal] could not release the audio session:', error);
    }
}

/**
 * Record a voice note for a field: record, pause and resume, listen back, record again, add.
 * A take is never thrown away by a stray tap or swipe — closing with one asks first.
 *
 * Every field of the editor has its own attach button, so the recorder, its player and the
 * status polling they need exist only while this sheet is on screen and fading out.
 */
export default function AudioRecordModal({ visible, onClose, onSaved }: AudioRecordModalProps) {
    const [mounted, setMounted] = useState(visible);
    useEffect(() => {
        if (visible) {
            setMounted(true);
            return;
        }
        // iOS reports the end of the fade through onDismiss; the timer covers a dismissal it misses.
        const timer = setTimeout(() => setMounted(false), Platform.OS === 'ios' ? 600 : 0);
        return () => clearTimeout(timer);
    }, [visible]);
    const dismissed = useCallback(() => setMounted(false), []);
    if (!visible && !mounted) return null;
    return <RecorderSheet visible={visible} onClose={onClose} onSaved={onSaved} onDismissed={dismissed} />;
}

function RecorderSheet({ visible, onClose, onSaved, onDismissed }: RecorderSheetProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const recorder = useAudioRecorder(VOICE_RECORDING);
    const recorderState = useAudioRecorderState(recorder, 100);
    const player = useAudioPlayer(null, { updateInterval: 100 });
    const playback = useAudioPlayerStatus(player);
    const [phase, setPhase] = useState<RecorderPhase>('idle');
    const [take, setTake] = useState<Take | null>(null);
    const [levels, setLevels] = useState(emptyLevels);
    const [busy, setBusy] = useState(false);
    const phaseRef = useRef<RecorderPhase>('idle');
    const elapsedRef = useRef(0);
    const sessionClaimedRef = useRef(false);
    phaseRef.current = phase;

    // Leaving the editor with the sheet open still gives the microphone's audio session back.
    useEffect(() => () => {
        if (sessionClaimedRef.current) void releaseAudioSession();
    }, []);

    useEffect(() => {
        if (phase !== 'recording') return;
        elapsedRef.current = Math.max(elapsedRef.current, recorderState.durationMillis);
        setLevels((current) => pushLevel(current, levelFromMetering(recorderState.metering)));
    }, [phase, recorderState.durationMillis, recorderState.metering]);

    // iOS stops the microphone when the app leaves the screen; pausing first keeps the take whole
    // and leaves the sheet saying what actually happened.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'background' || phaseRef.current !== 'recording') return;
            try {
                recorder.pause();
                setPhase('paused');
            } catch (error) {
                console.warn('[AudioRecordModal] pause on background failed:', error);
            }
        });
        return () => subscription.remove();
    }, [recorder]);

    const startRecording = async () => {
        setBusy(true);
        try {
            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
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
            player.pause();
            sessionClaimedRef.current = true;
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
            setTake(null);
            setLevels(emptyLevels());
            elapsedRef.current = 0;
            setPhase('recording');
        } catch (error) {
            console.warn('[AudioRecordModal] start failed:', error);
            alert(t('common.error'), l('Kayıt başlatılamadı.', 'Could not start recording.'));
        } finally {
            setBusy(false);
        }
    };

    const pauseOrResume = () => {
        try {
            if (phase === 'recording') {
                recorder.pause();
                setPhase('paused');
            } else if (phase === 'paused') {
                recorder.record();
                setPhase('recording');
            }
        } catch (error) {
            console.warn('[AudioRecordModal] pause/resume failed:', error);
        }
    };

    /** Stop the microphone and keep what it recorded, ready to be heard or added. */
    const finishTake = async (): Promise<Take | null> => {
        const durationMillis = Math.max(elapsedRef.current, recorder.getStatus().durationMillis);
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
            setPhase('idle');
            return null;
        }
        const finished = { uri, durationMillis };
        setTake(finished);
        setPhase('recorded');
        player.replace({ uri });
        return finished;
    };

    const stopRecording = async () => {
        setBusy(true);
        try {
            await finishTake();
        } catch (error) {
            console.warn('[AudioRecordModal] stop failed:', error);
            alert(t('common.error'), l('Kayıt durdurulamadı.', 'Could not stop the recording.'));
        } finally {
            setBusy(false);
        }
    };

    const togglePlayback = () => {
        if (playback.playing) {
            player.pause();
            return;
        }
        if (playback.duration > 0 && playback.currentTime >= playback.duration - 0.05) void player.seekTo(0);
        player.play();
    };

    const close = async () => {
        player.pause();
        if (sessionClaimedRef.current) {
            sessionClaimedRef.current = false;
            await releaseAudioSession();
        }
        onClose();
    };

    const add = async () => {
        setBusy(true);
        try {
            const kept = phase === 'recording' || phase === 'paused' ? await finishTake() : take;
            if (!kept) return;
            player.pause();
            const filename = await storeTake(kept.uri);
            onSaved(filename);
            await close();
        } catch (error) {
            console.warn('[AudioRecordModal] save failed:', error);
            alert(t('common.error'), l('Ses kaydı kaydedilemedi.', 'Could not save the audio recording.'));
        } finally {
            setBusy(false);
        }
    };

    const requestClose = async () => {
        if (busy) return;
        if (phase !== 'idle') {
            const discard = await confirmAsync(
                l('Kayıt silinsin mi?', 'Discard the recording?'),
                l('Kaydettiğiniz ses alana eklenmeden silinecek.', 'What you recorded will be deleted without being added.'),
                { destructive: true, confirmLabel: l('Sil', 'Delete') },
            );
            if (!discard) return;
            try {
                if (phaseRef.current === 'recording' || phaseRef.current === 'paused') await recorder.stop();
            } catch (error) {
                console.warn('[AudioRecordModal] discard failed:', error);
            }
        }
        await close();
    };

    const recordedMs = phase === 'idle'
        ? 0
        : phase === 'recorded'
            ? take?.durationMillis ?? 0
            : Math.max(elapsedRef.current, recorderState.durationMillis);
    const listening = phase === 'recorded' && (playback.playing || playback.currentTime > 0);
    const clockMs = listening ? playback.currentTime * 1000 : recordedMs;
    const progress = listening && playback.duration > 0 ? Math.min(1, playback.currentTime / playback.duration) : 0;
    const canAdd = !busy && (phase === 'recorded' || ((phase === 'recording' || phase === 'paused') && recordedMs >= MIN_RECORDING_MS));

    const status = phase === 'idle'
        ? l('Başlamak için dokunun', 'Tap to start')
        : phase === 'recording'
            ? l('Kaydediliyor', 'Recording')
            : phase === 'paused'
                ? l('Duraklatıldı', 'Paused')
                : playback.playing
                    ? l('Dinleniyor', 'Playing')
                    : l('Dinleyip ekleyebilirsiniz', 'Listen back, then add');

    const secondary = phase === 'recording' || phase === 'paused' || phase === 'recorded' ? (
        <TouchableOpacity
            style={styles.secondaryButton}
            onPress={phase === 'recorded' ? startRecording : pauseOrResume}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={phase === 'recording'
                ? l('Kaydı duraklat', 'Pause recording')
                : phase === 'paused'
                    ? l('Kayda devam et', 'Resume recording')
                    : l('Yeniden kaydet', 'Record again')}
        >
            <View style={styles.secondaryCircle}>
                {phase === 'recording' ? <PauseIcon color={colors.textPrimary} size={20} />
                    : phase === 'paused' ? <View style={styles.resumeDot} />
                        : <RetakeIcon color={colors.textPrimary} size={22} />}
            </View>
            <Text style={styles.secondaryLabel}>
                {phase === 'recording' ? l('Duraklat', 'Pause') : phase === 'paused' ? l('Devam', 'Resume') : l('Yeniden', 'Redo')}
            </Text>
        </TouchableOpacity>
    ) : null;

    const primary = phase === 'recorded' ? (
        <TouchableOpacity
            style={[styles.primaryButton, styles.playButton]}
            onPress={togglePlayback}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={playback.playing ? l('Dinlemeyi durdur', 'Pause playback') : l('Kaydı dinle', 'Play the recording')}
        >
            {playback.playing ? <PauseIcon color={colors.white} size={28} /> : <PlayIcon color={colors.white} size={30} />}
        </TouchableOpacity>
    ) : (
        <TouchableOpacity
            style={styles.primaryButton}
            onPress={phase === 'idle' ? startRecording : stopRecording}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={phase === 'idle' ? l('Kaydı başlat', 'Start recording') : l('Kaydı bitir', 'Stop recording')}
        >
            <View style={phase === 'idle' ? styles.recordDot : styles.stopSquare} />
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose} onDismiss={onDismissed}>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={requestClose}
                    accessibilityLabel={l('Ses kaydı penceresini kapat', 'Close audio recording dialog')}
                />
                <SwipeDismissSheet active={visible} enabled={phase === 'idle' && !busy} style={styles.sheet} onDismiss={close}>
                    <View style={styles.header}>
                        <TouchableOpacity style={styles.headerButton} onPress={requestClose} disabled={busy} accessibilityRole="button">
                            <Text style={styles.cancelText}>{l('Vazgeç', 'Cancel')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.title}>{l('Ses kaydet', 'Record Audio')}</Text>
                        <TouchableOpacity
                            style={[styles.headerButton, styles.headerButtonEnd]}
                            onPress={add}
                            disabled={!canAdd}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !canAdd }}
                        >
                            {busy && phase !== 'idle'
                                ? <ActivityIndicator size="small" color={colors.accent} />
                                : <Text style={[styles.addText, !canAdd && styles.addTextDisabled]}>{l('Ekle', 'Add')}</Text>}
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.clock} accessibilityRole="timer">{formatRecordingTime(clockMs)}</Text>
                    <View style={styles.statusRow}>
                        {phase === 'recording' ? <View style={styles.liveDot} /> : null}
                        <Text style={styles.status}>{status}</Text>
                    </View>

                    {phase === 'recorded' ? (
                        <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
                        </View>
                    ) : (
                        <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            {levels.map((level, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.meterBar,
                                        { height: 4 + level * 32 },
                                        phase === 'recording' && styles.meterBarLive,
                                    ]}
                                />
                            ))}
                        </View>
                    )}

                    <View style={styles.controls}>
                        <View style={styles.sideSlot}>{secondary}</View>
                        {primary}
                        <View style={styles.sideSlot} />
                    </View>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    const record = colors.btnAgain;
    return StyleSheet.create({
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
            paddingTop: 40,
            paddingBottom: 40,
            alignItems: 'center',
        },
        header: {
            alignSelf: 'stretch',
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
        },
        headerButton: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
        headerButtonEnd: { alignItems: 'flex-end' },
        title: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        cancelText: { fontSize: FontSize.md, color: colors.textMuted, fontWeight: '600' },
        addText: { fontSize: FontSize.md, color: colors.accent, fontWeight: '700' },
        addTextDisabled: { color: colors.border },
        clock: {
            marginTop: Spacing.lg,
            fontSize: 44,
            fontWeight: '300',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
        liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: record },
        status: { fontSize: FontSize.sm, color: colors.textMuted },
        meter: {
            height: 40,
            marginTop: Spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
        },
        meterBar: { width: 3, borderRadius: 2, backgroundColor: colors.border },
        meterBarLive: { backgroundColor: record },
        track: {
            alignSelf: 'stretch',
            height: 4,
            marginTop: Spacing.lg + 18,
            marginBottom: 18,
            marginHorizontal: Spacing.xl,
            borderRadius: 2,
            backgroundColor: colors.borderLight,
            overflow: 'hidden',
        },
        trackFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
        controls: {
            marginTop: Spacing.xl,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        sideSlot: { width: 96, alignItems: 'center' },
        primaryButton: {
            width: 76,
            height: 76,
            borderRadius: 38,
            borderWidth: 4,
            borderColor: colors.borderLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        playButton: { borderWidth: 0, backgroundColor: colors.accent },
        recordDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: record },
        stopSquare: { width: 28, height: 28, borderRadius: 6, backgroundColor: record },
        secondaryButton: { alignItems: 'center', gap: 6 },
        secondaryCircle: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.bgSecondary,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        resumeDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: record },
        secondaryLabel: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '600' },
    });
}
