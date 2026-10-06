import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Spacing, dropShadow, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';
import HeaderBackIcon from './HeaderBackIcon';
import { parseDueRange } from '../lib/schedulingIntervals';
import type { ResetCardOptions } from '../lib/resetCards';

type MenuView = 'menu' | 'dueDate' | 'bury' | 'suspend' | 'reschedule' | 'reset' | 'tags';
type ReviewerMenuIcon =
    | 'undo'
    | 'redo'
    | 'whiteboard'
    | 'clear'
    | 'save'
    | 'stylus'
    | 'edit'
    | 'add'
    | 'tag'
    | 'bury'
    | 'suspend'
    | 'delete'
    | 'mark'
    | 'reschedule'
    | 'replay'
    | 'voice'
    | 'deck'
    | 'info';

export interface CardOptionsMenuProps {
    visible: boolean;
    onClose: () => void;
    hasCurrentCard?: boolean;
    cardSuspended: boolean;
    noteMarked: boolean;
    /** Anki shows note-level Bury/Suspend choices only when the note has sibling cards. */
    hasSiblingCards: boolean;
    cardHasAudio: boolean;
    onReplayAudio: () => void;
    onBuryCard: () => void;
    onSuspendCard: () => void;
    /** Anki's Reset Card; its options open at the last choice made in the reviewer. */
    loadResetCardDefaults: () => ResetCardOptions;
    onResetCard: (options: ResetCardOptions) => void;
    onSetDueDate: (spec: string) => void;
    onDeckOptions: () => void;
    onCardInfo?: () => void;
    onToggleMarkNote: () => void;
    onBuryNote: () => void;
    onSuspendNote: () => void;
    canDeleteNote?: boolean;
    onDeleteNote: () => void;
    canUndo: boolean;
    onUndo: () => void;
    canRedo: boolean;
    onRedo: () => void;
    /** Name of the operation Undo would take back, as Anki labels its own Undo entry. */
    undoLabel?: string | null;
    /** Name of the operation Redo would reapply. */
    redoLabel?: string | null;
    onAddNote: () => void;
    onEditNote: () => void;
    noteTags: string;
    onSaveTags: (tags: string) => void;
    whiteboardActive: boolean;
    whiteboardHasContent: boolean;
    onToggleWhiteboard: () => void;
    onUndoWhiteboard: () => void;
    stylusOnly: boolean;
    onToggleStylus: () => void;
    onClearWhiteboard: () => void;
    onSaveWhiteboard: () => void;
    onDisableWhiteboard: () => void;
    voicePlaybackEnabled: boolean;
    onToggleVoicePlayback: () => void;
}

