import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from './AppText';
import { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, Spacing, dropShadow, useThemeColors, type ColorScheme } from '../constants/theme';
import { MotionSpring, NATIVE_DRIVER } from '../constants/motion';
import { confirm } from '../lib/confirm';
import { getSetDueDateDefault } from '../lib/setDueDateDefaults';
import { useI18n } from '../hooks/useI18n';
import PencilGlyph from './PencilGlyph';
import CalendarGlyph from './CalendarGlyph';
import InfoCircleGlyph from './InfoCircleGlyph';
import StarGlyph from './StarGlyph';
import { EraserGlyph } from './drawing/drawingGlyphs';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';
import {
    BuryGlyph,
    DownloadGlyph,
    PauseCircleGlyph,
    PlayCircleGlyph,
    PlusGlyph,
    SlidersGlyph,
    SpeakerGlyph,
    TagGlyph,
} from './UiGlyphs';
import { Button, IconButton } from './ui/Button';
import { TextField } from './ui/Fields';
import { BackIcon, RedoIcon, TrashIcon, UndoIcon } from './ui/icons';
import { MenuItem } from './ui/Menu';
import { AppSwitch } from './ui/Rows';
import { HIT_TARGET, Radius } from './ui/tokens';
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
    /** Replay Audio has sound files, `{{tts}}` regions or (with text to speech on) text to play. */
    canReplayAudio: boolean;
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
    const [dueDateInput, setDueDateInput] = useState('');
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
        // Critically damped: the panel lands on the screen's edge without bouncing off it.
        const animation = Animated.spring(translateX, {
            toValue: 0,
            ...MotionSpring.panel,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        animation.start();
        return () => animation.stop();
    }, [props.visible, panelWidth, translateX]);

    useEffect(() => {
        if (view === 'tags') setTagsInput(props.noteTags);
        if (view === 'dueDate') setDueDateInput(getSetDueDateDefault('reviewer'));
    }, [view, props.noteTags]);


    const close = () => {
        if (view === 'tags' || view === 'dueDate') Keyboard.dismiss();
        // Keep the current panel rendered while the native Modal fades out. Switching a flag
        // panel back to the main menu here makes the overflow menu flash for one frame during
        // dismissal. The opening effect selects the correct view on the next presentation.
        props.onClose();
    };

    const runAndClose = (action: () => void) => {
        close();
        // iOS does not accept a navigation/alert transition while the native modal layer is
        // dismissing. The action runs immediately after that layer has gone away.
        setTimeout(action, Platform.OS === 'ios' ? 180 : 0);
    };

    // The keyboard's return key submits these one-line forms, as Anki's own prompts do on Enter.
    const saveTags = () => runAndClose(() => props.onSaveTags(tagsInput));
    const saveDueDate = () => {
        if (dueDateSpecValid) runAndClose(() => props.onSetDueDate(dueDateInput));
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
                            <IconButton
                                onPress={goToParent}
                                accessibilityLabel={l('Önceki menüye dön', 'Back to previous menu')}
                            >
                                <BackIcon color={colors.textPrimary} size={22} />
                            </IconButton>
                            <Text style={styles.sheetTitle} numberOfLines={1} accessibilityRole="header">{sheetTitle}</Text>
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
                                        icon="undo"
                                        label={l('Konturu geri al', 'Undo stroke')}
                                        onPress={() => runAndClose(props.onUndoWhiteboard)}
                                    />
                                )}
                                {/* Undo survives the end of the queue: the last answer of a
                                    session is exactly the one a learner needs to take back. */}
                                <MenuRow
                                    icon="undo"
                                    label={undoLabel}
                                    disabled={!props.canUndo}
                                    onPress={() => runAndClose(props.onUndo)}
                                />
                                {props.canRedo && (
                                    <MenuRow
                                        icon="redo"
                                        label={redoLabel}
                                        onPress={() => runAndClose(props.onRedo)}
                                    />
                                )}

                                {hasCard && props.whiteboardActive && (
                                    <>
                                        <MenuRow
                                            icon="clear"
                                            label={l('Yazı tahtasını temizle', 'Clear whiteboard')}
                                            disabled={!props.whiteboardHasContent}
                                            onPress={() => runAndClose(props.onClearWhiteboard)}
                                        />
                                        <MenuRow
                                            icon="save"
                                            label={l('Yazı tahtasını kaydet', 'Save whiteboard')}
                                            disabled={!props.whiteboardHasContent}
                                            onPress={() => runAndClose(props.onSaveWhiteboard)}
                                        />
                                        <MenuRow
                                            icon="stylus"
                                            label={props.stylusOnly ? l('Kalemle yazmayı kapat', 'Disable stylus') : l('Kalemle yazmayı aç', 'Enable stylus')}
                                            onPress={props.onToggleStylus}
                                        />
                                    </>
                                )}

                                <MenuRow
                                    icon="whiteboard"
                                    disabled={!hasCard}
                                    label={props.whiteboardActive
                                        ? l('Yazı tahtasını devre dışı bırak', 'Disable whiteboard')
                                        : l('Yazı tahtasını etkinleştir', 'Enable whiteboard')}
                                    onPress={() => runAndClose(props.whiteboardActive ? props.onDisableWhiteboard : props.onToggleWhiteboard)}
                                />
                                <MenuRow icon="edit" label={l('Notu düzenle', 'Edit note')} disabled={!hasCard} onPress={() => runAndClose(props.onEditNote)} />
                                <MenuRow icon="add" label={l('Not ekle', 'Add note')} onPress={() => runAndClose(props.onAddNote)} />
                                <MenuRow icon="tag" label={l('Etiketleri düzenle', 'Edit tags')} disabled={!hasCard} onPress={() => setView('tags')} />
                                {props.hasSiblingCards ? (
                                    <MenuRow icon="bury" label={l('Göm', 'Bury')} chevron disabled={!hasCard} onPress={() => setView('bury')} />
                                ) : (
                                    <MenuRow icon="bury" label={l('Kartı göm', 'Bury card')} disabled={!hasCard} onPress={() => runAndClose(props.onBuryCard)} />
                                )}
                                {props.hasSiblingCards ? (
                                    <MenuRow icon="suspend" label={l('Askıya al', 'Suspend')} chevron disabled={!hasCard} onPress={() => setView('suspend')} />
                                ) : (
                                    <MenuRow
                                        icon="suspend"
                                        disabled={!hasCard}
                                        label={props.cardSuspended ? l('Kartı askıdan çıkar', 'Unsuspend card') : l('Kartı askıya al', 'Suspend card')}
                                        onPress={() => runAndClose(props.onSuspendCard)}
                                    />
                                )}
                                {props.canDeleteNote !== false && (
                                    <MenuRow
                                        icon="delete"
                                        disabled={!hasCard}
                                        label={l('Notu sil', 'Delete note')}
                                        onPress={() => confirmAndClose(
                                            l('Notu sil', 'Delete note'),
                                            l('Bu not ve bütün kartları silinecek. Hemen ardından açılan pencerede Geri al ile geri getirebilirsiniz.', 'This note and all its cards will be deleted. You can bring it back with Undo in the dialog that follows.'),
                                            props.onDeleteNote,
                                            true,
                                        )}
                                    />
                                )}
                                <MenuRow
                                    icon="mark"
                                    disabled={!hasCard}
                                    label={props.noteMarked ? l('Not işaretini kaldır', 'Unmark note') : l('Notu işaretle', 'Mark note')}
                                    onPress={() => runAndClose(props.onToggleMarkNote)}
                                />
                                <MenuRow icon="reschedule" label={l('Yeniden zamanla', 'Reschedule')} chevron disabled={!hasCard} onPress={() => setView('reschedule')} />
                                <MenuRow
                                    icon="replay"
                                    label={l('Sesi yeniden oynat', 'Replay audio')}
                                    disabled={!hasCard || !props.canReplayAudio}
                                    onPress={() => runAndClose(props.onReplayAudio)}
                                />
                                <MenuRow
                                    icon="voice"
                                    label={props.voicePlaybackEnabled
                                        ? l('Metin okumayı kapat', 'Disable text to speech')
                                        : l('Metin okumayı aç', 'Enable text to speech')}
                                    onPress={() => runAndClose(props.onToggleVoicePlayback)}
                                />
                                <MenuRow icon="deck" label={l('Deste seçenekleri', 'Deck options')} onPress={() => runAndClose(props.onDeckOptions)} />
                                {props.onCardInfo ? (
                                    <MenuRow icon="info" label={l('Kart bilgisi', 'Card info')} disabled={!hasCard} onPress={() => runAndClose(props.onCardInfo!)} />
                                ) : null}
                            </>
                        )}

                        {view === 'bury' && (
                            <>
                                <MenuRow icon="bury" label={l('Notu göm', 'Bury note')} onPress={() => runAndClose(props.onBuryNote)} />
                                <MenuRow icon="bury" label={l('Kartı göm', 'Bury card')} onPress={() => runAndClose(props.onBuryCard)} />
                            </>
                        )}

                        {view === 'suspend' && (
                            <>
                                <MenuRow icon="suspend" label={l('Notu askıya al', 'Suspend note')} onPress={() => runAndClose(props.onSuspendNote)} />
                                <MenuRow
                                    icon="suspend"
                                    label={props.cardSuspended ? l('Kartı askıdan çıkar', 'Unsuspend card') : l('Kartı askıya al', 'Suspend card')}
                                    onPress={() => runAndClose(props.onSuspendCard)}
                                />
                            </>
                        )}

                        {view === 'reschedule' && (
                            <>
                                <MenuRow icon="reschedule" label={l('Son tarihi ayarla…', 'Set due date…')} onPress={() => setView('dueDate')} />
                                <MenuRow
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
                                <Text style={styles.subDesc}>{l('Etiketleri boşlukla ayırın. Etiketler notun bütün kartlarına uygulanır.', 'Separate tags with spaces. Tags apply to every card of the note.')}</Text>
                                <TextField
                                    style={styles.field}
                                    value={tagsInput}
                                    onChangeText={setTagsInput}
                                    placeholder={l('etiketler', 'tags')}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoFocus
                                    returnKeyType="done"
                                    onSubmitEditing={saveTags}
                                    accessibilityLabel={l('Notun etiketleri', 'Note tags')}
                                />
                                <Button style={styles.formButton} label={t('common.save')} onPress={saveTags} />
                            </View>
                        )}

                        {view === 'reset' && (
                            <View style={styles.formContent}>
                                <Text style={styles.subDesc}>
                                    {l('Kart Yeni durumuna döner. Tekrar geçmişi korunur.', 'The card goes back to New. Its review history is kept.')}
                                </Text>
                                <OptionSwitch
                                    label={l('Mümkünse ilk sırasına geri koy', 'Restore original position where possible')}
                                    value={resetOptions.restorePosition}
                                    onChange={(restorePosition) => setResetOptions((current) => ({ ...current, restorePosition }))}
                                />
                                <OptionSwitch
                                    label={l('Tekrar ve unutma sayılarını sıfırla', 'Reset repetition and lapse counts')}
                                    value={resetOptions.resetCounts}
                                    onChange={(resetCounts) => setResetOptions((current) => ({ ...current, resetCounts }))}
                                />
                                <Button
                                    style={styles.formButton}
                                    label={l('Sıfırla', 'Reset')}
                                    onPress={() => runAndClose(() => props.onResetCard(resetOptions))}
                                />
                            </View>
                        )}

                        {view === 'dueDate' && (
                            <View style={styles.formContent}>
                                <Text style={styles.subDesc}>{l('Kart kaç gün sonra yeniden gösterilsin?', 'Show this card again in how many days?')}</Text>
                                <Text style={styles.subDesc}>
                                    {l('0 = bugün, 1 = yarın, 3-7 = aralıktan rastgele. Sonuna ! eklerseniz aralık da bu değere ayarlanır.',
                                       '0 = today, 1 = tomorrow, 3-7 = random in range. Append ! to also set the interval to that value.')}
                                </Text>
                                <TextField
                                    style={styles.field}
                                    value={dueDateInput}
                                    onChangeText={setDueDateInput}
                                    maxLength={12}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoFocus
                                    // Digits, "-" and "!" are all a due-date spec needs.
                                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                                    returnKeyType="done"
                                    onSubmitEditing={saveDueDate}
                                    placeholder={l('örn. 1 veya 3-7!', 'e.g. 1 or 3-7!')}
                                    accessibilityLabel={l('Kaç gün sonra', 'Due in days')}
                                />
                                <Button
                                    style={styles.formButton}
                                    label={t('common.save')}
                                    disabled={!dueDateSpecValid}
                                    onPress={saveDueDate}
                                />
                            </View>
                        )}
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/** One entry of the panel: a `MenuItem` with the reviewer's own glyph; `chevron` opens a submenu. */
function MenuRow({ icon, label, onPress, chevron = false, disabled = false }: {
    icon: ReviewerMenuIcon;
    label: string;
    onPress: () => void;
    chevron?: boolean;
    disabled?: boolean;
}) {
    const colors = useThemeColors();
    return (
        <MenuItem
            icon={<MenuIcon name={icon} color={colors.textMuted} />}
            label={label}
            onPress={onPress}
            chevron={chevron}
            disabled={disabled}
        />
    );
}

