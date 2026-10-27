import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ScreenHeader, { HeaderIconButton } from '../components/ScreenHeader';
import StopwatchHero from '../components/stopwatch/StopwatchHero';
import StopwatchTimeline from '../components/stopwatch/StopwatchTimeline';
import SubjectPickerSheet from '../components/stopwatch/SubjectPickerSheet';
import SessionEditorSheet, { editorInitialFor, type SessionEditorInitial } from '../components/stopwatch/SessionEditorSheet';
import StopwatchSettingsSheet from '../components/stopwatch/StopwatchSettingsSheet';
import StopwatchAlertsSheet from '../components/stopwatch/StopwatchAlertsSheet';
import SessionActionsMenu, { type SessionMenuItem } from '../components/stopwatch/SessionActionsMenu';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { BellIcon, CalendarIcon, GearIcon, PlusCircleIcon } from '../components/stopwatch/StopwatchIcons';
import { FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import { useI18n } from '../hooks/useI18n';
import { useStopwatch } from '../hooks/useStopwatch';
import { useStudySubjects } from '../hooks/useStudySubjects';
import { localDayNumber, dayNumberToYmd } from '../lib/ankiState';
import { goBackOr, openOrReturnTo } from '../lib/backNavigation';
import { alert, confirm } from '../lib/confirm';
import {
    MIN_SESSION_MS,
    examDaysLeft,
    finishStopwatch,
    stepDailyGoal,
    type RunningStopwatch,
    type StopwatchPrefs,
    type StudyKind,
    type StudySessionDraft,
} from '../lib/stopwatch';
import { deleteStudySession, insertStudySession, updateStudySession } from '../lib/stopwatchStore';
import {
    formatClockHhMm,
    formatSessionDuration,
    getRecentStudySnapshot,
    recentStudyDays,
    type StudyCalendarAggregate,
    type StudySession,
} from '../lib/studyCalendar';

/** Days "Son Çalışmalarınız" covers: today and the six before it. */
const RECENT_DAYS = 7;
const FAB_SIZE = 58;
const EMPTY_AGGREGATE: StudyCalendarAggregate = { days: [], totalsByDay: new Map() };

function lightHaptic(): void {
    try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
        // Haptics unavailable on this platform.
    }
}

/**
 * Kronometre: today's study time against the daily goal, a stopwatch with breaks, and the last
 * week of study — card sessions and Kronometre sessions on one timeline. It opens from the
 * Statistics screen's daily streak, which these sessions also keep alive.
 */
