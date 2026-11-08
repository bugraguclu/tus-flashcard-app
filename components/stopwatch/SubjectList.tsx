import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_SUBJECT_LENGTH, TUS_STUDY_SUBJECTS, normalizeSubjectName } from '../../lib/stopwatch';
import { Card, Section } from '../ui/Card';
import { SearchField } from '../ui/Fields';
import { ListRow } from '../ui/Rows';

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
        <ListRow
            key={subject}
            title={subject}
            summary={caption}
            onPress={() => onSelect(subject)}
            accessibilityLabel={caption ? `${subject}, ${caption}` : subject}
        />
    );

    return (
        <View style={styles.container}>
            <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder={l('Ders arayın veya yeni bir ders yazın', 'Search or type a new subject')}
                maxLength={MAX_SUBJECT_LENGTH}
                returnKeyType="done"
                onSubmitEditing={() => typed && onSelect(typed)}
                clearLabel={l('Aramayı temizle', 'Clear search')}
                accessibilityLabel={l('Ders adı', 'Subject name')}
            />
            <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {typed && !exactMatch ? (
                    <Card divided>{row(typed, l('Yeni ders olarak kullan', 'Use as a new subject'))}</Card>
                ) : null}
                {sections.plan.length > 0 && planned ? (
                    <Section label={l('Planınız', 'Your plan')}>{row(planned.subject, planned.caption)}</Section>
                ) : null}
                {sections.recent.length > 0 ? (
                    <Section label={l('Son çalışılanlar', 'Recently studied')}>{sections.recent.map((subject) => row(subject))}</Section>
                ) : null}
                {sections.courses.length > 0 ? (
                    <Section label={l('TUS dersleri', 'TUS subjects')}>{sections.courses.map((subject) => row(subject))}</Section>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flexShrink: 1, gap: Spacing.sm },
    list: { flexShrink: 1 },
    listContent: { gap: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
});
