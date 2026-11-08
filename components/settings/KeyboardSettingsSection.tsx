import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Choice';
import { Notice } from '../ui/Feedback';
import { ValueRow } from '../ui/Rows';
import { HIT_TARGET, Radius, Type } from '../ui/tokens';
import { keyBindingRecordingResult } from '../../lib/hardwareKeyboard';
import { DEFAULT_KEY_BINDINGS } from '../../lib/storage';
import type { KeyBindings } from '../../lib/types';

const KEY_ROWS: Array<{ field: keyof KeyBindings; tr: string; en: string }> = [
    { field: 'showAnswer', tr: 'Cevabı göster', en: 'Show answer' },
    { field: 'again', tr: 'Tekrar', en: 'Answer again' },
    { field: 'hard', tr: 'Zor', en: 'Answer hard' },
    { field: 'good', tr: 'İyi', en: 'Answer good' },
    { field: 'easy', tr: 'Kolay', en: 'Answer easy' },
    { field: 'replayAudio', tr: 'Sesi yeniden oynat', en: 'Replay audio' },
    { field: 'buryCard', tr: 'Kartı göm', en: 'Bury card' },
    { field: 'suspendCard', tr: 'Kartı askıya al', en: 'Suspend card' },
    { field: 'markNote', tr: 'Notu işaretle', en: 'Mark note' },
];

function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toUpperCase() : key;
}

type Props = { bindings: KeyBindings; onChange: (bindings: KeyBindings) => void };