/** A reset option: its label and the app's switch. */
function OptionSwitch({ label, value, onChange }: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) {
    const colors = useThemeColors();
    return (
        <View style={rowStyles.switchRow}>
            <Text style={[rowStyles.switchLabel, { color: colors.textPrimary }]}>{label}</Text>
            <AppSwitch value={value} onValueChange={onChange} accessibilityLabel={label} />
        </View>
    );
}

const rowStyles = StyleSheet.create({
    switchRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    switchLabel: { flex: 1, fontSize: 15, lineHeight: 20 },
});

/** The whiteboard: a board with a stroke drawn on it. */
function WhiteboardGlyph({ color, size }: { color: string; size: number }) {
    const line = outline(color, iconStroke(size));
    return (
        <IconFrame size={size}>
            <Rect x={3} y={4.25} width={18} height={13.5} rx={2.75} {...line} />
            <Path d="M7 13.5c1.4-2.6 2.4-4 3.3-4 1.3 0 .2 4 1.75 4 1.1 0 1.6-2.25 2.75-2.25.6 0 1.05.55 1.7 1.25M8.5 17.75 7.25 20.5M15.5 17.75l1.25 2.75" {...line} />
        </IconFrame>
    );
}

/** The 22 points a `MenuItem` gives its icon. */
const MENU_ICON_SIZE = 22;

