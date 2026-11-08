import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatStudyTotal } from '../../lib/stopwatch';
import { studySubjectInitial } from '../../lib/studyCalendar';
import {
    MAX_COURSE_HOURS,
    MAX_DAILY_CAPACITY_MINUTES,
    MAX_PLAN_WORKLOAD_PASS,
    WEEKDAYS_MONDAY_FIRST,
    detailedPlanCapacity,
    formatPlanClock,
    recommendedCourseHours,
    ymdRange,
    ymdToLocalDate,
    type DetailedPlanDraft,
    type StudyPlanBlock,
    type StudyWorkload,
} from '../../lib/studyPlans';
import { Button, IconButton } from '../ui/Button';
import { Section } from '../ui/Card';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronUpIcon } from '../ui/icons';
import { ValueRow } from '../ui/Rows';
import { Stepper } from '../ui/Stepper';
import { Radius, Type } from '../ui/tokens';

const CAPACITY_STEP = 30;
const PREVIEW_DAY_LIMIT = 120;

/**
 * The detailed plan's second and third steps: the courses in study order with their pass,
 * proficiency and hours; then the weekly capacity, per-day overrides and the generated calendar.
 */

export function CoursesStep({ courses, onChange }: { courses: StudyWorkload[]; onChange: (courses: StudyWorkload[]) => void }) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const update = (index: number, patch: Partial<StudyWorkload>) => onChange(courses.map((course, at) => (at === index ? { ...course, ...patch } : course)));
    const move = (index: number, direction: 1 | -1) => {
        const target = index + direction;
        if (target < 0 || target >= courses.length) return;
        const next = [...courses];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };
    const totalHours = courses.reduce((sum, course) => sum + course.hours, 0);

    return (
        <Section
            label={l(`Dersler · Toplam ${totalHours} saat`, `Courses · ${totalHours} hours in all`)}
            footnote={l(
                'Dersler bu sırayla programa yerleşir; okla yerlerini değiştirin. Süresi 0 olan dersler programa alınmaz. Yeterlilik kendi değerlendirmenizdir; tavsiye edilen süre yalnızca ölçülmüş derslerde gösterilir.',
                'Courses are scheduled in this order; use the arrows to reorder. Courses with 0 hours are left out. Proficiency is your own rating; a recommended time is shown only where it was measured.',
            )}
        >
            {courses.map((course, index) => {
                const recommended = recommendedCourseHours(course.subject, course.pass, course.proficiency);
                return (
                    <View key={course.subject} style={styles.course}>
                        <View style={styles.courseHeader}>
                            <View style={[styles.tile, { backgroundColor: colors.accentLight }]}>
                                <Text style={[styles.tileText, { color: colors.accent }]}>{studySubjectInitial(course.subject)}</Text>
                            </View>
                            <Text style={[styles.courseName, { color: colors.accent }]} numberOfLines={1}>{`${index + 1}. ${course.subject}`}</Text>
                            <IconButton
                                onPress={() => move(index, -1)}
                                disabled={index === 0}
                                accessibilityLabel={l(`${course.subject} yukarı taşı`, `Move ${course.subject} up`)}
                            >
                                <ArrowUpIcon color={colors.textSecondary} />
                            </IconButton>
                            <IconButton
                                onPress={() => move(index, 1)}
                                disabled={index === courses.length - 1}
                                accessibilityLabel={l(`${course.subject} aşağı taşı`, `Move ${course.subject} down`)}
                            >
                                <ArrowDownIcon color={colors.textSecondary} />
                            </IconButton>
                        </View>
                        <ValueRow label={l('Kaçıncı tekrardasınız?', 'Which pass?')}>
                            <Stepper
                                value={l(`${course.pass}. Tekrar`, `Pass ${course.pass}`)}
                                onDecrement={() => update(index, { pass: Math.max(1, Math.min(MAX_PLAN_WORKLOAD_PASS, course.pass - 1)) })}
                                onIncrement={() => update(index, { pass: Math.max(1, Math.min(MAX_PLAN_WORKLOAD_PASS, course.pass + 1)) })}
                                decrementLabel={l('Önceki tekrar', 'Previous pass')}
                                incrementLabel={l('Sonraki tekrar', 'Next pass')}
                                canDecrement={course.pass > 1}
                                canIncrement={course.pass < MAX_PLAN_WORKLOAD_PASS}
                                style={styles.stepper}
                            />
                        </ValueRow>
                        <ValueRow label={l('Yeterlilik', 'Proficiency')}>
                            <Stepper
                                value={`${course.proficiency}/10`}
                                onDecrement={() => update(index, { proficiency: Math.max(1, Math.min(10, course.proficiency - 1)) })}
                                onIncrement={() => update(index, { proficiency: Math.max(1, Math.min(10, course.proficiency + 1)) })}
                                decrementLabel={l('Yeterliliği azalt', 'Lower proficiency')}
                                incrementLabel={l('Yeterliliği artır', 'Raise proficiency')}
                                canDecrement={course.proficiency > 1}
                                canIncrement={course.proficiency < 10}
                                style={styles.stepper}
                            />
                        </ValueRow>
                        <ValueRow label={l('Planlanan süre', 'Planned time')}>
                            <Stepper
                                value={l(`${course.hours} saat`, `${course.hours} h`)}
                                onDecrement={() => update(index, { hours: Math.max(0, Math.min(MAX_COURSE_HOURS, course.hours - 1)) })}
                                onIncrement={() => update(index, { hours: Math.max(0, Math.min(MAX_COURSE_HOURS, course.hours + 1)) })}
                                decrementLabel={l('Bir saat az', 'One hour less')}
                                incrementLabel={l('Bir saat fazla', 'One hour more')}
                                canDecrement={course.hours > 0}
                                canIncrement={course.hours < MAX_COURSE_HOURS}
                                style={styles.stepper}
                            />
                        </ValueRow>
                        {recommended !== null && recommended !== course.hours ? (
                            <Button
                                variant="plain"
                                size="compact"
                                label={l(`Tavsiye edilen süre: ${recommended} saat · Uygula`, `Recommended: ${recommended} h · Apply`)}
                                onPress={() => update(index, { hours: recommended })}
                                style={styles.link}
                            />
                        ) : null}
                    </View>
                );
            })}
        </Section>
    );
}

