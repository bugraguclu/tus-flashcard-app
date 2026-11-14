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
import { Circle, Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';
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

/** A card split into front and back — the shape of a standard note type. */
function StandardTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    const line = outline(color, iconStroke(size));
    return (
        <IconFrame size={size}>
            <Rect x={3.75} y={4.5} width={16.5} height={15} rx={3} {...line} />
            <Path d="M3.75 12h16.5" {...line} />
        </IconFrame>
    );
}

/** Brackets around a hidden run of text — the shape of a cloze deletion. */
function ClozeTypeIcon({ color, size = 21 }: { color: string; size?: number }) {
    const width = iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d="M8.75 4.75H6.5v14.5h2.25M15.25 4.75h2.25v14.5h-2.25" {...outline(color, width)} />
            {[9.25, 12, 14.75].map((cx) => <Circle key={cx} cx={cx} cy={12} r={width * 0.62} fill={color} />)}
        </IconFrame>
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
                            const subtitle = isCloze
                                ? l(`${fieldCount} alan · boşluk başına 1 kart`, `${fieldCount} fields · 1 card per cloze`)
                                : l(`${fieldCount} alan · ${templateCount} kart`, `${fieldCount} fields · ${templateCount} ${templateCount === 1 ? 'card' : 'cards'}`);
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
        rowTitle: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '600' },
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