/**
 * The menu's line icons, all from the app's icon system. Undo, redo and delete are the kit's
 * control icons, so they read the same here as everywhere else.
 */
function MenuIcon({ name, color }: { name: ReviewerMenuIcon; color: string }) {
    const props = { color, size: MENU_ICON_SIZE };
    switch (name) {
        case 'edit':
        case 'stylus': return <PencilGlyph {...props} />;
        case 'undo': return <UndoIcon {...props} />;
        case 'redo': return <RedoIcon {...props} />;
        case 'delete': return <TrashIcon {...props} />;
        case 'whiteboard': return <WhiteboardGlyph {...props} />;
        case 'clear': return <EraserGlyph {...props} />;
        case 'save': return <DownloadGlyph {...props} />;
        case 'add': return <PlusGlyph {...props} />;
        case 'tag': return <TagGlyph {...props} />;
        case 'bury': return <BuryGlyph {...props} />;
        case 'suspend': return <PauseCircleGlyph {...props} />;
        case 'mark': return <StarGlyph {...props} filled={false} />;
        case 'reschedule': return <CalendarGlyph {...props} />;
        case 'replay': return <PlayCircleGlyph {...props} />;
        case 'voice': return <SpeakerGlyph {...props} />;
        case 'deck': return <SlidersGlyph {...props} />;
        case 'info': return <InfoCircleGlyph {...props} />;
    }
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            alignItems: 'flex-end',
        },
        scrim: {
            ...StyleSheet.absoluteFill,
            backgroundColor: colors.scrimLight,
        },
        sheet: {
            maxHeight: '100%',
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: Radius.inset,
            borderBottomLeftRadius: Radius.inset,
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
            fontWeight: '600',
            color: colors.textPrimary,
        },
        // Balances the back button so the title stays centred.
        headerSpacer: { width: HIT_TARGET, height: HIT_TARGET },
        sheetContent: { paddingVertical: 4, paddingBottom: 6 },
        formContent: { paddingTop: Spacing.md },
        subDesc: { color: colors.textSecondary, fontSize: FontSize.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
        field: { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
        formButton: { marginHorizontal: Spacing.md },
    });
}
