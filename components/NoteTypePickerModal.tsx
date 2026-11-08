import { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from './AppText';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../constants/theme';
import { getAllNoteTypes, getNoteType } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type NoteType } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';
import { Button, CloseButton } from './ui/Button';
import { Badge, SelectedMark } from './ui/Choice';
import { Radius, Type } from './ui/tokens';

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

/** Two stacked cards — the shape of a standard note type that renders front/back templates. */
function StandardTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M8 3.6h10.4a2 2 0 0 1 2 2V16" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" opacity={0.55} />
            <Rect x={3.4} y={7} width={13.6} height={13.4} rx={2.4} fill="none" stroke={color} strokeWidth={1.8} />
            <Path d="M6.8 11.4h6.8M6.8 15.2h4.2" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
    );
}

/** Brackets around a hidden run of text — the shape of a cloze deletion. */
function ClozeTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
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
            <View style={[styles.layer, { backgroundColor: colors.scrim }]}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kapat', 'Close')}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <View style={styles.header}>
                        <Text style={[Type.title, styles.title]} numberOfLines={1} accessibilityRole="header">
                            {title ?? l('Not türü', 'Note Type')}
                        </Text>
                        <CloseButton accessibilityLabel={l('Kapat', 'Close')} onPress={onClose} />
                    </View>

                    <ScrollView
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {availableNoteTypes.map((noteType, index) => {
                            const label = localizeNoteTypeName(locale, noteType.name);
                            const selected = selectedId === noteType.id;
                            const isCloze = noteType.kind === 'cloze';
                            const isLast = index === availableNoteTypes.length - 1;
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
                                    style={[styles.row, isLast && styles.rowLast, selected && styles.rowActive]}
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
                                            {isCloze && <Badge label={l('Boşluk doldurma', 'Cloze')} tone="warning" />}
                                        </View>
                                    </View>
                                    <SelectedMark visible={selected} />
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.footer}>
                        {onManage ? (
                            <Button
                                label={manageLabel ?? l('Not türlerini yönet…', 'Manage note types…')}
                                accessibilityLabel={manageLabel ?? l('Not türlerini yönet', 'Manage note types')}
                                variant="plain"
                                tone="muted"
                                numberOfLines={1}
                                onPress={onManage}
                                style={styles.manageButton}
                            />
                        ) : (
                            <View style={styles.footerSpacer} />
                        )}
                        <Button label={cancelLabel ?? t('common.cancel')} variant="plain" onPress={onClose} />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        layer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 420,
            maxHeight: '80%',
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: Radius.card,
            ...Shadows.lg,
        },
        // A white header inside the card, as every picker and dialog draws it.
        header: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.xs,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        title: { flex: 1, color: colors.textPrimary },
        // flexGrow: 0 lets the card hug a short list; flexShrink: 1 makes a long one give way to
        // the header and footer instead of pushing them past the card's max height.
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
        rowLast: { borderBottomWidth: 0 },
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
        footer: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.xs,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            backgroundColor: colors.bgCard,
        },
        manageButton: { flexShrink: 1 },
        footerSpacer: { flex: 1 },
    });
}
