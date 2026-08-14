import React, { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../lib/models';
import { confirm } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';

type MenuView = 'menu' | 'flag' | 'dueDate' | 'bury' | 'suspend' | 'reschedule' | 'tags';

export interface CardOptionsMenuProps {
    visible: boolean;
    /** Which panel to show when the screen opens. The top-bar flag button opens straight to 'flag'. */
    initialView?: 'menu' | 'flag';
    onClose: () => void;
    cardSuspended: boolean;
    noteMarked: boolean;
    /** Audio rows are only shown for cards that actually embed audio/video. */
    cardHasAudio: boolean;
    onReplayAudio: () => void;
    autoAdvance: boolean;
    onToggleAutoAdvance: () => void;
    /** Anki Preferences trio, surfaced here like Anki's reviewer settings. */
    interruptAudioOnAnswer: boolean;
    onToggleInterruptAudio: () => void;
    showRemainingCount: boolean;
    onToggleShowRemaining: () => void;
    showNextReviewTimes: boolean;
    onToggleShowNextTimes: () => void;
    onFlag: (flag: CardFlag) => void;
    onBuryCard: () => void;
    onSuspendCard: () => void;
    onForgetCard: () => void;
    onSetDueDate: (days: number) => void;
    onDeckOptions: () => void;
    onToggleMarkNote: () => void;
    onBuryNote: () => void;
    onSuspendNote: () => void;
    onDeleteNote: () => void;
    /** Undo the last answer (shown only when there is something to undo). */
    canUndo: boolean;
    onUndo: () => void;
    onEditNote: () => void;
    /** Space-separated tags of the current note, and a save callback (Anki's "Edit tags"). */
    noteTags: string;
    onSaveTags: (tags: string) => void;
    /** Whiteboard: its rows appear only while the whiteboard is on, like AnkiDroid. */
    whiteboardActive: boolean;
    whiteboardHasContent: boolean;
    stylusOnly: boolean;
    onToggleStylus: () => void;
    onClearWhiteboard: () => void;
    onSaveWhiteboard: () => void;
    onDisableWhiteboard: () => void;
    /** Voice playback (TTS): a single Enable/Disable row like AnkiDroid's "voice playback". */
    voicePlaybackEnabled: boolean;
    onToggleVoicePlayback: () => void;
}

/** Full-screen Anki-style card/note options, opened from the study screen. */
export function CardOptionsMenu(props: CardOptionsMenuProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [view, setView] = useState<MenuView>('menu');
    const [dueDateInput, setDueDateInput] = useState('1');
    const [tagsInput, setTagsInput] = useState('');

    // Open on the caller's requested panel (e.g. the flag button jumps straight to flag colors).
    useEffect(() => {
        if (props.visible) setView(props.initialView ?? 'menu');
    }, [props.visible, props.initialView]);

    // Prefill the tag editor with the note's current tags each time that panel is opened.
    useEffect(() => {
        if (view === 'tags') setTagsInput(props.noteTags);
    }, [view, props.noteTags]);

    const close = () => {
        setView('menu');
        setDueDateInput('1');
        props.onClose();
    };

    const runAndClose = (action: () => void) => {
        close();
        // iOS will reject navigation/alerts while a full-screen native modal is still
        // dismissing. Close first, then run the selected operation after that transition.
        setTimeout(action, Platform.OS === 'ios' ? 260 : 0);
    };

    const confirmAndClose = (title: string, message: string, action: () => void, destructive = false) => {
        close();
        setTimeout(() => confirm(title, message, action, { destructive }), Platform.OS === 'ios' ? 260 : 0);
    };

    const sheetTitle = view === 'flag'
        ? l('Bayrak Rengi', 'Flag Color')
        : view === 'dueDate'
            ? l('Son Tarihi Ayarla', 'Set Due Date')
            : view === 'bury'
                ? l('Göm', 'Bury')
                : view === 'suspend'
                    ? l('Askıya Al', 'Suspend')
                    : view === 'reschedule'
                        ? l('Yeniden Zamanla', 'Reschedule')
                        : view === 'tags'
                            ? l('Etiketleri Düzenle', 'Edit Tags')
                            : l('Kart Seçenekleri', 'Card Options');

    const flagNames = [
        l('Bayrak Yok', 'No Flag'), l('Kırmızı', 'Red'), l('Turuncu', 'Orange'),
        l('Yeşil', 'Green'), l('Mavi', 'Blue'), l('Pembe', 'Pink'),
        l('Turkuaz', 'Turquoise'), l('Mor', 'Purple'),
    ];

    // Back row shared by every sub-panel (bury / suspend / reschedule / flag / due date).
    const SubHeader = () => (
        <View style={styles.subHeader}>
            <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setView('menu')}
                accessibilityRole="button"
                accessibilityLabel={l('Kart seçeneklerine dön', 'Back to card options')}
            >
                <Text style={styles.backLink}>‹ {l('Geri', 'Back')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal
            visible={props.visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={close}
        >
            <KeyboardAvoidingView
                style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.sheet} accessibilityViewIsModal>
                    <View style={styles.sheetHeader}>
                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={close}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kart seçeneklerini kapat', 'Close card options')}
                        >
                            <Text style={styles.closeBtnText}>‹</Text>
                        </TouchableOpacity>
                        <Text style={styles.sheetTitle}>{sheetTitle}</Text>
                        <View style={styles.headerSpacer} />
                    </View>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.sheetContent}
                    >
                    {view === 'menu' && (
                        <>
                            {props.whiteboardActive && (
                                <>
                                    <Text style={styles.groupLabel}>{l('BEYAZ TAHTA', 'WHITEBOARD')}</Text>
                                    {props.whiteboardHasContent && (
                                        <>
                                            <MenuRow styles={styles} icon="🧹" label={l('Beyaz Tahtayı Temizle', 'Clear Whiteboard')} onPress={() => runAndClose(props.onClearWhiteboard)} />
                                            <MenuRow styles={styles} icon="💾" label={l('Beyaz Tahtayı Kaydet', 'Save Whiteboard')} onPress={() => runAndClose(props.onSaveWhiteboard)} />
                                        </>
                                    )}
                                    <ToggleRow styles={styles} icon="🖊️" label={l('Kalemle Yazma (stylus)', 'Stylus Writing')} value={props.stylusOnly} onPress={props.onToggleStylus} />
                                    <MenuRow styles={styles} icon="❌" label={l('Beyaz Tahtayı Kapat', 'Disable Whiteboard')} onPress={() => runAndClose(props.onDisableWhiteboard)} />
                                    <View style={styles.divider} />
                                </>
                            )}

                            {props.canUndo && (
                                <MenuRow styles={styles} icon="↩️" label={l('Son Yanıtı Geri Al', 'Undo')} onPress={() => runAndClose(props.onUndo)} />
                            )}
                            <MenuRow styles={styles} icon="✏️" label={l('Notu Düzenle', 'Edit Note')} onPress={() => runAndClose(props.onEditNote)} />
                            <MenuRow styles={styles} icon="🏷️" label={l('Etiketleri Düzenle', 'Edit Tags')} chevron onPress={() => setView('tags')} />
                            <MenuRow styles={styles} icon="💤" label={l('Göm', 'Bury')} chevron onPress={() => setView('bury')} />
                            <MenuRow styles={styles} icon="⏸️" label={l('Askıya Al', 'Suspend')} chevron onPress={() => setView('suspend')} />
                            <MenuRow
                                styles={styles}
                                icon="🗑️"
                                label={l('Notu Sil', 'Delete Note')}
                                danger
                                onPress={() => confirmAndClose(
                                    l('Notu Sil', 'Delete Note'),
                                    l('Bu not kalıcı olarak silinecek. Bu işlem geri alınamaz.', 'This note will be permanently deleted. This cannot be undone.'),
                                    props.onDeleteNote,
                                    true,
                                )}
                            />
                            <MenuRow
                                styles={styles}
                                icon="⭐"
                                label={props.noteMarked ? l('Not İşaretini Kaldır', 'Unmark Note') : l('Notu İşaretle', 'Mark Note')}
                                onPress={() => runAndClose(props.onToggleMarkNote)}
                            />
                            <MenuRow styles={styles} icon="📅" label={l('Yeniden Zamanla', 'Reschedule')} chevron onPress={() => setView('reschedule')} />
                            {props.cardHasAudio && (
                                <MenuRow styles={styles} icon="🔊" label={l('Medyayı Yeniden Oynat', 'Replay Media')} onPress={() => runAndClose(props.onReplayAudio)} />
                            )}
                            <MenuRow
                                styles={styles}
                                icon="🗣️"
                                label={props.voicePlaybackEnabled ? l('Sesli Okumayı Kapat', 'Disable Voice Playback') : l('Sesli Okumayı Aç', 'Enable Voice Playback')}
                                onPress={() => runAndClose(props.onToggleVoicePlayback)}
                            />
                            <MenuRow styles={styles} icon="⚙️" label={l('Deste Seçenekleri', 'Deck Options')} onPress={() => runAndClose(props.onDeckOptions)} />

                            <View style={styles.divider} />

                            <ToggleRow styles={styles} icon="▶️" label={l('Otomatik İlerleme', 'Auto Advance')} value={props.autoAdvance} onPress={props.onToggleAutoAdvance} />
                            <ToggleRow styles={styles} icon="🔇" label={l('Yanıtlarken Çalan Sesi Kes', 'Interrupt Audio When Answering')} value={props.interruptAudioOnAnswer} onPress={props.onToggleInterruptAudio} />
                            <ToggleRow styles={styles} icon="🔢" label={l('Kalan Kart Sayısını Göster', 'Show Remaining Card Count')} value={props.showRemainingCount} onPress={props.onToggleShowRemaining} />
                            <ToggleRow styles={styles} icon="⏱️" label={l('Yanıt Düğmelerinde Sonraki Süreyi Göster', 'Show Next Review Time Above Answer Buttons')} value={props.showNextReviewTimes} onPress={props.onToggleShowNextTimes} />
                        </>
                    )}

                    {view === 'bury' && (
                        <>
                            <SubHeader />
                            <MenuRow styles={styles} icon="💤" label={l('Kartı Göm', 'Bury Card')} onPress={() => runAndClose(props.onBuryCard)} />
                            <MenuRow styles={styles} icon="🌙" label={l('Notu Göm', 'Bury Note')} onPress={() => runAndClose(props.onBuryNote)} />
                        </>
                    )}

                    {view === 'suspend' && (
                        <>
                            <SubHeader />
                            <MenuRow
                                styles={styles}
                                icon="⏸️"
                                label={props.cardSuspended ? l('Askıdan Çıkar', 'Unsuspend Card') : l('Kartı Askıya Al', 'Suspend Card')}
                                onPress={() => runAndClose(props.onSuspendCard)}
                            />
                            <MenuRow styles={styles} icon="⏹️" label={l('Notu Askıya Al', 'Suspend Note')} onPress={() => runAndClose(props.onSuspendNote)} />
                        </>
                    )}

                    {view === 'reschedule' && (
                        <>
                            <SubHeader />
                            <MenuRow styles={styles} icon="📅" label={l('Son Tarihi Ayarla…', 'Set Due Date…')} onPress={() => setView('dueDate')} />
                            <MenuRow
                                styles={styles}
                                icon="🔄"
                                label={l('Kartı Unut…', 'Forget Card…')}
                                onPress={() => confirmAndClose(
                                    l('Kartı Unut', 'Forget Card'),
                                    l('Bu kartın tüm zamanlama ilerlemesi silinir ve kart Yeni durumuna sıfırlanır. Bu işlem geri alınamaz.', 'All scheduling progress for this card will be deleted and the card will be reset to New. This cannot be undone.'),
                                    props.onForgetCard,
                                    true,
                                )}
                            />
                        </>
                    )}

                    {view === 'tags' && (
                        <>
                            <SubHeader />
                            <Text style={styles.subDesc}>{l('Etiketleri boşlukla ayırın.', 'Separate tags with spaces.')}</Text>
                            <TextInput
                                style={styles.dueDateInput}
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
                        </>
                    )}

                    {view === 'flag' && (
                        <>
                            <View style={styles.subHeader}>
                                <TouchableOpacity
                                    style={styles.backBtn}
                                    onPress={() => setView('menu')}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Kart seçeneklerine dön', 'Back to card options')}
                                >
                                    <Text style={styles.backLink}>‹ {l('Geri', 'Back')}</Text>
                                </TouchableOpacity>
                            </View>
                            {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                                <TouchableOpacity key={flag} style={styles.row} onPress={() => runAndClose(() => props.onFlag(flag))}>
                                    <View style={[styles.flagSwatch, { backgroundColor: FLAG_COLORS[flag].color }]} />
                                    <Text style={styles.rowLabel}>{flagNames[flag]}</Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {view === 'dueDate' && (
                        <>
                            <View style={styles.subHeader}>
                                <TouchableOpacity
                                    style={styles.backBtn}
                                    onPress={() => setView('menu')}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Kart seçeneklerine dön', 'Back to card options')}
                                >
                                    <Text style={styles.backLink}>‹ {l('Geri', 'Back')}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.subDesc}>{l('Kart kaç gün sonra yeniden gösterilsin?', 'Show this card again in how many days?')}</Text>
                            <TextInput
                                style={styles.dueDateInput}
                                keyboardType="number-pad"
                                value={dueDateInput}
                                onChangeText={setDueDateInput}
                                placeholder={l('gün', 'days')}
                                placeholderTextColor={colors.textMuted}
                            />
                            <TouchableOpacity
                                style={styles.confirmBtn}
                                onPress={() => {
                                    const days = Math.max(0, Math.floor(Number(dueDateInput) || 0));
                                    runAndClose(() => props.onSetDueDate(days));
                                }}
                            >
                                <Text style={styles.confirmBtnText}>{t('common.save')}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function ToggleRow({ styles, icon, label, value, onPress }: {
    styles: ReturnType<typeof createStyles>;
    icon: string;
    label: string;
    value: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: value }}
        >
            <Text style={styles.rowIcon}>{icon}</Text>
            <Text style={styles.rowLabel}>{label}</Text>
            <View style={[styles.toggle, value && styles.toggleActive]}>
                <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
            </View>
        </TouchableOpacity>
    );
}

function MenuRow({ styles, icon, label, onPress, danger, chevron }: {
    styles: ReturnType<typeof createStyles>;
    icon: string;
    label: string;
    onPress: () => void;
    danger?: boolean;
    /** Shows a ▸ affordance for rows that open a sub-panel (Bury / Suspend / Reschedule). */
    chevron?: boolean;
}) {
    return (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Text style={styles.rowIcon}>{icon}</Text>
            <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
            {chevron && <Text style={styles.rowChevron}>›</Text>}
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        screen: {
            flex: 1,
            backgroundColor: colors.bgCard,
        },
        sheet: {
            flex: 1,
            width: '100%',
            backgroundColor: colors.bgCard,
        },
        sheetHeader: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        sheetTitle: {
            flex: 1,
            textAlign: 'center',
            fontSize: FontSize.lg,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        closeBtn: {
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
        },
        closeBtnText: {
            fontSize: 38,
            lineHeight: 38,
            fontWeight: '300',
            color: colors.textPrimary,
        },
        headerSpacer: { width: 48, height: 48 },
        sheetContent: {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingVertical: Spacing.sm,
            paddingBottom: 32,
        },
        groupLabel: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1,
            color: colors.textMuted,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.sm,
            paddingBottom: 2,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 48,
            paddingHorizontal: Spacing.lg,
            paddingVertical: 11,
            gap: 10,
        },
        rowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
        rowLabel: { fontSize: FontSize.md, color: colors.textPrimary, flex: 1 },
        rowLabelDanger: { color: colors.btnAgain },
        rowChevron: { fontSize: 20, color: colors.textMuted, marginLeft: 4 },
        divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: Spacing.xs },

        toggle: {
            width: 40,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.bgInput,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 2,
        },
        toggleActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
        toggleKnob: {
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.textMuted,
        },
        toggleKnobActive: { backgroundColor: colors.accent, marginLeft: 'auto' },

        subHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm },
        backBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
        backLink: { fontSize: FontSize.md, color: colors.accent, fontWeight: '600' },
        subDesc: { fontSize: FontSize.sm, color: colors.textSecondary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },

        flagSwatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.border },

        dueDateInput: {
            marginHorizontal: Spacing.lg,
            marginBottom: Spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
            minHeight: 48,
            fontSize: FontSize.lg,
            color: colors.textPrimary,
        },
        confirmBtn: {
            marginHorizontal: Spacing.lg,
            marginBottom: Spacing.sm,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            minHeight: 48,
            justifyContent: 'center',
            alignItems: 'center',
        },
        confirmBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
    });
}
