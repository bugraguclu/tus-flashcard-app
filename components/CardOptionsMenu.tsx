import React, { useMemo, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../lib/models';
import { confirm } from '../lib/confirm';

type MenuView = 'menu' | 'flag' | 'dueDate';

export interface CardOptionsMenuProps {
    visible: boolean;
    onClose: () => void;
    cardSuspended: boolean;
    noteMarked: boolean;
    autoAdvance: boolean;
    onToggleAutoAdvance: () => void;
    onFlag: (flag: CardFlag) => void;
    onBuryCard: () => void;
    onSuspendCard: () => void;
    onForgetCard: () => void;
    onSetDueDate: (days: number) => void;
    onCardInfo: () => void;
    onDeckOptions: () => void;
    onToggleMarkNote: () => void;
    onBuryNote: () => void;
    onSuspendNote: () => void;
    onDuplicateNote: () => void;
    onDeleteNote: () => void;
}

/**
 * Anki-style right-click card/note options menu, opened from a button on the study screen.
 * Audio actions (replay/pause/record own voice) are intentionally omitted — this app has no
 * audio playback or recording subsystem to hook them up to.
 */
export function CardOptionsMenu(props: CardOptionsMenuProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [view, setView] = useState<MenuView>('menu');
    const [dueDateInput, setDueDateInput] = useState('1');

    const close = () => {
        setView('menu');
        setDueDateInput('1');
        props.onClose();
    };

    const runAndClose = (action: () => void) => {
        action();
        close();
    };

    const confirmAndClose = (title: string, message: string, action: () => void, destructive = false) => {
        confirm(title, message, () => runAndClose(action), { destructive });
    };

    return (
        <Modal transparent visible={props.visible} animationType="fade" onRequestClose={close}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
                <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    {view === 'menu' && (
                        <>
                            <Text style={styles.groupLabel}>KART</Text>
                            <MenuRow styles={styles} icon="🚩" label="Kartı Bayrakla İşaretle" onPress={() => setView('flag')} />
                            <MenuRow styles={styles} icon="💤" label="Kartı Göm" onPress={() => runAndClose(props.onBuryCard)} />
                            <MenuRow
                                styles={styles}
                                icon="⏸️"
                                label={props.cardSuspended ? 'Askıyı Kaldır' : 'Kartı Askıya Al'}
                                onPress={() => runAndClose(props.onSuspendCard)}
                            />
                            <MenuRow
                                styles={styles}
                                icon="🔄"
                                label="Kartı Unut..."
                                onPress={() => confirmAndClose(
                                    'Kartı Unut',
                                    'Bu kartın tüm zamanlama ilerlemesi silinir ve yeni kart olarak sıfırlanır. Geri alınamaz.',
                                    props.onForgetCard,
                                    true,
                                )}
                            />
                            <MenuRow styles={styles} icon="📅" label="Son Tarihi Ayarla..." onPress={() => setView('dueDate')} />
                            <MenuRow styles={styles} icon="ℹ️" label="Kart Bilgisi" onPress={() => runAndClose(props.onCardInfo)} />
                            <MenuRow styles={styles} icon="⚙️" label="Seçenekler" onPress={() => runAndClose(props.onDeckOptions)} />

                            <View style={styles.divider} />

                            <Text style={styles.groupLabel}>NOT</Text>
                            <MenuRow
                                styles={styles}
                                icon="⭐"
                                label={props.noteMarked ? 'Notu İşaretlemeyi Kaldır' : 'Notu İşaretle'}
                                onPress={() => runAndClose(props.onToggleMarkNote)}
                            />
                            <MenuRow styles={styles} icon="💤" label="Notu Göm" onPress={() => runAndClose(props.onBuryNote)} />
                            <MenuRow styles={styles} icon="⏸️" label="Notu Askıya Al" onPress={() => runAndClose(props.onSuspendNote)} />
                            <MenuRow styles={styles} icon="📄" label="Kopyasını Oluştur..." onPress={() => confirmAndClose(
                                'Kopyasını Oluştur',
                                'Bu notun bir kopyası oluşturulacak.',
                                props.onDuplicateNote,
                            )}
                            />
                            <MenuRow
                                styles={styles}
                                icon="🗑️"
                                label="Notu Sil"
                                danger
                                onPress={() => confirmAndClose(
                                    'Notu Sil',
                                    'Bu not ve tüm kartları kalıcı olarak silinecek. Geri alınamaz.',
                                    props.onDeleteNote,
                                    true,
                                )}
                            />

                            <View style={styles.divider} />

                            <TouchableOpacity style={styles.row} onPress={() => runAndClose(props.onToggleAutoAdvance)}>
                                <Text style={styles.rowIcon}>▶️</Text>
                                <Text style={styles.rowLabel}>Otomatik İlerleme</Text>
                                <View style={[styles.toggle, props.autoAdvance && styles.toggleActive]}>
                                    <View style={[styles.toggleKnob, props.autoAdvance && styles.toggleKnobActive]} />
                                </View>
                            </TouchableOpacity>
                        </>
                    )}

                    {view === 'flag' && (
                        <>
                            <View style={styles.subHeader}>
                                <TouchableOpacity onPress={() => setView('menu')}>
                                    <Text style={styles.backLink}>‹ Geri</Text>
                                </TouchableOpacity>
                                <Text style={styles.subTitle}>Bayrak Rengi</Text>
                            </View>
                            {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                                <TouchableOpacity key={flag} style={styles.row} onPress={() => runAndClose(() => props.onFlag(flag))}>
                                    <View style={[styles.flagSwatch, { backgroundColor: FLAG_COLORS[flag].color }]} />
                                    <Text style={styles.rowLabel}>{FLAG_COLORS[flag].name}</Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {view === 'dueDate' && (
                        <>
                            <View style={styles.subHeader}>
                                <TouchableOpacity onPress={() => setView('menu')}>
                                    <Text style={styles.backLink}>‹ Geri</Text>
                                </TouchableOpacity>
                                <Text style={styles.subTitle}>Son Tarihi Ayarla</Text>
                            </View>
                            <Text style={styles.subDesc}>Kartı kaç gün sonra tekrar göstermek istersin?</Text>
                            <TextInput
                                style={styles.dueDateInput}
                                keyboardType="number-pad"
                                value={dueDateInput}
                                onChangeText={setDueDateInput}
                                placeholder="gün"
                                placeholderTextColor={colors.textMuted}
                            />
                            <TouchableOpacity
                                style={styles.confirmBtn}
                                onPress={() => {
                                    const days = Math.max(0, Math.floor(Number(dueDateInput) || 0));
                                    runAndClose(() => props.onSetDueDate(days));
                                }}
                            >
                                <Text style={styles.confirmBtnText}>Kaydet</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

function MenuRow({ styles, icon, label, onPress, danger }: {
    styles: ReturnType<typeof createStyles>;
    icon: string;
    label: string;
    onPress: () => void;
    danger?: boolean;
}) {
    return (
        <TouchableOpacity style={styles.row} onPress={onPress}>
            <Text style={styles.rowIcon}>{icon}</Text>
            <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: Spacing.xl,
        },
        sheet: {
            width: '100%',
            maxWidth: 360,
            maxHeight: '85%',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: Spacing.sm,
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
            paddingHorizontal: Spacing.lg,
            paddingVertical: 10,
            gap: 10,
        },
        rowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
        rowLabel: { fontSize: FontSize.md, color: colors.textPrimary, flex: 1 },
        rowLabelDanger: { color: colors.btnAgain },
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

        subHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
        backLink: { fontSize: FontSize.md, color: colors.accent, fontWeight: '600' },
        subTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        subDesc: { fontSize: FontSize.sm, color: colors.textSecondary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },

        flagSwatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.border },

        dueDateInput: {
            marginHorizontal: Spacing.lg,
            marginBottom: Spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            fontSize: FontSize.lg,
            color: colors.textPrimary,
        },
        confirmBtn: {
            marginHorizontal: Spacing.lg,
            marginBottom: Spacing.sm,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
        },
        confirmBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
    });
}