export default function StopwatchScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const rolloverHour = settings.dayRolloverHour;
    const { collectionVersion, invalidateCollection, getSchedulingRevision } = useCollectionInvalidation();
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
    }, [getSchedulingRevision]));

    const buildAlertCopy = useCallback((state: RunningStopwatch, prefs: StopwatchPrefs) => ({
        focusTitle: l('Ders süresi doldu', 'Study block is over'),
        focusBody: l(
            `${state.subject}: ${prefs.focusMinutes} dakikadır çalışıyorsunuz. Kısa bir mola verebilirsiniz.`,
            `${state.subject}: you have studied for ${prefs.focusMinutes} minutes. Time for a short break.`,
        ),
        breakTitle: l('Mola bitti', 'Break is over'),
        breakBody: l(`${state.subject} çalışmanıza dönebilirsiniz.`, `You can get back to ${state.subject}.`),
    }), [l]);

    const stopwatch = useStopwatch(buildAlertCopy);
    const { prefs, running, nowMs, elapsed } = stopwatch;

    const todayDayNumber = localDayNumber(nowMs, rolloverHour);
    const runningSinceMs = running?.startedAtMs ?? null;
    const snapshotKey = JSON.stringify([
        'stopwatch',
        collectionVersion,
        schedulingRevision,
        rolloverHour,
        todayDayNumber,
        runningSinceMs,
    ]);
    const loadSnapshot = useCallback(
        () => getRecentStudySnapshot(todayDayNumber, RECENT_DAYS, rolloverHour, runningSinceMs),
        [todayDayNumber, rolloverHour, runningSinceMs],
    );
    const { snapshot } = useDeferredScreenSnapshot(snapshotKey, loadSnapshot);
    const days = useMemo(
        () => recentStudyDays(snapshot ?? EMPTY_AGGREGATE, todayDayNumber, RECENT_DAYS),
        [snapshot, todayDayNumber],
    );

    // A stopwatch started before the day rolled over belongs to that day, as its session will.
    const runningCountsToday = running !== null && localDayNumber(running.startedAtMs, rolloverHour) === todayDayNumber;
    const todayStudyMs = (days[0]?.studyMs ?? 0) + (runningCountsToday ? elapsed?.studyMs ?? 0 : 0);
    const goalRemainingMs = Math.max(0, prefs.dailyGoalMinutes * 60_000 - todayStudyMs);

    const [picker, setPicker] = useState<'start' | 'plan' | null>(null);
    const [editor, setEditor] = useState<{ initial: SessionEditorInitial | null } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [menuSession, setMenuSession] = useState<StudySession | null>(null);
    const { recentSubjects, loadRecentSubjects, passOf } = useStudySubjects('Stopwatch');

    const openPicker = (mode: 'start' | 'plan') => {
        loadRecentSubjects();
        setPicker(mode);
    };

    const openEditor = (initial: SessionEditorInitial | null) => {
        loadRecentSubjects();
        setEditor({ initial });
    };

    const reportFailure = (error: unknown) => {
        console.warn('[Stopwatch] save failed:', error);
        alert(l('Kaydedilemedi', 'Could not save'), l('Çalışma kaydedilemedi. Lütfen yeniden deneyin.', 'The session could not be saved. Please try again.'));
    };

    const saveFinished = (): boolean => {
        try {
            stopwatch.finish();
            invalidateCollection();
            return true;
        } catch (error) {
            reportFailure(error);
            return false;
        }
    };

    const handleFinish = () => {
        if (!running) return;
        const draft = finishStopwatch(running, Date.now());
        if (draft.studyMs < MIN_SESSION_MS) {
            confirm(
                l('Kısa çalışma', 'Short session'),
                l('Bir dakikadan kısa çalışmalar kaydedilmez. Kronometre sıfırlansın mı?', 'Sessions shorter than a minute are not saved. Reset the stopwatch?'),
                () => stopwatch.discard(),
            );
            return;
        }
        confirm(
            l('Çalışmayı bitir', 'Finish the session'),
            l(
                `${running.subject}: ${formatSessionDuration(draft.studyMs, locale)} çalışma ve ${formatSessionDuration(draft.breakMs, locale)} mola kaydedilecek.`,
                `${running.subject}: ${formatSessionDuration(draft.studyMs, locale)} of study and ${formatSessionDuration(draft.breakMs, locale)} of break will be saved.`,
            ),
            () => {
                if (saveFinished()) lightHaptic();
            },
        );
    };

    const startSession = (subject: string, pass: number, kind: StudyKind) => {
        stopwatch.start(subject, pass, kind);
        lightHaptic();
    };

    const handlePlanStart = () => {
        const plan = prefs.plan;
        if (!plan) {
            openPicker('plan');
            return;
        }
        if (!running) {
            startSession(plan.subject, plan.pass, plan.kind);
            return;
        }
        if (running.subject === plan.subject) return;
        confirm(
            l('Derse geç', 'Switch subject'),
            l(
                `${running.subject} çalışması kaydedilip ${plan.subject} başlatılsın mı?`,
                `Save the ${running.subject} session and start ${plan.subject}?`,
            ),
            () => {
                if (saveFinished()) startSession(plan.subject, plan.pass, plan.kind);
            },
        );
    };

    const handleSaveSession = (draft: StudySessionDraft, recordId: number | null) => {
        try {
            if (recordId === null) insertStudySession(draft, 'manual');
            else updateStudySession(recordId, draft);
            setEditor(null);
            invalidateCollection();
        } catch (error) {
            reportFailure(error);
        }
    };

    const showDetails = (session: StudySession) => {
        const dayLabel = new Date(`${dayNumberToYmd(session.dayNumber)}T12:00:00`)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
        const lines = [
            `${dayLabel} · ${formatClockHhMm(session.startMs)} – ${formatClockHhMm(session.endMs)}`,
            l(`Çalışma: ${formatSessionDuration(session.studyMs, locale)}`, `Study: ${formatSessionDuration(session.studyMs, locale)}`),
            l(`Mola: ${formatSessionDuration(session.breakMs, locale)}`, `Break: ${formatSessionDuration(session.breakMs, locale)}`),
        ];
        if (session.source === 'cards') {
            lines.push(
                l(`Kart sayısı: ${session.cardCount}`, `Cards: ${session.cardCount}`),
                l(`Yanıt sayısı: ${session.reviewCount}`, `Answers: ${session.reviewCount}`),
                l(`Deste: ${session.deckName}`, `Deck: ${session.deckName}`),
            );
        } else {
            const type = studyTypeLabel(l, session.kind ?? 'pass', session.pass ?? 1);
            const breakCount = session.breakCount ?? 0;
            lines.splice(1, 0, l(`Tür: ${type}`, `Type: ${type}`));
            lines.push(l(`Mola sayısı: ${breakCount}`, `Breaks: ${breakCount}`));
            if (session.note) lines.push(l(`Not: ${session.note}`, `Note: ${session.note}`));
            lines.push(session.source === 'timer'
                ? l('Kronometre ile ölçüldü', 'Measured by the stopwatch')
                : l('Elle eklendi', 'Added by hand'));
        }
        alert(session.subject, lines.join('\n'));
    };

    const menuItems = (session: StudySession): SessionMenuItem[] => {
        const close = () => setMenuSession(null);
        const details: SessionMenuItem = {
            key: 'details',
            label: l('Oturum ayrıntıları', 'Session details'),
            onPress: () => { close(); showDetails(session); },
        };
        const initial = editorInitialFor(session);
        if (initial === null) {
            return [
                {
                    key: 'deck',
                    label: l('Bu desteye git', 'Go to this deck'),
                    hint: session.deckName,
                    onPress: () => {
                        close();
                        router.push(`/deck-overview?deck=${encodeURIComponent(session.deckName)}` as any);
                    },
                },
                details,
            ];
        }
        return [
            {
                key: 'edit',
                label: l('Düzenle', 'Edit'),
                onPress: () => {
                    close();
                    openEditor(initial);
                },
            },
            details,
            {
                key: 'delete',
                label: l('Oturumu sil', 'Delete session'),
                destructive: true,
                onPress: () => {
                    close();
                    confirm(
                        l('Oturum silinsin mi?', 'Delete this session?'),
                        l(`${session.subject} oturumu kalıcı olarak silinecek.`, `The ${session.subject} session will be deleted for good.`),
                        () => {
                            try {
                                deleteStudySession(initial.recordId);
                                invalidateCollection();
                            } catch (error) {
                                reportFailure(error);
                            }
                        },
                        { destructive: true },
                    );
                },
            },
        ];
    };

    const openCalendar = () => openOrReturnTo(router, navigation, 'study-calendar', '/study-calendar');

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Kronometre', 'Stopwatch')}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
                onBack={() => goBackOr(router)}
                actions={(
                    <>
                        <HeaderIconButton
                            accessibilityLabel={prefs.alertsEnabled
                                ? l('Hatırlatmalar açık', 'Reminders on')
                                : l('Hatırlatmalar kapalı', 'Reminders off')}
                            onPress={() => setAlertsOpen(true)}
                        >
                            <BellIcon color={colors.textPrimary} size={24} muted={!prefs.alertsEnabled} />
                        </HeaderIconButton>
                        <HeaderIconButton
                            accessibilityLabel={l('Kronometre ayarları', 'Stopwatch settings')}
                            onPress={() => setSettingsOpen(true)}
                        >
                            <GearIcon color={colors.textPrimary} size={24} />
                        </HeaderIconButton>
                    </>
                )}
            />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={{ paddingBottom: insets.bottom + FAB_SIZE + Spacing.xxl }}
                showsVerticalScrollIndicator={false}
            >
                <StopwatchHero
                    todayStudyMs={todayStudyMs}
                    goalMinutes={prefs.dailyGoalMinutes}
                    running={running}
                    elapsed={elapsed}
                    focusMinutes={prefs.focusMinutes}
                    breakMinutes={prefs.breakMinutes}
                    onStepGoal={(direction) => stopwatch.updatePrefs({ dailyGoalMinutes: stepDailyGoal(prefs.dailyGoalMinutes, direction) })}
                    onStart={() => openPicker('start')}
                    onPause={() => { stopwatch.pause(); lightHaptic(); }}
                    onResume={() => { stopwatch.resume(); lightHaptic(); }}
                    onFinish={handleFinish}
                />

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle} accessibilityRole="header">{l('Son Çalışmalarınız', 'Recent Study')}</Text>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => openEditor(null)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Elle çalışma ekle', 'Add a session by hand')}
                    >
                        <PlusCircleIcon color={colors.accent} size={22} />
                        <Text style={styles.addText}>{l('Çalışma Ekle', 'Add Session')}</Text>
                    </TouchableOpacity>
                </View>

                <StopwatchTimeline
                    days={days}
                    examDaysLeft={examDaysLeft(prefs.examDate, nowMs)}
                    plan={prefs.plan}
                    goalRemainingMs={goalRemainingMs}
                    live={running && runningCountsToday
                        ? { subject: running.subject, kind: running.kind, pass: running.pass, studyMs: elapsed?.studyMs ?? 0, onBreak: running.phase === 'break' }
                        : null}
                    onOpenExamSettings={() => setSettingsOpen(true)}
                    onPlanStart={handlePlanStart}
                    onPlanEdit={() => openPicker('plan')}
                    onSessionMenu={setMenuSession}
                    onOpenCalendar={openCalendar}
                />
            </ScrollView>

            <TouchableOpacity
                style={[styles.fab, { bottom: insets.bottom + Spacing.lg }]}
                onPress={openCalendar}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={l('Çalışma Takvimi', 'Study Calendar')}
            >
                <CalendarIcon color={colors.white} size={26} />
            </TouchableOpacity>

            <SubjectPickerSheet
                visible={picker !== null}
                mode={picker ?? 'start'}
                plan={prefs.plan}
                recentSubjects={recentSubjects}
                passOf={passOf}
                onClose={() => setPicker(null)}
                onPick={(subject, pass, kind) => {
                    if (picker === 'plan') stopwatch.updatePrefs({ plan: { subject, kind, pass } });
                    else startSession(subject, pass, kind);
                    setPicker(null);
                }}
                onClearPlan={() => {
                    stopwatch.updatePrefs({ plan: null });
                    setPicker(null);
                }}
            />
            <SessionEditorSheet
                visible={editor !== null}
                initial={editor?.initial ?? null}
                defaultSubject={prefs.plan?.subject ?? null}
                defaultKind={prefs.plan?.kind ?? 'pass'}
                defaultPass={prefs.plan?.pass ?? 1}
                recentSubjects={recentSubjects}
                passOf={passOf}
                onClose={() => setEditor(null)}
                onSave={handleSaveSession}
            />
            <StopwatchSettingsSheet
                visible={settingsOpen}
                prefs={prefs}
                onChange={stopwatch.updatePrefs}
                onClose={() => setSettingsOpen(false)}
            />
            <StopwatchAlertsSheet
                visible={alertsOpen}
                prefs={prefs}
                onChange={stopwatch.updatePrefs}
                onClose={() => setAlertsOpen(false)}
            />
            <SessionActionsMenu
                visible={menuSession !== null}
                title={menuSession?.subject ?? ''}
                items={menuSession ? menuItems(menuSession) : []}
                onClose={() => setMenuSession(null)}
            />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.xl,
        },
        sectionTitle: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        addButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
        addText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        fab: {
            position: 'absolute',
            right: Spacing.lg,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.md,
        },
    });
}
