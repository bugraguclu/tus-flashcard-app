import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
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
import { Stepper } from './SheetControls';
import { ToolSection } from './StudyToolControls';

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
        <ToolSection
            title={l(`Dersler · Toplam ${totalHours} saat`, `Courses · ${totalHours} hours in all`)}
            footer={l(
                'Dersler bu sırayla programa yerleşir; okla yerlerini değiştirin. Süresi 0 olan dersler programa alınmaz. Yeterlilik kendi değerlendirmenizdir; tavsiye edilen süre yalnızca ölçülmüş derslerde gösterilir.',
                'Courses are scheduled in this order; use the arrows to reorder. Courses with 0 hours are left out. Proficiency is your own rating; a recommended time is shown only where it was measured.',
            )}
        >
            {courses.map((course, index) => {
                const recommended = recommendedCourseHours(course.subject, course.pass, course.proficiency);
                return (
                    <View key={course.subject} style={[styles.course, index < courses.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                        <View style={styles.courseHeader}>
                            <View style={[styles.tile, { backgroundColor: colors.accentLight }]}>
                                <Text style={[styles.tileText, { color: colors.accent }]}>{studySubjectInitial(course.subject)}</Text>
                            </View>
                            <Text style={[styles.courseName, { color: colors.accent }]} numberOfLines={1}>{`${index + 1}. ${course.subject}`}</Text>
                            <TouchableOpacity
                                style={styles.order}
                                onPress={() => move(index, -1)}
                                disabled={index === 0}
                                accessibilityRole="button"
                                accessibilityLabel={l(`${course.subject} yukarı taşı`, `Move ${course.subject} up`)}
                            >
                                <Text style={[styles.orderText, { color: index === 0 ? colors.border : colors.textSecondary }]}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.order}
                                onPress={() => move(index, 1)}
                                disabled={index === courses.length - 1}
                                accessibilityRole="button"
                                accessibilityLabel={l(`${course.subject} aşağı taşı`, `Move ${course.subject} down`)}
                            >
                                <Text style={[styles.orderText, { color: index === courses.length - 1 ? colors.border : colors.textSecondary }]}>↓</Text>
                            </TouchableOpacity>
                        </View>
                        <Line label={l('Kaçıncı tekrardasınız?', 'Which pass?')}>
                            <Stepper
                                value={l(`${course.pass}. Tekrar`, `Pass ${course.pass}`)}
                                onStep={(direction) => update(index, { pass: Math.max(1, Math.min(MAX_PLAN_WORKLOAD_PASS, course.pass + direction)) })}
                                decreaseLabel={l('Önceki tekrar', 'Previous pass')}
                                increaseLabel={l('Sonraki tekrar', 'Next pass')}
                                canDecrease={course.pass > 1}
                                canIncrease={course.pass < MAX_PLAN_WORKLOAD_PASS}
                            />
                        </Line>
                        <Line label={l('Yeterlilik', 'Proficiency')}>
                            <Stepper
                                value={`${course.proficiency}/10`}
                                onStep={(direction) => update(index, { proficiency: Math.max(1, Math.min(10, course.proficiency + direction)) })}
                                decreaseLabel={l('Yeterliliği azalt', 'Lower proficiency')}
                                increaseLabel={l('Yeterliliği artır', 'Raise proficiency')}
                                canDecrease={course.proficiency > 1}
                                canIncrease={course.proficiency < 10}
                            />
                        </Line>
                        <Line label={l('Planlanan süre', 'Planned time')}>
                            <Stepper
                                value={l(`${course.hours} saat`, `${course.hours} h`)}
                                onStep={(direction) => update(index, { hours: Math.max(0, Math.min(MAX_COURSE_HOURS, course.hours + direction)) })}
                                decreaseLabel={l('Bir saat az', 'One hour less')}
                                increaseLabel={l('Bir saat fazla', 'One hour more')}
                                canDecrease={course.hours > 0}
                                canIncrease={course.hours < MAX_COURSE_HOURS}
                            />
                        </Line>
                        {recommended !== null && recommended !== course.hours ? (
                            <TouchableOpacity onPress={() => update(index, { hours: recommended })} accessibilityRole="button" style={styles.recommend}>
                                <Text style={[styles.recommendText, { color: colors.accent }]}>
                                    {l(`Tavsiye edilen süre: ${recommended} saat · Uygula`, `Recommended: ${recommended} h · Apply`)}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                );
            })}
        </ToolSection>
    );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    return (
        <View style={styles.line}>
            <Text style={[styles.lineLabel, { color: colors.textPrimary }]}>{label}</Text>
            {children}
        </View>
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
            onStep={(direction) => set(Math.max(0, Math.min(MAX_DAILY_CAPACITY_MINUTES, minutes + direction * CAPACITY_STEP)))}
            decreaseLabel={l(`${name}: yarım saat az`, `${name}: half an hour less`)}
            increaseLabel={l(`${name}: yarım saat fazla`, `${name}: half an hour more`)}
            canDecrease={minutes > 0}
            canIncrease={minutes < MAX_DAILY_CAPACITY_MINUTES}
        />
    );

    return (
        <>
            <ToolSection
                title={l('Haftalık Çalışma Süresi', 'Weekly Study Time')}
                footer={l(`Haftalık toplam: ${formatStudyTotal(weekly * 60_000, 'tr')}. Dinlenme günü için süreyi 0 yapın.`, `Weekly total: ${formatStudyTotal(weekly * 60_000, 'en')}. Set 0 for a rest day.`)}
            >
                {WEEKDAYS_MONDAY_FIRST.map((weekday) => (
                    <Line key={weekday} label={weekdayName(weekday)}>
                        {capacityStepper(draft.weeklyMinutes[weekday], (minutes) => {
                            const next = [...draft.weeklyMinutes];
                            next[weekday] = minutes;
                            onChange({ weeklyMinutes: next });
                        }, weekdayName(weekday))}
                    </Line>
                ))}
                <TouchableOpacity
                    style={styles.reset}
                    onPress={() => onChange({ weeklyMinutes: [480, 480, 480, 480, 480, 480, 480], dayOverrides: {} })}
                    accessibilityRole="button"
                >
                    <Text style={[styles.recommendText, { color: colors.accent }]}>{l('Varsayılan Sürelere Dön', 'Back to Default Times')}</Text>
                </TouchableOpacity>
            </ToolSection>

            {preview.length > 0 ? (
                <ToolSection title={l('Plan Özeti', 'Plan Summary')}>
                    <Line label={l('Çalışma Günü', 'Study Days')}><Text style={[styles.value, { color: colors.textSecondary }]}>{byDay.size}</Text></Line>
                    <Line label={l('Toplam Süre', 'Total Time')}><Text style={[styles.value, { color: colors.textSecondary }]}>{formatStudyTotal(total * 60_000, locale)}</Text></Line>
                    <Line label={l('Bitiş', 'Finishes')}><Text style={[styles.value, { color: colors.textSecondary }]}>{dayLabel(preview[preview.length - 1].fromYmd)}</Text></Line>
                </ToolSection>
            ) : null}

            <ToolSection
                title={l('Günlük Takvim', 'Daily Calendar')}
                footer={days.length === PREVIEW_DAY_LIMIT ? l(`İlk ${PREVIEW_DAY_LIMIT} gün gösteriliyor.`, `Showing the first ${PREVIEW_DAY_LIMIT} days.`) : undefined}
            >
                {days.map((day, index) => {
                    const blocks = byDay.get(day) ?? [];
                    const open = openDay === day;
                    const capacity = detailedPlanCapacity(draft, day);
                    return (
                        <View key={day} style={[styles.day, index < days.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                            <TouchableOpacity
                                style={styles.dayHeader}
                                onPress={() => setOpenDay(open ? null : day)}
                                accessibilityRole="button"
                                accessibilityState={{ expanded: open }}
                            >
                                <View style={styles.dayCopy}>
                                    <Text style={[styles.dayTitle, { color: colors.textPrimary }]}>{dayLabel(day)}</Text>
                                    <Text style={[styles.dayMeta, { color: colors.textMuted }]}>
                                        {blocks.length > 0
                                            ? blocks.map((block) => `${block.subject} ${formatStudyTotal(block.durationMinutes * 60_000, locale)}`).join(' · ')
                                            : capacity === 0 ? l('Dinlenme günü', 'Rest day') : l('Plan yok', 'Nothing planned')}
                                    </Text>
                                </View>
                                <Text style={[styles.chevron, { color: colors.textMuted }]}>{open ? '⌃' : '⌄'}</Text>
                            </TouchableOpacity>
                            {open ? (
                                <Line label={l('Bu günün kapasitesi', 'This day’s capacity')}>
                                    {capacityStepper(capacity, (minutes) => onChange({ dayOverrides: { ...draft.dayOverrides, [day]: minutes } }), dayLabel(day))}
                                </Line>
                            ) : null}
                        </View>
                    );
                })}
            </ToolSection>
        </>
    );
}

const styles = StyleSheet.create({
    course: { padding: Spacing.md, gap: Spacing.xs },
    courseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    tile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontSize: FontSize.xs, fontWeight: '800' },
    courseName: { flex: 1, fontSize: FontSize.md, fontWeight: '800' },
    order: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
    orderText: { fontSize: FontSize.lg, fontWeight: '800' },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, minHeight: 44, paddingHorizontal: Spacing.md },
    lineLabel: { flex: 1, fontSize: FontSize.sm },
    recommend: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    recommendText: { fontSize: FontSize.sm, fontWeight: '700' },
    reset: { padding: Spacing.md },
    value: { fontSize: FontSize.md, fontWeight: '700' },
    day: { paddingVertical: Spacing.xs },
    dayHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
    dayCopy: { flex: 1, gap: 2 },
    dayTitle: { fontSize: FontSize.sm, fontWeight: '700' },
    dayMeta: { fontSize: FontSize.xs },
    chevron: { fontSize: FontSize.lg },
});