interface CapacityStepProps {
    draft: DetailedPlanDraft;
    onChange: (patch: Partial<DetailedPlanDraft>) => void;
    preview: StudyPlanBlock[];
    weekdayName: (weekday: number) => string;
}

export function CapacityStep({ draft, onChange, preview, weekdayName }: CapacityStepProps) {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const [openDay, setOpenDay] = useState<string | null>(null);
    const weekly = draft.weeklyMinutes.reduce((sum, minutes) => sum + minutes, 0);
    const days = ymdRange(draft.startYmd, draft.deadlineYmd).slice(0, PREVIEW_DAY_LIMIT);
    const byDay = new Map<string, StudyPlanBlock[]>();
    for (const block of preview) byDay.set(block.fromYmd, [...(byDay.get(block.fromYmd) ?? []), block]);
    const total = preview.reduce((sum, block) => sum + block.durationMinutes, 0);
    const dayLabel = (ymd: string) => ymdToLocalDate(ymd).toLocaleDateString(localeTag, { day: 'numeric', month: 'long', weekday: 'long' });
    const capacityStepper = (minutes: number, set: (minutes: number) => void, name: string) => (
        <Stepper
            value={formatPlanClock(minutes)}
            onDecrement={() => set(Math.max(0, Math.min(MAX_DAILY_CAPACITY_MINUTES, minutes - CAPACITY_STEP)))}
            onIncrement={() => set(Math.max(0, Math.min(MAX_DAILY_CAPACITY_MINUTES, minutes + CAPACITY_STEP)))}
            decrementLabel={l(`${name}: yarım saat az`, `${name}: half an hour less`)}
            incrementLabel={l(`${name}: yarım saat fazla`, `${name}: half an hour more`)}
            canDecrement={minutes > 0}
            canIncrement={minutes < MAX_DAILY_CAPACITY_MINUTES}
            style={styles.stepper}
        />
    );

    return (
        <>
            <Section
                label={l('Haftalık Çalışma Süresi', 'Weekly Study Time')}
                footnote={l(`Haftalık toplam: ${formatStudyTotal(weekly * 60_000, 'tr')}. Dinlenme günü için süreyi 0 yapın.`, `Weekly total: ${formatStudyTotal(weekly * 60_000, 'en')}. Set 0 for a rest day.`)}
            >
                {WEEKDAYS_MONDAY_FIRST.map((weekday) => (
                    <ValueRow key={weekday} label={weekdayName(weekday)}>
                        {capacityStepper(draft.weeklyMinutes[weekday], (minutes) => {
                            const next = [...draft.weeklyMinutes];
                            next[weekday] = minutes;
                            onChange({ weeklyMinutes: next });
                        }, weekdayName(weekday))}
                    </ValueRow>
                ))}
                <View style={styles.linkRow}>
                    <Button
                        variant="plain"
                        size="compact"
                        label={l('Varsayılan Sürelere Dön', 'Back to Default Times')}
                        onPress={() => onChange({ weeklyMinutes: [480, 480, 480, 480, 480, 480, 480], dayOverrides: {} })}
                        style={styles.link}
                    />
                </View>
            </Section>

            {preview.length > 0 ? (
                <Section label={l('Plan Özeti', 'Plan Summary')}>
                    <ValueRow label={l('Çalışma Günü', 'Study Days')} value={String(byDay.size)} />
                    <ValueRow label={l('Toplam Süre', 'Total Time')} value={formatStudyTotal(total * 60_000, locale)} />
                    <ValueRow label={l('Bitiş', 'Finishes')} value={dayLabel(preview[preview.length - 1].fromYmd)} />
                </Section>
            ) : null}

            <Section
                label={l('Günlük Takvim', 'Daily Calendar')}
                footnote={days.length === PREVIEW_DAY_LIMIT ? l(`İlk ${PREVIEW_DAY_LIMIT} gün gösteriliyor.`, `Showing the first ${PREVIEW_DAY_LIMIT} days.`) : undefined}
            >
                {days.map((day) => {
                    const blocks = byDay.get(day) ?? [];
                    const open = openDay === day;
                    const capacity = detailedPlanCapacity(draft, day);
                    return (
                        <View key={day}>
                            {/* A disclosure row: the kit's rows carry no expanded state. */}
                            <TouchableOpacity
                                style={styles.dayHeader}
                                onPress={() => setOpenDay(open ? null : day)}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: open }}
                            >
                                <View style={styles.dayCopy}>
                                    <Text style={[Type.rowTitle, { color: colors.textPrimary }]}>{dayLabel(day)}</Text>
                                    <Text style={[Type.caption, { color: colors.textMuted }]}>
                                        {blocks.length > 0
                                            ? blocks.map((block) => `${block.subject} ${formatStudyTotal(block.durationMinutes * 60_000, locale)}`).join(' · ')
                                            : capacity === 0 ? l('Dinlenme günü', 'Rest day') : l('Plan yok', 'Nothing planned')}
                                    </Text>
                                </View>
                                {open
                                    ? <ChevronUpIcon color={colors.textMuted} size={16} />
                                    : <ChevronDownIcon color={colors.textMuted} size={16} />}
                            </TouchableOpacity>
                            {open ? (
                                <ValueRow label={l('Bu günün kapasitesi', 'This day’s capacity')}>
                                    {capacityStepper(capacity, (minutes) => onChange({ dayOverrides: { ...draft.dayOverrides, [day]: minutes } }), dayLabel(day))}
                                </ValueRow>
                            ) : null}
                        </View>
                    );
                })}
            </Section>
        </>
    );
}

const styles = StyleSheet.create({
    course: { paddingVertical: Spacing.xs },
    courseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingLeft: Spacing.lg, paddingRight: Spacing.sm },
    tile: { width: 30, height: 30, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs },
    tileText: { fontSize: FontSize.xs, fontWeight: '800' },
    courseName: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
    stepper: { alignSelf: 'center' },
    linkRow: { paddingVertical: Spacing.xs },
    link: { alignSelf: 'flex-start', marginLeft: Spacing.xs },
    dayHeader: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 2,
    },
    dayCopy: { flex: 1, gap: 2 },
});
