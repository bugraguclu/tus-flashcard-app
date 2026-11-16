import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Circle, Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';
import type { ColorScheme } from '../constants/theme';
import { getAllNoteTypes, getNoteType } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type NoteType } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';
import { Button } from './ui/Button';
import { Divider } from './ui/Card';
import { Badge } from './ui/Choice';
import { AppDialog } from './ui/Dialog';
import { ListRow } from './ui/Rows';

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
function StandardTypeIcon({ color, size = 22 }: { color: string; size?: number }) {
    const line = outline(color, iconStroke(size));
    return (
        <IconFrame size={size}>
            <Rect x={3.75} y={4.5} width={16.5} height={15} rx={3} {...line} />
            <Path d="M3.75 12h16.5" {...line} />
        </IconFrame>
    );
}

/** Brackets around a hidden run of text — the shape of a cloze deletion. */
function ClozeTypeIcon({ color, size = 22 }: { color: string; size?: number }) {
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

    if (!visible) return null;

    return (
        <AppDialog
            visible={visible}
            onClose={onClose}
            title={title ?? l('Not türü', 'Note Type')}
            closeButton
            actions={(
                <>
                    {onManage ? (
                        <Button
                            label={manageLabel ?? l('Not türlerini yönet…', 'Manage note types…')}
                            accessibilityLabel={manageLabel ?? l('Not türlerini yönet', 'Manage note types')}
                            variant="plain"
                            tone="muted"
                            numberOfLines={1}
                            onPress={onManage}
                            style={styles.manage}
                        />
                    ) : null}
                    <Button label={cancelLabel ?? t('common.cancel')} variant="plain" onPress={onClose} />
                </>
            )}
        >
            {/* flexShrink lets a long list give way to the title and the actions inside the card. */}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {availableNoteTypes.map((noteType, index) => {
                    const label = localizeNoteTypeName(locale, noteType.name);
                    const selected = selectedId === noteType.id;
                    const isCloze = noteType.kind === 'cloze';
                    const fieldCount = noteType.fields.length;
                    const templateCount = noteType.templates.length;
                    const subtitle = isCloze
                        ? l(`${fieldCount} alan · boşluk başına 1 kart`, `${fieldCount} fields · 1 card per cloze`)
                        : l(`${fieldCount} alan · ${templateCount} kart`, `${fieldCount} fields · ${templateCount} ${templateCount === 1 ? 'card' : 'cards'}`);
                    const glyphColor = selected ? colors.accent : colors.textSecondary;
                    return (
                        <React.Fragment key={noteType.id}>
                            {index > 0 ? <Divider /> : null}
                            <ListRow
                                title={label}
                                summary={subtitle}
                                icon={isCloze ? <ClozeTypeIcon color={glyphColor} /> : <StandardTypeIcon color={glyphColor} />}
                                accessory={isCloze ? <Badge label={l('Boşluk doldurma', 'Cloze')} tone="warning" /> : undefined}
                                selected={selected}
                                onPress={() => {
                                    onSelect(noteType.id);
                                    onClose();
                                }}
                                accessibilityLabel={`${label}, ${subtitle}`}
                                style={styles.row}
                            />
                        </React.Fragment>
                    );
                })}
            </ScrollView>
        </AppDialog>
    );
}

const styles = StyleSheet.create({
    list: { flexGrow: 0, flexShrink: 1 },
    // The dialog's own padding is the rows' inset.
    row: { paddingHorizontal: 0 },
    // Pushes Cancel to the far end; a long label gives way before it does.
    manage: { flexShrink: 1, marginRight: 'auto' },
});
