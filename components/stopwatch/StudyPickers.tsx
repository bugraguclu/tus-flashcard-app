import React, { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    LISTED_STUDY_PASSES,
    MAX_SUBJECT_LENGTH,
    STUDY_KINDS,
    TUS_STUDY_SUBJECTS,
    normalizeSubjectName,
    studySubjectKey,
    type StudyKind,
} from '../../lib/stopwatch';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Card';
import { SelectedMark } from '../ui/Choice';
import { SearchField, TextField } from '../ui/Fields';
import { CheckIcon } from '../ui/icons';
import { HIT_TARGET, Radius, Type } from '../ui/tokens';
import { studyTypeLabel } from './StudyTypeChips';

/**
 * The pickers the Kronometre's sheets draw over themselves (`AppSheet`'s `overlay`, which dims the
 * sheet under them): a white panel, its own close, and the sheet's backdrop tap behind it.
 */

/** "Karışık" first, as TUSBuddy offers it, then the TUS courses in the exam's order. */
const GRID_SUBJECTS: readonly string[] = ['Karışık', ...TUS_STUDY_SUBJECTS.filter((subject) => subject !== 'Karışık')];
/** A tile's caption where the course's full name does not fit; the subject keeps its full name. */
const GRID_CAPTIONS: Readonly<Record<string, string>> = { 'Kadın Hastalıkları ve Doğum': 'Kadın Doğum' };

interface SubjectGridPickerProps {
    selected: string;
    /** Subjects of recent sessions; those outside the course list get tiles of their own. */
    recentSubjects: string[];
    onSelect: (subject: string) => void;
    onClose: () => void;
}

/**
 * "Ders Seçin": the TUS courses as a grid of tiles, the chosen one ticked, as TUSBuddy draws it.
 * A subject outside the list — one used before, or a new one typed under the grid — can be chosen
 * too, so a learner is never limited to the built-in courses.
 */
