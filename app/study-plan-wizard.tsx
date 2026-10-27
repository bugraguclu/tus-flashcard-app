import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import { CapacityStep, CoursesStep } from '../components/stopwatch/DetailedPlanSteps';
import { weekdayShortName } from '../components/stopwatch/StudyPlanEditorSheet';
import { DateField, ToolButton, ToolSection } from '../components/stopwatch/StudyToolControls';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { goBackOr } from '../lib/backNavigation';
import { alert, confirm } from '../lib/confirm';
import { studyDayYmd } from '../lib/studyAnalysis';
import { saveStudyPlans } from '../lib/studyPlanStore';
import { defaultDetailedPlanDraft, generateDetailedPlan, type DetailedPlanDraft } from '../lib/studyPlans';

const STEPS = 3;
const WEEKDAY_LONG_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEKDAY_LONG_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Detaylı Plan", in three steps as TUSBuddy builds it: the target exam and dates; the courses in
 * study order with their pass, proficiency and hours; then the weekly capacity, any day's own
 * capacity and the calendar it produces. Creating saves every day's block in one write; the plan
 * is generated again from the controls at that moment, never from a stale preview.
 */
export default function StudyPlanWizardScreen() {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const [draft, setDraft] = useState<DetailedPlanDraft>(() => defaultDetailedPlanDraft(studyDayYmd(Date.now(), settings.dayRolloverHour)));
    const [step, setStep] = useState(0);
    const update = (patch: Partial<DetailedPlanDraft>) => setDraft((current) => ({ ...current, ...patch }));

    const result = useMemo(() => generateDetailedPlan(draft), [draft]);
    const problemText = result.ok ? null : {
        range: l('En fazla iki yıllık geçerli bir tarih aralığı seçin.', 'Choose a valid date range of up to two years.'),
        workload: l('Ders süreleri ve günlük kapasite geçerli olmalı; en az bir derse süre ayırın.', 'Course hours and daily capacity must be valid, with time for at least one course.'),
        capacity: l(
            'Seçilen tarihe kadar yeterli çalışma süresi yok. Bitişi uzatın, günlük kapasiteyi artırın veya ders sürelerini azaltın.',
            'There is not enough study time before the target date. Move it later, raise the daily capacity or lower the course hours.',
        ),
    }[result.problem];

    const leave = () => confirm(
        l('Plan kaydedilmeden çıkılsın mı?', 'Leave without saving the plan?'),
        l('Girdiğiniz bilgiler silinir.', 'What you entered will be discarded.'),
        () => goBackOr(router),
        { destructive: true },
    );

    const create = () => {
        const fresh = generateDetailedPlan(draft);
        if (!fresh.ok) return;
        try {
            saveStudyPlans(fresh.blocks);
            goBackOr(router);
        } catch (error) {
            console.warn('[StudyPlanWizard] save failed:', error);
            alert(l('Plan kaydedilemedi', 'The plan could not be saved'), l('Planlarınız değiştirilmedi.', 'Your plans were not changed.'));
        }
    };

    const weekdayName = (weekday: number) => (locale === 'tr' ? WEEKDAY_LONG_TR : WEEKDAY_LONG_EN)[weekday] ?? weekdayShortName(weekday, locale);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader title={l('Detaylı Çalışma Planı', 'Detailed Study Plan')} backAccessibilityLabel={l('Vazgeç', 'Cancel')} onBack={leave} />
            <View style={styles.progressRow} accessible accessibilityLabel={l(`Adım ${step + 1} / ${STEPS}`, `Step ${step + 1} of ${STEPS}`)}>
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${((step + 1) / STEPS) * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{`${step + 1} / ${STEPS}`}</Text>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {step === 0 ? (
                    <ToolSection
                        title={l('Hedeflediğiniz TUS', 'Your Target TUS')}
                        footer={l(
                            'Ders sırasını, tekrarınızı, yeterlilik seviyenizi ve planladığınız süreleri belirleyin. Son adımda takvimi inceleyip kaydedebilirsiniz.',
                            'Set the course order, your pass, proficiency and planned hours. You can review the calendar before saving.',
                        )}
                    >
                        <TextInput
                            style={styles.input}
                            value={draft.targetExam}
                            onChangeText={(targetExam) => update({ targetExam })}
                            placeholder={l('Hedef sınav adı (örn. 2027 TUS 1. Dönem)', 'Target exam (e.g. 2027 TUS spring)')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={60}
                            accessibilityLabel={l('Hedef sınav adı', 'Target exam')}
                        />
                        <DateField label={l('Başlangıç', 'Start')} ymd={draft.startYmd} onChange={(startYmd) => update({ startYmd })} />
                        <DateField label={l('Hedef Tarihi', 'Target Date')} ymd={draft.deadlineYmd} onChange={(deadlineYmd) => update({ deadlineYmd })} last />
                    </ToolSection>
                ) : step === 1 ? (
                    <CoursesStep courses={draft.courses} onChange={(courses) => update({ courses })} />
                ) : (
                    <CapacityStep draft={draft} onChange={update} preview={result.ok ? result.blocks : []} weekdayName={weekdayName} />
                )}
                {step > 0 && problemText ? <Text style={styles.error} accessibilityLiveRegion="polite">{problemText}</Text> : null}
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
                {step > 0 ? <View style={styles.footerButton}><ToolButton label={l('Geri', 'Back')} tone="plain" onPress={() => setStep(step - 1)} /></View> : null}
                <View style={styles.footerButton}>
                    {step < STEPS - 1 ? (
                        <ToolButton label={l('İleri', 'Next')} onPress={() => setStep(step + 1)} />
                    ) : (
                        <ToolButton label={l('Oluştur', 'Create')} onPress={create} disabled={!result.ok} />
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
        progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.borderLight, overflow: 'hidden' },
        progressFill: { height: '100%', backgroundColor: colors.accent },
        progressText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.lg },
        input: {
            margin: Spacing.md,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
            color: colors.textPrimary,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            fontSize: FontSize.md,
        },
        error: { fontSize: FontSize.sm, fontWeight: '600', color: colors.btnAgain },
        footer: {
            flexDirection: 'row',
            gap: Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        footerButton: { flex: 1 },
    });
}