/** AnkiDroid-style reviewer overflow: a compact panel that enters from the right. */
export function CardOptionsMenu(props: CardOptionsMenuProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    // AnkiDroid's reviewer popup occupies a little over half of the phone width. Keeping the
    // same ratio makes it read as an anchored overflow menu instead of a second full screen.
    const panelWidth = Math.min(300, Math.max(232, screenWidth * 0.55));
    const styles = useMemo(() => createStyles(colors), [colors]);
    const translateX = useRef(new Animated.Value(360)).current;
    const [view, setView] = useState<MenuView>('menu');
    const [dueDateInput, setDueDateInput] = useState('1');
    const dueDateSpecValid = parseDueRange(dueDateInput) !== null;
    const [tagsInput, setTagsInput] = useState('');
    const [resetOptions, setResetOptions] = useState<ResetCardOptions>({ restorePosition: true, resetCounts: false });

    useEffect(() => {
        if (!props.visible) return;
        // The reviewer menu is a full-height side surface. Do not let a keyboard left open
        // by typed-answer/editor content reduce its opening bounds.
        Keyboard.dismiss();
        setView('menu');
        translateX.setValue(panelWidth + 16);
        const animation = Animated.spring(translateX, {
            toValue: 0,
            damping: 24,
            stiffness: 260,
            mass: 0.8,
            useNativeDriver: Platform.OS !== 'web',
        });
        animation.start();
        return () => animation.stop();
    }, [props.visible, panelWidth, translateX]);

    useEffect(() => {
        if (view === 'tags') setTagsInput(props.noteTags);
    }, [view, props.noteTags]);


    const close = () => {
        if (view === 'tags' || view === 'dueDate') Keyboard.dismiss();
        // Keep the current panel rendered while the native Modal fades out. Switching a flag
        // panel back to the main menu here makes the overflow menu flash for one frame during
        // dismissal. The opening effect selects the correct view on the next presentation.
        setDueDateInput('1');
        props.onClose();
    };

    const runAndClose = (action: () => void) => {
        close();
        // iOS does not accept a navigation/alert transition while the native modal layer is
        // dismissing. The action runs immediately after that layer has gone away.
        setTimeout(action, Platform.OS === 'ios' ? 180 : 0);
    };

    const confirmAndClose = (title: string, message: string, action: () => void, destructive = false) => {
        close();
        setTimeout(() => confirm(title, message, action, { destructive }), Platform.OS === 'ios' ? 180 : 0);
    };

    const goToParent = () => {
        if (view === 'tags' || view === 'dueDate') Keyboard.dismiss();
        setView(view === 'dueDate' || view === 'reset' ? 'reschedule' : 'menu');
    };
    const sheetTitle = view === 'dueDate'
        ? l('Son tarihi ayarla', 'Set due date')
        : view === 'bury'
            ? l('Göm', 'Bury')
            : view === 'suspend'
                ? l('Askıya al', 'Suspend')
                : view === 'reschedule'
                    ? l('Yeniden zamanla', 'Reschedule')
                    : view === 'reset'
                        ? l('Kartı sıfırla', 'Reset card')
                        : l('Etiketleri düzenle', 'Edit tags');

    const hasCard = props.hasCurrentCard !== false;
    // Anki names its history entries after the operation they act on ("Undo Bury Card"), which is
    // the only thing that tells the learner whether Undo is about to unbury a card or un-answer
    // one. Undo and Redo are separate entries there, so Redo never hides a step still to undo.
    const undoLabel = props.undoLabel
        ? l(`Geri al: ${props.undoLabel}`, `Undo: ${props.undoLabel}`)
        : l('Geri al', 'Undo');
    const redoLabel = props.redoLabel
        ? l(`Yinele: ${props.redoLabel}`, `Redo: ${props.redoLabel}`)
        : l('Yinele', 'Redo');

    return (
        <Modal
            visible={props.visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={close}
        >
            <KeyboardAvoidingView
                style={[styles.overlay, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) }]}
                behavior={Platform.OS === 'ios' && (view === 'tags' || view === 'dueDate') ? 'padding' : undefined}
            >
                <Pressable
                    style={styles.scrim}
                    onPress={close}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kart seçeneklerini kapat', 'Close card options')}
                />
                <Animated.View
                    style={[styles.sheet, { width: panelWidth, transform: [{ translateX }] }]}
                    accessibilityViewIsModal
                >
                    {view !== 'menu' && (
                        <View style={styles.sheetHeader}>
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={goToParent}
                                accessibilityRole="button"
                                accessibilityLabel={l('Önceki menüye dön', 'Back to previous menu')}
                            >
                                <HeaderBackIcon color={colors.textPrimary} size={22} />
                            </TouchableOpacity>
                            <Text style={styles.sheetTitle} numberOfLines={1}>{sheetTitle}</Text>
                            <View style={styles.headerSpacer} />
                        </View>
                    )}

                    <ScrollView
                        style={styles.sheetScroll}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.sheetContent}
                    >
                        {view === 'menu' && (
                            <>
                                {hasCard && props.whiteboardActive && props.whiteboardHasContent && (
                                    <MenuRow
                                        styles={styles}
                                        colors={colors}
                                        icon="undo"
                                        label={l('Konturu geri al', 'Undo stroke')}
                                        onPress={() => runAndClose(props.onUndoWhiteboard)}
                                    />
                                )}
                                {/* Undo survives the end of the queue: the last answer of a
                                    session is exactly the one a learner needs to take back. */}
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="undo"
                                    label={undoLabel}
                                    disabled={!props.canUndo}
                                    onPress={() => runAndClose(props.onUndo)}
                                />
                                {props.canRedo && (
                                    <MenuRow
                                        styles={styles}
                                        colors={colors}
                                        icon="redo"
                                        label={redoLabel}
                                        onPress={() => runAndClose(props.onRedo)}
                                    />
                                )}

                                {hasCard && props.whiteboardActive && (
                                    <>
                                        <MenuRow
                                            styles={styles}
                                            colors={colors}
                                            icon="clear"
                                            label={l('Yazı tahtasını temizle', 'Clear whiteboard')}
                                            disabled={!props.whiteboardHasContent}
                                            onPress={() => runAndClose(props.onClearWhiteboard)}
                                        />
                                        <MenuRow
                                            styles={styles}
                                            colors={colors}
                                            icon="save"
                                            label={l('Yazı tahtasını kaydet', 'Save whiteboard')}
                                            disabled={!props.whiteboardHasContent}
                                            onPress={() => runAndClose(props.onSaveWhiteboard)}
                                        />
                                        <MenuRow
                                            styles={styles}
                                            colors={colors}
                                            icon="stylus"
                                            label={props.stylusOnly ? l('Kalemle yazmayı kapat', 'Disable stylus') : l('Kalemle yazmayı aç', 'Enable stylus')}
                                            onPress={props.onToggleStylus}
                                        />
                                    </>
                                )}

                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="whiteboard"
                                    disabled={!hasCard}
                                    label={props.whiteboardActive
                                        ? l('Yazı tahtasını devre dışı bırak', 'Disable whiteboard')
                                        : l('Yazı tahtasını etkinleştir', 'Enable whiteboard')}
                                    onPress={() => runAndClose(props.whiteboardActive ? props.onDisableWhiteboard : props.onToggleWhiteboard)}
                                />
                                <MenuRow styles={styles} colors={colors} icon="edit" label={l('Notu düzenle', 'Edit note')} disabled={!hasCard} onPress={() => runAndClose(props.onEditNote)} />
                                <MenuRow styles={styles} colors={colors} icon="add" label={l('Not ekle', 'Add note')} onPress={() => runAndClose(props.onAddNote)} />
                                <MenuRow styles={styles} colors={colors} icon="tag" label={l('Etiketleri düzenle', 'Edit tags')} disabled={!hasCard} onPress={() => setView('tags')} />
                                {props.hasSiblingCards ? (
                                    <MenuRow styles={styles} colors={colors} icon="bury" label={l('Göm', 'Bury')} chevron disabled={!hasCard} onPress={() => setView('bury')} />
                                ) : (
                                    <MenuRow styles={styles} colors={colors} icon="bury" label={l('Kartı göm', 'Bury card')} disabled={!hasCard} onPress={() => runAndClose(props.onBuryCard)} />
                                )}
                                {props.hasSiblingCards ? (
                                    <MenuRow styles={styles} colors={colors} icon="suspend" label={l('Askıya al', 'Suspend')} chevron disabled={!hasCard} onPress={() => setView('suspend')} />
                                ) : (
                                    <MenuRow
                                        styles={styles}
                                        colors={colors}
                                        icon="suspend"
                                        disabled={!hasCard}
                                        label={props.cardSuspended ? l('Kartı askıdan çıkar', 'Unsuspend card') : l('Kartı askıya al', 'Suspend card')}
                                        onPress={() => runAndClose(props.onSuspendCard)}
                                    />
                                )}
                                {props.canDeleteNote !== false && (
                                    <MenuRow
                                        styles={styles}
                                        colors={colors}
                                        icon="delete"
                                        disabled={!hasCard}
                                        label={l('Notu sil', 'Delete note')}
                                        onPress={() => confirmAndClose(
                                            l('Notu sil', 'Delete note'),
                                            l('Bu not kalıcı olarak silinecek. Bu işlem geri alınamaz.', 'This note will be permanently deleted. This cannot be undone.'),
                                            props.onDeleteNote,
                                            true,
                                        )}
                                    />
                                )}
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="mark"
                                    disabled={!hasCard}
                                    label={props.noteMarked ? l('Not işaretini kaldır', 'Unmark note') : l('Notu işaretle', 'Mark note')}
                                    onPress={() => runAndClose(props.onToggleMarkNote)}
                                />
                                <MenuRow styles={styles} colors={colors} icon="reschedule" label={l('Yeniden zamanla', 'Reschedule')} chevron disabled={!hasCard} onPress={() => setView('reschedule')} />
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="replay"
                                    label={l('Sesi yeniden oynat', 'Replay audio')}
                                    disabled={!hasCard || !props.cardHasAudio}
                                    onPress={() => runAndClose(props.onReplayAudio)}
                                />
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="voice"
                                    label={props.voicePlaybackEnabled
                                        ? l('Metin okumayı kapat', 'Disable text to speech')
                                        : l('Metin okumayı aç', 'Enable text to speech')}
                                    onPress={() => runAndClose(props.onToggleVoicePlayback)}
                                />
                                <MenuRow styles={styles} colors={colors} icon="deck" label={l('Deste seçenekleri', 'Deck options')} onPress={() => runAndClose(props.onDeckOptions)} />
                                {props.onCardInfo ? (
                                    <MenuRow styles={styles} colors={colors} icon="info" label={l('Kart bilgisi', 'Card info')} disabled={!hasCard} onPress={() => runAndClose(props.onCardInfo!)} />
                                ) : null}
                            </>
                        )}

                        {view === 'bury' && (
                            <>
                                <MenuRow styles={styles} colors={colors} icon="bury" label={l('Notu göm', 'Bury note')} onPress={() => runAndClose(props.onBuryNote)} />
                                <MenuRow styles={styles} colors={colors} icon="bury" label={l('Kartı göm', 'Bury card')} onPress={() => runAndClose(props.onBuryCard)} />
                            </>
                        )}

                        {view === 'suspend' && (
                            <>
                                <MenuRow styles={styles} colors={colors} icon="suspend" label={l('Notu askıya al', 'Suspend note')} onPress={() => runAndClose(props.onSuspendNote)} />
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="suspend"
                                    label={props.cardSuspended ? l('Kartı askıdan çıkar', 'Unsuspend card') : l('Kartı askıya al', 'Suspend card')}
                                    onPress={() => runAndClose(props.onSuspendCard)}
                                />
                            </>
                        )}

                        {view === 'reschedule' && (
                            <>
                                <MenuRow styles={styles} colors={colors} icon="reschedule" label={l('Son tarihi ayarla…', 'Set due date…')} onPress={() => setView('dueDate')} />
                                <MenuRow
                                    styles={styles}
                                    colors={colors}
                                    icon="redo"
                                    label={l('Kartı sıfırla…', 'Reset card…')}
                                    onPress={() => {
                                        setResetOptions(props.loadResetCardDefaults());
                                        setView('reset');
                                    }}
                                />
                            </>
                        )}

                        {view === 'tags' && (
                            <View style={styles.formContent}>
                                <Text style={styles.subDesc}>{l('Etiketleri boşlukla ayırın.', 'Separate tags with spaces.')}</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={tagsInput}
                                    onChangeText={setTagsInput}
                                    placeholder={l('etiketler', 'tags')}
                                    placeholderTextColor={colors.textMuted}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity style={styles.confirmBtn} onPress={() => runAndClose(() => props.onSaveTags(tagsInput))}>
                                    <Text style={styles.confirmBtnText}>{t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {view === 'reset' && (
                            <View style={styles.formContent}>
                                <Text style={styles.subDesc}>
                                    {l('Kart Yeni durumuna döner. Tekrar geçmişi korunur.', 'The card goes back to New. Its review history is kept.')}
                                </Text>
                                <OptionSwitch
                                    styles={styles}
                                    colors={colors}
                                    label={l('Mümkünse ilk sırasına geri koy', 'Restore original position where possible')}
                                    value={resetOptions.restorePosition}
                                    onChange={(restorePosition) => setResetOptions((current) => ({ ...current, restorePosition }))}
                                />
                                <OptionSwitch
                                    styles={styles}
                                    colors={colors}
                                    label={l('Tekrar ve unutma sayılarını sıfırla', 'Reset repetition and lapse counts')}
                                    value={resetOptions.resetCounts}
                                    onChange={(resetCounts) => setResetOptions((current) => ({ ...current, resetCounts }))}
                                />
                                <TouchableOpacity
                                    style={styles.confirmBtn}
                                    onPress={() => runAndClose(() => props.onResetCard(resetOptions))}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.confirmBtnText}>{l('Sıfırla', 'Reset')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {view === 'dueDate' && (
                            <View style={styles.formContent}>
                                <Text style={styles.subDesc}>{l('Kart kaç gün sonra yeniden gösterilsin?', 'Show this card again in how many days?')}</Text>
                                <Text style={styles.subDesc}>
                                    {l('0 = bugün, 1 = yarın, 3-7 = aralıktan rastgele. Sonuna ! eklerseniz aralık da bu değere ayarlanır.',
                                       '0 = today, 1 = tomorrow, 3-7 = random in range. Append ! to also set the interval to that value.')}
                                </Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={dueDateInput}
                                    onChangeText={setDueDateInput}
                                    maxLength={12}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder={l('örn. 1 veya 3-7!', 'e.g. 1 or 3-7!')}
                                    placeholderTextColor={colors.textMuted}
                                />
                                <TouchableOpacity
                                    style={[styles.confirmBtn, !dueDateSpecValid && styles.confirmBtnDisabled]}
                                    disabled={!dueDateSpecValid}
                                    onPress={() => runAndClose(() => props.onSetDueDate(dueDateInput))}
                                >
                                    <Text style={styles.confirmBtnText}>{t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function MenuRow({ styles, colors, icon, label, onPress, chevron, disabled = false }: {
    styles: ReturnType<typeof createStyles>;
    colors: ColorScheme;
    icon: ReviewerMenuIcon;
    label: string;
    onPress: () => void;
    chevron?: boolean;
    disabled?: boolean;
}) {
    const color = disabled ? colors.textMuted : colors.textSecondary;
    return (
        <TouchableOpacity
            style={[styles.row, disabled && styles.rowDisabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
        >
            <View style={styles.rowIcon}><MenuIcon name={icon} color={color} /></View>
            <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>{label}</Text>
            {chevron && <Text style={styles.rowChevron}>›</Text>}
        </TouchableOpacity>
    );
}

function OptionSwitch({ styles, colors, label, value, onChange }: {
    styles: ReturnType<typeof createStyles>;
    colors: ColorScheme;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: colors.border, true: colors.accent }}
                accessibilityLabel={label}
            />
        </View>
    );
}

function MenuIcon({ name, color }: { name: ReviewerMenuIcon; color: string }) {
    const common = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    return (
        <Svg width={24} height={24} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            {name === 'undo' && <Path d="M9 7H4V2M4.5 7A8 8 0 1 1 6 18" {...common} />}
            {name === 'redo' && <Path d="M15 7h5V2m-.5 5A8 8 0 1 0 18 18" {...common} />}
            {name === 'whiteboard' && (
                <>
                    <Path d="M4 18c2-5 3-9 5-9 1.8 0-.2 7 2 7 1.4 0 1.8-4 3.2-4 1.2 0 .4 4 2 4 1.1 0 1.6-1 3.8-1" {...common} />
                    <Path d="m15.2 4.3 4.5 4.5M14.3 5.2l1.8-1.8a1.3 1.3 0 0 1 1.8 0l2.7 2.7a1.3 1.3 0 0 1 0 1.8l-1.8 1.8" {...common} />
                </>
            )}
            {name === 'clear' && <Path d="m5 9 3-5h8l3 5-4 11H9L5 9Zm1 0h12M10 12v5m4-5v5" {...common} />}
            {name === 'save' && <Path d="M5 3h12l2 2v16H5V3Zm3 0v6h8V3M8 21v-7h8v7" {...common} />}
            {name === 'stylus' && <Path d="m4 20 4.2-1 10.9-11a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm10.4-13.2 3 3" {...common} />}
            {name === 'edit' && <Path d="m4 20 4.2-1 10.9-11a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm10.4-13.2 3 3" {...common} />}
            {name === 'add' && <Path d="M12 5v14M5 12h14" {...common} />}
            {name === 'tag' && <Path d="M4 5h9l7 7-8 8-8-8V5Zm4 4h.01" {...common} />}
            {name === 'bury' && (
                <>
                    <Rect x={4} y={6} width={16} height={14} rx={1.5} strokeDasharray="2.4 2.4" {...common} />
                    <Path d="M12 3v10m-3-3 3 3 3-3" {...common} />
                </>
            )}
            {name === 'suspend' && (
                <>
                    <Circle cx={12} cy={12} r={9} {...common} />
                    <Path d="M9.5 9v6m5-6v6" {...common} />
                </>
            )}
            {name === 'delete' && <Path d="M5 7h14M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6" {...common} />}
            {name === 'mark' && <Path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" {...common} />}
            {name === 'reschedule' && (
                <>
                    <Circle cx={12} cy={12} r={8.5} {...common} />
                    <Path d="M12 7v5l-3 2M4 5v4h4" {...common} />
                </>
            )}
            {name === 'replay' && (
                <>
                    <Circle cx={12} cy={12} r={9} {...common} />
                    <Path d="m10 8 6 4-6 4V8Z" {...common} />
                </>
            )}
            {name === 'voice' && <Path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Zm-3 6a6 6 0 0 0 12 0M12 17v4m-3 0h6" {...common} />}
            {name === 'deck' && <Path d="M4 6h6m4 0h6M4 12h10m4 0h2M4 18h3m4 0h9M10 4v4m4 2v4m-7 2v4" {...common} />}
            {name === 'info' && (
                <>
                    <Circle cx={12} cy={12} r={9} {...common} />
                    <Path d="M12 16v-4m0-4h.01" {...common} />
                </>
            )}
        </Svg>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            alignItems: 'flex-end',
        },
        scrim: {
            ...StyleSheet.absoluteFill,
            backgroundColor: 'rgba(0,0,0,0.22)',
        },
        sheet: {
            maxHeight: '100%',
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            overflow: 'hidden',
            ...dropShadow({ x: -4, y: 4, blur: 10, opacity: 0.22, elevation: 16 }),
        },
        sheetScroll: {
            flexGrow: 0,
        },
        sheetHeader: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        sheetTitle: {
            flex: 1,
            textAlign: 'center',
            fontSize: FontSize.md,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        backBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
        headerSpacer: { width: 46, height: 46 },
        sheetContent: { paddingVertical: 4, paddingBottom: 6 },
        row: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 15,
            paddingVertical: 7,
        },
        rowDisabled: { opacity: 0.48 },
        rowIcon: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
        rowLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
        rowLabelDisabled: { color: colors.textMuted },
        rowChevron: { color: colors.textPrimary, fontSize: 22, marginLeft: 5 },
        flagSwatch: {
            width: 20,
            height: 20,
            borderRadius: 3,
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: 14,
        },
        formContent: { paddingTop: Spacing.md },
        switchRow: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            marginBottom: Spacing.sm,
            gap: Spacing.sm,
        },
        switchLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
        subDesc: { color: colors.textSecondary, fontSize: FontSize.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
        textInput: {
            minHeight: 48,
            marginHorizontal: Spacing.md,
            marginBottom: Spacing.md,
            paddingHorizontal: Spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            color: colors.textPrimary,
            fontSize: FontSize.md,
        },
        confirmBtn: {
            minHeight: 46,
            marginHorizontal: Spacing.md,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
        },
        confirmBtnDisabled: {
            opacity: 0.4,
        },
        confirmBtnText: { color: colors.white, fontSize: FontSize.md, fontWeight: '700' },
    });
}
