import { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
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
import { CheckIcon, SearchIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';

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
            <View style={[styles.layer, styles.card, { backgroundColor: colors.bgCard, maxHeight: height * 0.86 }]}>
                <ScrollView contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{l('Ders Seçin', 'Choose a Subject')}</Text>
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
                                        {isSelected ? <CheckIcon color={colors.white} size={10} /> : null}
                                    </View>
                                    <Text style={[styles.tileLabel, { color: colors.textPrimary }]} numberOfLines={2}>{GRID_CAPTIONS[subject] ?? subject}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={[styles.customRow, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
                        <TextInput
                            style={[styles.customInput, { color: colors.textPrimary }]}
                            value={custom}
                            onChangeText={setCustom}
                            placeholder={l('Listede olmayan bir ders yazın', 'Type a subject not in the list')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={MAX_SUBJECT_LENGTH}
                            autoCorrect={false}
                            returnKeyType="done"
                            onFocus={() => setTyping(true)}
                            onBlur={() => setTyping(false)}
                            onSubmitEditing={addTyped}
                            accessibilityLabel={l('Yeni ders adı', 'New subject name')}
                        />
                        {typed ? (
                            <TouchableOpacity
                                style={[styles.customButton, { backgroundColor: colors.accent }]}
                                onPress={addTyped}
                                accessibilityRole="button"
                                accessibilityLabel={l(`${typed} dersini seç`, `Choose ${typed}`)}
                            >
                                <Text style={styles.customButtonText}>{l('Seç', 'Choose')}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <TouchableOpacity
                        style={[styles.closeButton, { backgroundColor: colors.accent }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    >
                        <Text style={styles.closeText}>{l('Kapat', 'Close')}</Text>
                    </TouchableOpacity>
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
            <View style={[styles.layer, styles.typeLayer, { maxHeight: height * 0.9 }]}>
                <View style={[styles.search, { backgroundColor: colors.bgCard }]}>
                    <SearchIcon color={colors.textMuted} size={20} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={l('Ara', 'Search')}
                        placeholderTextColor={colors.textMuted}
                        autoCorrect={false}
                        accessibilityLabel={l('Tür ara', 'Search types')}
                    />
                </View>
                <View style={[styles.listCard, { backgroundColor: colors.bgCard }]}>
                    <ScrollView keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup" accessibilityLabel={l('Tür', 'Type')}>
                        {visible.map((option) => {
                            const isSelected = option.kind === kind && (option.kind !== 'pass' || option.pass === pass);
                            return (
                                <TouchableOpacity
                                    key={option.label}
                                    style={[styles.typeRow, { borderBottomColor: colors.borderLight }]}
                                    onPress={() => onSelect(option.kind, option.pass)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: isSelected }}
                                    aria-checked={isSelected}
                                    accessibilityLabel={option.label}
                                >
                                    <Text style={[styles.typeText, { color: isSelected ? colors.accent : colors.textSecondary }, isSelected && styles.typeTextSelected]}>
                                        {option.label}
                                    </Text>
                                    {isSelected ? <CheckIcon color={colors.accent} size={18} /> : null}
                                </TouchableOpacity>
                            );
                        })}
                        {visible.length === 0 ? (
                            <Text style={[styles.empty, { color: colors.textMuted }]}>{l('Eşleşen tür yok', 'No matching type')}</Text>
                        ) : null}
                    </ScrollView>
                </View>
                <TouchableOpacity
                    style={[styles.closeWide, { backgroundColor: colors.accent }]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kapat', 'Close')}
                >
                    <Text style={styles.closeText}>{l('Kapat', 'Close')}</Text>
                </TouchableOpacity>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    layer: { width: '100%', maxWidth: 480, alignSelf: 'center' },
    // Shrinks into the room the keyboard leaves; its content scrolls.
    card: { flexShrink: 1, borderRadius: BorderRadius.lg, ...Shadows.lg },
    hidden: { display: 'none' },
    gridContent: { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.md },
    title: { fontSize: FontSize.lg, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, alignSelf: 'stretch' },
    tile: {
        width: '31%',
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.md,
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
    customRow: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: BorderRadius.md,
        paddingLeft: Spacing.md,
        paddingRight: 4,
        minHeight: 44,
    },
    customInput: { flex: 1, fontSize: FontSize.md, paddingVertical: Spacing.sm },
    customButton: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 7 },
    customButtonText: { color: '#ffffff', fontSize: FontSize.md, fontWeight: '700' },
    closeButton: { minWidth: 120, alignItems: 'center', borderRadius: BorderRadius.md, paddingVertical: 10, paddingHorizontal: Spacing.xl },
    closeText: { color: '#ffffff', fontSize: FontSize.lg, fontWeight: '700' },
    typeLayer: { flexShrink: 1, gap: Spacing.sm },
    search: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minHeight: 48,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
    },
    searchInput: { flex: 1, fontSize: FontSize.lg, paddingVertical: Spacing.sm },
    listCard: { flexShrink: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 46,
        paddingHorizontal: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    typeText: { flex: 1, fontSize: FontSize.lg },
    typeTextSelected: { fontWeight: '700' },
    empty: { textAlign: 'center', paddingVertical: Spacing.lg, fontSize: FontSize.md },
    closeWide: { alignItems: 'center', borderRadius: BorderRadius.md, paddingVertical: 12 },
});
