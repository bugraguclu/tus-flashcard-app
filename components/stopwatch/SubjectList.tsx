import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_SUBJECT_LENGTH, TUS_STUDY_SUBJECTS, normalizeSubjectName } from '../../lib/stopwatch';
import { studySubjectGlyph } from '../../lib/studyCalendar';

interface SubjectListProps {
    /** Subjects of the latest sessions, newest first. */
    recentSubjects: string[];
    /** The plan's subject, listed first with its own caption. */
    planned?: { subject: string; caption: string } | null;
    onSelect: (subject: string) => void;
}

const fold = (value: string) => value.toLocaleLowerCase('tr');

/**
 * Every subject the learner can study with the Kronometre: the plan, the subjects of recent
 * sessions and the TUS courses, filtered by the search field. Whatever is typed there can be used
 * as a new subject of its own, so a learner is never limited to the built-in list.
 */
export default function SubjectList({ recentSubjects, planned, onSelect }: SubjectListProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const [query, setQuery] = useState('');
    const typed = normalizeSubjectName(query);
    const needle = fold(typed);

    const sections = useMemo(() => {
        const seen = new Set<string>();
        const take = (subjects: readonly string[]) => subjects.filter((subject) => {
            const key = fold(subject);
            if (seen.has(key) || (needle && !key.includes(needle))) return false;
            seen.add(key);
            return true;
        });
        const plan = planned ? take([planned.subject]) : [];
        const recent = take(recentSubjects);
        const courses = take(TUS_STUDY_SUBJECTS);
        return { plan, recent, courses };
    }, [planned, recentSubjects, needle]);

    const exactMatch = [...sections.plan, ...sections.recent, ...sections.courses]
        .some((subject) => fold(subject) === needle);

    const row = (subject: string, caption?: string) => (
        <TouchableOpacity
            key={subject}
            style={[styles.row, { backgroundColor: colors.bgCard }]}
            onPress={() => onSelect(subject)}
            accessibilityRole="button"
            accessibilityLabel={caption ? `${subject}, ${caption}` : subject}
        >
            <View style={[styles.tile, { backgroundColor: colors.accentLight }]}>
                <Text style={[styles.tileText, { color: colors.accent }]}>{studySubjectGlyph(subject)}</Text>
            </View>
            <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{subject}</Text>
                {caption ? <Text style={[styles.rowCaption, { color: colors.textMuted }]} numberOfLines={1}>{caption}</Text> : null}
            </View>
            <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </TouchableOpacity>
    );

    const heading = (title: string) => (
        <Text style={[styles.heading, { color: colors.textMuted }]} accessibilityRole="header">{title}</Text>
    );

    return (
        <View style={styles.container}>
            <TextInput
                style={[styles.search, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                value={query}
                onChangeText={setQuery}
                placeholder={l('Ders arayın veya yeni bir ders yazın', 'Search or type a new subject')}
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_SUBJECT_LENGTH}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => typed && onSelect(typed)}
                accessibilityLabel={l('Ders adı', 'Subject name')}
            />
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {typed && !exactMatch ? (
                    <View style={styles.section}>
                        {row(typed, l('Yeni ders olarak kullan', 'Use as a new subject'))}
                    </View>
                ) : null}
                {sections.plan.length > 0 && planned ? (
                    <View style={styles.section}>
                        {heading(l('Planınız', 'Your plan'))}
                        {row(planned.subject, planned.caption)}
                    </View>
                ) : null}
                {sections.recent.length > 0 ? (
                    <View style={styles.section}>
                        {heading(l('Son çalışılanlar', 'Recently studied'))}
                        {sections.recent.map((subject) => row(subject))}
                    </View>
                ) : null}
                {sections.courses.length > 0 ? (
                    <View style={styles.section}>
                        {heading(l('TUS dersleri', 'TUS subjects'))}
                        {sections.courses.map((subject) => row(subject))}
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flexShrink: 1, gap: Spacing.sm },
    search: {
        minHeight: 46,
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.md,
        fontSize: FontSize.lg,
    },
    list: { flexShrink: 1 },
    section: { gap: Spacing.xs, marginBottom: Spacing.md },
    heading: { fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        minHeight: 56,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.md,
    },
    tile: { width: 38, height: 38, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontSize: FontSize.xl, fontWeight: '800' },
    rowCopy: { flex: 1, gap: 1 },
    rowTitle: { fontSize: FontSize.lg, fontWeight: '600' },
    rowCaption: { fontSize: FontSize.sm },
    chevron: { fontSize: FontSize.xxl, fontWeight: '300' },
});