export function SubjectGridPicker({ selected, recentSubjects, onSelect, onClose }: SubjectGridPickerProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const { height } = useWindowDimensions();
    const [custom, setCustom] = useState('');
    // While a new subject is typed the grid steps aside, so the field stays above the keyboard.
    const [typing, setTyping] = useState(false);
    const typed = normalizeSubjectName(custom);

    const subjects = useMemo(() => {
        const seen = new Set<string>();
        const list: string[] = [];
        for (const subject of [...GRID_SUBJECTS, ...recentSubjects, selected]) {
            const name = normalizeSubjectName(subject);
            const key = studySubjectKey(name);
            if (!name || seen.has(key)) continue;
            seen.add(key);
            list.push(name);
        }
        return list;
    }, [recentSubjects, selected]);

    const selectedKey = studySubjectKey(selected);
    const addTyped = () => {
        if (!typed) return;
        onSelect(subjects.find((subject) => studySubjectKey(subject) === studySubjectKey(typed)) ?? typed);
        setCustom('');
        // The grid comes back with the new subject ticked in it.
        Keyboard.dismiss();
    };

    return (
        <>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={l('Ders seçimini kapat', 'Close the subject picker')}
            />
            <View style={[styles.panel, { backgroundColor: colors.bgCard, maxHeight: height * 0.86 }]}>
                <ScrollView contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={[Type.title, { color: colors.textPrimary }]} accessibilityRole="header">{l('Ders Seçin', 'Choose a Subject')}</Text>
                    <View style={[styles.grid, typing && styles.hidden]} accessibilityRole="radiogroup" accessibilityLabel={l('Ders', 'Subject')}>
                        {subjects.map((subject) => {
                            const isSelected = studySubjectKey(subject) === selectedKey;
                            return (
                                <TouchableOpacity
                                    key={subject}
                                    style={[
                                        styles.tile,
                                        isSelected
                                            ? { backgroundColor: colors.accentLight, borderColor: colors.accent }
                                            : { backgroundColor: colors.bgInput, borderColor: colors.border },
                                    ]}
                                    onPress={() => onSelect(subject)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: isSelected }}
                                    aria-checked={isSelected}
                                    accessibilityLabel={subject}
                                >
                                    <View
                                        style={[
                                            styles.radio,
                                            isSelected
                                                ? { borderColor: colors.accent, backgroundColor: colors.accent }
                                                : { borderColor: colors.border },
                                        ]}
                                    >
                                        {isSelected ? <CheckIcon color={colors.onAccent} size={10} /> : null}
                                    </View>
                                    <Text style={[styles.tileLabel, { color: colors.textPrimary }]} numberOfLines={2}>{GRID_CAPTIONS[subject] ?? subject}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={styles.customRow}>
                        <TextField
                            style={styles.customField}
                            value={custom}
                            onChangeText={setCustom}
                            placeholder={l('Listede olmayan bir ders yazın', 'Type a subject not in the list')}
                            maxLength={MAX_SUBJECT_LENGTH}
                            autoCorrect={false}
                            returnKeyType="done"
                            onFocus={() => setTyping(true)}
                            onBlur={() => setTyping(false)}
                            onSubmitEditing={addTyped}
                            accessibilityLabel={l('Yeni ders adı', 'New subject name')}
                        />
                        {typed ? (
                            <Button
                                size="compact"
                                label={l('Seç', 'Choose')}
                                onPress={addTyped}
                                accessibilityLabel={l(`${typed} dersini seç`, `Choose ${typed}`)}
                            />
                        ) : null}
                    </View>
                    <Button variant="plain" label={l('Kapat', 'Close')} onPress={onClose} />
                </ScrollView>
            </View>
        </>
    );
}

interface StudyTypePickerProps {
    kind: StudyKind;
    pass: number;
    /** A pass is chosen with its number; any other type keeps the pass the caller decides. */
    onSelect: (kind: StudyKind, pass: number | null) => void;
    onClose: () => void;
}

const foldQuery = (value: string) => value.toLocaleLowerCase('tr').trim();

/**
 * "Tür Seçin": every type of study in one list with a search field above it — "1. Tekrar" to
 * "8. Tekrar" and the five other kinds — as TUSBuddy lists them. Choosing one closes the list.
 */
export function StudyTypePicker({ kind, pass, onSelect, onClose }: StudyTypePickerProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const { height } = useWindowDimensions();
    const [query, setQuery] = useState('');

    const options = useMemo(() => {
        const passes = Math.max(LISTED_STUDY_PASSES, kind === 'pass' ? pass : 0);
        return [
            ...Array.from({ length: passes }, (_, index) => ({ kind: 'pass' as StudyKind, pass: index + 1 })),
            ...STUDY_KINDS.filter((item) => item !== 'pass').map((item) => ({ kind: item, pass: null as number | null })),
        ].map((option) => ({ ...option, label: studyTypeLabel(l, option.kind, option.pass ?? 1) }));
    }, [kind, pass, l]);

    const needle = foldQuery(query);
    const visible = needle ? options.filter((option) => foldQuery(option.label).includes(needle)) : options;

    return (
        <>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={l('Tür seçimini kapat', 'Close the type picker')}
            />
            <View style={[styles.panel, styles.typePanel, { backgroundColor: colors.bgCard, maxHeight: height * 0.9 }]}>
                <View style={styles.searchWrap}>
                    <SearchField
                        value={query}
                        onChangeText={setQuery}
                        placeholder={l('Ara', 'Search')}
                        clearLabel={l('Aramayı temizle', 'Clear search')}
                        accessibilityLabel={l('Tür ara', 'Search types')}
                    />
                </View>
                <Divider />
                <ScrollView
                    style={styles.typeList}
                    keyboardShouldPersistTaps="handled"
                    accessibilityRole="radiogroup"
                    accessibilityLabel={l('Tür', 'Type')}
                >
                    {visible.map((option, index) => {
                        const isSelected = option.kind === kind && (option.kind !== 'pass' || option.pass === pass);
                        return (
                            <React.Fragment key={option.label}>
                                {index > 0 ? <Divider /> : null}
                                {/* A single-choice row: the kit's rows have no radio role or checked state. */}
                                <TouchableOpacity
                                    style={styles.typeRow}
                                    onPress={() => onSelect(option.kind, option.pass)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: isSelected }}
                                    aria-checked={isSelected}
                                    accessibilityLabel={option.label}
                                >
                                    <Text style={[Type.body, styles.typeText, { color: isSelected ? colors.accent : colors.textPrimary }, isSelected && styles.typeTextSelected]}>
                                        {option.label}
                                    </Text>
                                    <SelectedMark visible={isSelected} />
                                </TouchableOpacity>
                            </React.Fragment>
                        );
                    })}
                    {visible.length === 0 ? (
                        <Text style={[Type.caption, styles.empty, { color: colors.textMuted }]}>{l('Eşleşen tür yok', 'No matching type')}</Text>
                    ) : null}
                </ScrollView>
                <Divider />
                <Button variant="plain" label={l('Kapat', 'Close')} onPress={onClose} />
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    // Shrinks into the room the keyboard leaves; its content scrolls.
    panel: { width: '100%', maxWidth: 480, alignSelf: 'center', flexShrink: 1, borderRadius: Radius.card, ...Shadows.lg },
    hidden: { display: 'none' },
    gridContent: { alignItems: 'center', padding: Spacing.lg, gap: Spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, alignSelf: 'stretch' },
    tile: {
        width: '31%',
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.inset,
        borderWidth: 1,
        paddingHorizontal: 4,
        paddingTop: Spacing.sm,
        paddingBottom: 6,
        gap: 2,
    },
    radio: {
        position: 'absolute',
        top: 5,
        right: 5,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tileLabel: { fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
    customRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    customField: { flex: 1 },
    typePanel: { paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
    searchWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
    typeList: { flexShrink: 1 },
    typeRow: {
        minHeight: HIT_TARGET + 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 2,
    },
    typeText: { flex: 1 },
    typeTextSelected: { fontWeight: '700' },
    empty: { textAlign: 'center', paddingVertical: Spacing.lg },
});
