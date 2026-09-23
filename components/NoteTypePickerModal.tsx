import React, { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../constants/theme';
import { getAllNoteTypes, getNoteType } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type NoteType } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';

type Props = {
    visible: boolean;
    colors: ColorScheme;
    selectedId: number;
    onSelect: (id: number) => void;
    onClose: () => void;
    title?: string;
    cancelLabel?: string;
    /**
     * Note types to offer. Callers that already track the collection version pass their own
     * list so the picker reflects an edit made in the same screen; otherwise it reads the
     * collection itself.
     */
    noteTypes?: NoteType[];
    /** Optional footer action that leaves the picker for the note type manager. */
    onManage?: () => void;
    manageLabel?: string;
};

function BackIcon({ color, size = 26 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="M15 18 9 12l6-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

function CheckIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="m5 12.5 4.2 4L19 6.8" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

/** Two stacked cards — the shape of a standard note type that renders front/back templates. */
function StandardTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="M8 3.6h10.4a2 2 0 0 1 2 2V16" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" opacity={0.55} />
            <Rect x={3.4} y={7} width={13.6} height={13.4} rx={2.4} fill="none" stroke={color} strokeWidth={1.8} />
            <Path d="M6.8 11.4h6.8M6.8 15.2h4.2" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
    );
}

/** Brackets around a hidden run of text — the shape of a cloze deletion. */
function ClozeTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="M9 4.6H5.6v14.8H9M15 4.6h3.4v14.8H15" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={9.2} cy={12} r={1.15} fill={color} />
            <Circle cx={12} cy={12} r={1.15} fill={color} />
            <Circle cx={14.8} cy={12} r={1.15} fill={color} />
        </Svg>
    );
}

export default function NoteTypePickerModal({
    visible,
    colors,
    selectedId,
    onSelect,
    onClose,
    title,
    cancelLabel,
    noteTypes,
    onManage,
    manageLabel,
}: Props) {
    const { t, l, locale } = useI18n();

    const availableNoteTypes = useMemo(() => {
        if (noteTypes) return noteTypes;
        const list = getAllNoteTypes().filter((nt) => !isLegacyTusNoteType(nt));
        const selected = getNoteType(selectedId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === selectedId);
        if (selected && !list.some((nt) => nt.id === selected.id)) {
            list.unshift(selected);
        }
        return list;
    }, [noteTypes, visible, selectedId]);

    const styles = useMemo(() => createStyles(colors), [colors]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
                    <View style={styles.toolbar}>
                        <TouchableOpacity
                            style={styles.toolbarButton}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kapat', 'Close')}
                        >
                            <BackIcon color={colors.white} />
                        </TouchableOpacity>
                        <Text style={styles.title} numberOfLines={1}>{title ?? l('Not türü', 'Note Type')}</Text>
                        <View style={styles.toolbarButton} />
                    </View>

                    <ScrollView
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {availableNoteTypes.map((noteType) => {
                            const label = localizeNoteTypeName(locale, noteType.name);
                            const selected = selectedId === noteType.id;
                            const isCloze = noteType.kind === 'cloze';
                            const fieldCount = noteType.fields.length;
                            const templateCount = noteType.templates.length;
                            const subtitle = l(
                                `${fieldCount} alan · ${templateCount} kart`,
                                `${fieldCount} fields · ${templateCount} cards`,
                            );
                            const glyphColor = selected ? colors.accent : colors.textSecondary;

                            return (
                                <TouchableOpacity
                                    key={noteType.id}
                                    style={[styles.row, selected && styles.rowActive]}
                                    onPress={() => {
                                        onSelect(noteType.id);
                                        onClose();
                                    }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={`${label}, ${subtitle}`}
                                >
                                    <View style={[styles.rowGlyph, selected && styles.rowGlyphActive]}>
                                        {isCloze
                                            ? <ClozeTypeIcon color={glyphColor} />
                                            : <StandardTypeIcon color={glyphColor} />}
                                    </View>
                                    <View style={styles.rowText}>
                                        <Text style={[styles.rowTitle, selected && styles.rowTitleActive]} numberOfLines={1}>
                                            {label}
                                        </Text>
                                        <View style={styles.rowMetaLine}>
                                            <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
                                            {isCloze && (
                                                <View style={styles.kindChip}>
                                                    <Text style={styles.kindChipText}>
                                                        {l('Boşluk doldurma', 'Cloze')}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <View style={styles.rowCheck}>
                                        {selected && <CheckIcon color={colors.accent} />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.footer}>
                        {onManage ? (
                            <TouchableOpacity
                                style={styles.footerButton}
                                onPress={onManage}
                                accessibilityRole="button"
                                accessibilityLabel={manageLabel ?? l('Not türlerini yönet', 'Manage note types')}
                            >
                                <Text style={styles.manageText} numberOfLines={1}>
                                    {manageLabel ?? l('Not türlerini yönet…', 'Manage note types…')}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.footerSpacer} />
                        )}
                        <TouchableOpacity
                            style={styles.footerButton}
                            onPress={onClose}
                            accessibilityRole="button"
                        >
                            <Text style={styles.cancelText}>{cancelLabel ?? t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.42)',
        },
        card: {
            width: '100%',
            maxWidth: 420,
            maxHeight: '80%',
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        toolbar: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.xs,
            backgroundColor: colors.accent,
        },
        toolbarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
        title: { flex: 1, color: colors.white, fontSize: FontSize.xl, fontWeight: '800' },
        // flexGrow: 0 lets the card hug a short list; flexShrink: 1 makes a long one give way to
        // the toolbar and footer instead of pushing them past the card's max height.
        list: { flexGrow: 0, flexShrink: 1, backgroundColor: colors.bgCard },
        listContent: { paddingVertical: Spacing.xs },
        row: {
            minHeight: 66,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        rowActive: { backgroundColor: colors.accentLight },
        rowGlyph: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgInput,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        rowGlyphActive: { backgroundColor: colors.bgCard, borderColor: colors.accent },
        rowText: { flex: 1, minWidth: 0, gap: 3 },
        rowTitle: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
        rowTitleActive: { color: colors.accent },
        rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        rowSubtitle: { flexShrink: 1, color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '500' },
        kindChip: {
            paddingHorizontal: Spacing.sm,
            paddingVertical: 2,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.badgeLearnBg,
        },
        kindChipText: { color: colors.badgeLearn, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 0.3 },
        rowCheck: { width: 24, alignItems: 'center' },
        footer: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        footerButton: { minHeight: 54, justifyContent: 'center', paddingHorizontal: Spacing.sm },
        footerSpacer: { flex: 1 },
        manageText: { color: colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
        cancelText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800' },
    });
}