export default function KeyboardSettingsSection({ bindings, onChange }: Props) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [recordingField, setRecordingField] = useState<keyof KeyBindings | null>(null);
    // A key another action already uses is refused here: saving two actions on one key would be ambiguous.
    const [conflict, setConflict] = useState<{ key: string; row: (typeof KEY_ROWS)[number] } | null>(null);
    const recordingRef = useRef<keyof KeyBindings | null>(null);
    const buttonPressRef = useRef<{ field: keyof KeyBindings; cancelling: boolean } | null>(null);

    useEffect(() => () => { recordingRef.current = null; }, []);

    const cancelRecording = useCallback((field?: keyof KeyBindings) => {
        if (field && recordingRef.current !== field) return;
        recordingRef.current = null;
        setRecordingField(null);
    }, []);

    const recordKey = useCallback((key: string, sourceField?: keyof KeyBindings) => {
        const field = recordingRef.current;
        if (!field || (sourceField && sourceField !== field)) return false;
        const result = keyBindingRecordingResult(key);
        if (result.kind === 'ignore') return false;
        // Native Enter can emit both key-press and submit. Only the first event records a key.
        cancelRecording();
        if (result.kind !== 'bind') return true;
        const taken = KEY_ROWS.find((row) => row.field !== field
            && bindings[row.field].toLowerCase() === result.key.toLowerCase());
        if (taken) {
            setConflict({ key: result.key, row: taken });
            return true;
        }
        setConflict(null);
        onChange({ ...bindings, [field]: result.key });
        return true;
    }, [bindings, cancelRecording, onChange]);

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || !recordingField) return;
        const onKeyDown = (event: KeyboardEvent) => {
            // Hold/repeat and unfinished IME events must not bind the next selected row.
            if (event.repeat || event.isComposing) return;
            if (!recordKey(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
        };
        const onBlur = () => cancelRecording();
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('blur', onBlur);
        };
    }, [cancelRecording, recordKey, recordingField]);

    const startRecording = (field: keyof KeyBindings) => {
        const press = buttonPressRef.current;
        buttonPressRef.current = null;
        // The hidden native input may blur between touch-down and the button's press event.
        if ((press?.field === field && press.cancelling) || recordingRef.current === field) {
            cancelRecording();
            return;
        }
        Keyboard.dismiss();
        setConflict(null);
        recordingRef.current = field;
        setRecordingField(field);
    };

    return (
        <Card
            divided
            title={l('Klavye', 'Keyboard')}
            description={l(
                'Bir satırda Değiştir’e dokunun, ardından bağlı fiziksel klavyede bir tuşa basın. Her tuşu yalnızca bir işleme atayın. Esc çalışmadan çıkar, Z veya U son işlemi geri alır. Değişiklikleri Kaydet ile saklayın.',
                'Choose Change on a row, then press a key on a connected physical keyboard. Give each key to only one action. Esc leaves study, and Z or U undoes the last action. Use Save to keep your changes.',
            )}
        >
            {KEY_ROWS.map((row) => {
                const recording = recordingField === row.field;
                const label = l(row.tr, row.en);
                return (
                    <ValueRow key={row.field} label={label}>
                        <View style={styles.keySlot} accessibilityLiveRegion="polite">
                            <Badge
                                tone="accent"
                                label={recording ? l('Bir tuşa basın', 'Press a key') : formatKeyLabel(bindings[row.field])}
                                style={styles.keyBadge}
                            />
                            {recording && Platform.OS !== 'web' ? (
                                <TextInput
                                    key={row.field}
                                    autoFocus
                                    value=""
                                    onChangeText={() => undefined}
                                    onKeyPress={(event) => recordKey(event.nativeEvent.key, row.field)}
                                    onSubmitEditing={() => recordKey('Enter', row.field)}
                                    onBlur={() => cancelRecording(row.field)}
                                    showSoftInputOnFocus={false}
                                    caretHidden
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    spellCheck={false}
                                    contextMenuHidden
                                    accessible={false}
                                    importantForAccessibility="no-hide-descendants"
                                    style={styles.capture}
                                />
                            ) : null}
                        </View>
                        {/* Drawn as a compact secondary Button. The kit's Button has no press-in, and this
                            one records at touch-down whether the press began while the row was recording. */}
                        <TouchableOpacity
                            style={styles.changeButton}
                            hitSlop={{ top: (HIT_TARGET - 40) / 2, bottom: (HIT_TARGET - 40) / 2 }}
                            onPressIn={() => { buttonPressRef.current = { field: row.field, cancelling: recordingRef.current === row.field }; }}
                            onPress={() => startRecording(row.field)}
                            accessibilityRole="button"
                            accessibilityLabel={recording
                                ? l(`${label} tuş atamasını iptal et`, `Cancel key assignment for ${label}`)
                                : l(`${label} kısayolunu değiştir`, `Change shortcut for ${label}`)}
                            accessibilityHint={l('Bağlı fiziksel klavyede bir tuşa basın', 'Press a key on a connected physical keyboard')}
                        >
                            <Text style={styles.changeText} numberOfLines={1}>{recording ? l('İptal', 'Cancel') : l('Değiştir', 'Change')}</Text>
                        </TouchableOpacity>
                    </ValueRow>
                );
            })}
            {conflict ? (
                <View style={styles.block}>
                    <Notice tone="danger">
                        <Text style={styles.conflict} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                            {l(
                                `${formatKeyLabel(conflict.key)} zaten “${conflict.row.tr}” için kullanılıyor. Başka bir tuş seçin.`,
                                `${formatKeyLabel(conflict.key)} is already used for “${conflict.row.en}”. Choose another key.`,
                            )}
                        </Text>
                    </Notice>
                </View>
            ) : null}
            {JSON.stringify(bindings) !== JSON.stringify(DEFAULT_KEY_BINDINGS) ? (
                <View style={styles.block}>
                    <Button
                        variant="secondary"
                        label={l('Kısayolları sıfırla', 'Reset shortcuts')}
                        onPress={() => { cancelRecording(); setConflict(null); onChange({ ...DEFAULT_KEY_BINDINGS }); }}
                    />
                </View>
            ) : null}
        </Card>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        block: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
        keySlot: { minWidth: 54, alignItems: 'center', justifyContent: 'center' },
        keyBadge: { alignSelf: 'center' },
        capture: { position: 'absolute', width: 1, height: 1, opacity: 0 },
        conflict: { ...Type.caption, color: colors.textPrimary },
        // The kit's compact secondary Button, which this one has to stand in for.
        changeButton: {
            minHeight: 40,
            minWidth: HIT_TARGET,
            paddingHorizontal: Spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        changeText: { ...Type.button, fontSize: FontSize.sm, color: colors.textPrimary },
    });
}
