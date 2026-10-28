import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { setStatusBarStyle } from 'expo-status-bar';
import ScreenHeader, { HeaderIconButton } from '../components/ScreenHeader';
import StopwatchHero, { useStopwatchHeroColor } from '../components/stopwatch/StopwatchHero';
import StopwatchTimeline from '../components/stopwatch/StopwatchTimeline';
import StudyStartSheet, { type StudyChoice } from '../components/stopwatch/StudyStartSheet';
import SessionEditorSheet, { editorInitialFor, type SessionEditorInitial } from '../components/stopwatch/SessionEditorSheet';
import RunningNoteSheet from '../components/stopwatch/RunningNoteSheet';
import StopwatchSettingsSheet from '../components/stopwatch/StopwatchSettingsSheet';
import StopwatchAlertsSheet from '../components/stopwatch/StopwatchAlertsSheet';
import SessionActionsMenu, { type SessionMenuItem } from '../components/stopwatch/SessionActionsMenu';
import StudyToolsMenu, { STUDY_TOOLS_FAB_SIZE } from '../components/stopwatch/StudyToolsMenu';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { BellIcon, CalendarIcon, GearIcon, PlusCircleIcon } from '../components/stopwatch/StopwatchIcons';
import { FontSize, Spacing, useIsDarkTheme, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import { useI18n } from '../hooks/useI18n';
import { useStopwatch } from '../hooks/useStopwatch';
import { useStudySubjects } from '../hooks/useStudySubjects';
import { localDayNumber, dayNumberToYmd } from '../lib/ankiState';
import { goBackOr, openOrReturnTo } from '../lib/backNavigation';
import { readStudyPlansForDisplay } from '../lib/studyPlanStore';
import { plannedTimeLeftMs, plansOnDay, type StudyPlanBlock } from '../lib/studyPlans';
import { alert, confirm } from '../lib/confirm';
import {
    MIN_SESSION_MS,
    examDaysLeft,
    finishStopwatch,
    stepDailyGoal,
    studySubjectKey,
    type RunningStopwatch,
    type StopwatchPrefs,
    type StudySessionDraft,
} from '../lib/stopwatch';
import { deleteStudySession, insertStudySession, updateStudySession } from '../lib/stopwatchStore';
import {
    formatClockHhMm,
    formatSessionDuration,
    getRecentStudySnapshot,
    recentStudyDays,
    studyMsBySubject,
    type StudyCalendarAggregate,
    type StudySession,
} from '../lib/studyCalendar';

/** Days "Son Çalışmalarınız" covers, as TUSBuddy's stopwatch does: today and yesterday. */
const RECENT_DAYS = 2;
const EMPTY_AGGREGATE: StudyCalendarAggregate = { days: [], totalsByDay: new Map() };
/** What "Çalışmaya Başla" offers before the stopwatch has ever run, as TUSBuddy does. */
const FIRST_CHOICE: StudyChoice = { subject: 'Karışık', kind: 'pass', pass: 1 };

function lightHaptic(): void {
    try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
        // Haptics unavailable on this platform.
    }
}

/**
 * Kronometre: today's study time against the daily goal, a stopwatch with breaks, and today and
 * yesterday — card sessions and Kronometre sessions on one timeline, with today's plans — laid out
 * after TUSBuddy's stopwatch. It opens from the deck list's bottom bar and from the Statistics
 * screen's daily streak, which these sessions also keep alive.
 */
export default function StopwatchScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const heroColor = useStopwatchHeroColor();
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

    // White status bar text over the coloured header while this screen is in front; the screens
    // opened over it get the theme's own back.
    useFocusEffect(useCallback(() => {
        setStatusBarStyle('light');
        return () => setStatusBarStyle(isDark ? 'light' : 'dark');
    }, [isDark]));

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
    const liveStudyMs = runningCountsToday ? elapsed?.studyMs ?? 0 : 0;
    const todayStudyMs = (days[0]?.studyMs ?? 0) + liveStudyMs;

    // Plans are edited on their own screen, which this one stays under; read them on return.
    const [studyPlans, setStudyPlans] = useState<StudyPlanBlock[]>(() => readStudyPlansForDisplay());
    useFocusEffect(useCallback(() => {
        setStudyPlans(readStudyPlansForDisplay());
    }, []));
    const todayPlans = useMemo(
        () => plansOnDay(studyPlans, dayNumberToYmd(todayDayNumber)),
        [studyPlans, todayDayNumber],
    );
    // Today's study of each subject, the running session's included, counts off today's plans.
    const todaySessions = days[0]?.sessions;
    const liveSubjectKey = runningCountsToday && running ? studySubjectKey(running.subject) : null;
    const liveMinute = Math.floor(liveStudyMs / 60_000);
    const planLeftMs = useMemo(() => {
        const studied = studyMsBySubject(todaySessions ?? []);
        if (liveSubjectKey) studied.set(liveSubjectKey, (studied.get(liveSubjectKey) ?? 0) + liveMinute * 60_000);
        return plannedTimeLeftMs(todayPlans, studied);
    }, [todaySessions, todayPlans, liveSubjectKey, liveMinute]);

    const [startOpen, setStartOpen] = useState(false);
    const [editor, setEditor] = useState<{ initial: SessionEditorInitial | null } | null>(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [menuSession, setMenuSession] = useState<StudySession | null>(null);
    const { recentSubjects, loadRecentSubjects, passOf } = useStudySubjects('Stopwatch');
    const lastChoice = useMemo<StudyChoice>(() => prefs.plan ?? FIRST_CHOICE, [prefs.plan]);

    const openStart = () => {
        loadRecentSubjects();
        setStartOpen(true);
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
            l('Çalışmayı sonlandır', 'Finish the session'),
            l(
                `${running.subject}: ${formatSessionDuration(draft.studyMs, locale)} çalışma ve ${formatSessionDuration(draft.breakMs, locale)} mola kaydedilecek.`,
                `${running.subject}: ${formatSessionDuration(draft.studyMs, locale)} of study and ${formatSessionDuration(draft.breakMs, locale)} of break will be saved.`,
            ),
            () => {
                if (saveFinished()) lightHaptic();
            },
        );
    };

    const startSession = (choice: StudyChoice) => {
        stopwatch.start(choice.subject, choice.pass, choice.kind);
        lightHaptic();
    };

    // A block from "Çalışma Planlama" starts the stopwatch on its subject and type; a running
    // session of another subject is saved first, after asking.
    const handleStartPlanned = (planned: StudyPlanBlock) => {
        const choice: StudyChoice = { subject: planned.subject, kind: planned.kind, pass: planned.pass };
        if (!running) {
            startSession(choice);
            return;
        }
        if (studySubjectKey(running.subject) === studySubjectKey(planned.subject)) return;
        confirm(
            l('Derse geç', 'Switch subject'),
            l(
                `${running.subject} çalışması kaydedilip ${planned.subject} başlatılsın mı?`,
                `Save the ${running.subject} session and start ${planned.subject}?`,
            ),
            () => {
                if (saveFinished()) startSession(choice);
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
        <SafeAreaView style={[styles.container, { backgroundColor: heroColor }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Kronometre', 'Stopwatch')}
                tint={{ background: heroColor, foreground: colors.white }}
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
                            <BellIcon color={colors.white} size={24} muted={!prefs.alertsEnabled} />
                        </HeaderIconButton>
                        <HeaderIconButton
                            accessibilityLabel={l('Çalışma Takvimi', 'Study Calendar')}
                            onPress={openCalendar}
                        >
                            <CalendarIcon color={colors.white} size={23} />
                        </HeaderIconButton>
                        <HeaderIconButton
                            accessibilityLabel={l('Kronometre ayarları', 'Stopwatch settings')}
                            onPress={() => setSettingsOpen(true)}
                        >
                            <GearIcon color={colors.white} size={24} />
                        </HeaderIconButton>
                    </>
                )}
            />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={{ paddingBottom: insets.bottom + STUDY_TOOLS_FAB_SIZE + Spacing.xxl }}
                showsVerticalScrollIndicator={false}
            >
                <StopwatchHero
                    todayStudyMs={todayStudyMs}
                    goalMinutes={prefs.dailyGoalMinutes}
                    running={running}
                    elapsed={elapsed}
                    onStepGoal={(direction) => stopwatch.updatePrefs({ dailyGoalMinutes: stepDailyGoal(prefs.dailyGoalMinutes, direction) })}
                    onStart={openStart}
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
                        accessibilityLabel={l('Geçmiş çalışma ekle', 'Add a past session')}
                    >
                        <PlusCircleIcon color={colors.badgeNew} size={20} />
                        <Text style={styles.addText}>{l('Çalışma Ekle', 'Add Session')}</Text>
                    </TouchableOpacity>
                </View>

                <StopwatchTimeline
                    days={days}
                    examDaysLeft={examDaysLeft(prefs.examDate, nowMs)}
                    live={running && runningCountsToday && elapsed
                        ? {
                            subject: running.subject,
                            kind: running.kind,
                            pass: running.pass,
                            startMs: running.startedAtMs,
                            studyMs: elapsed.studyMs,
                            breakMs: elapsed.breakMs,
                            phaseMs: elapsed.phaseMs,
                            onBreak: running.phase === 'break',
                            note: running.note,
                        }
                        : null}
                    focusMinutes={prefs.focusMinutes}
                    breakMinutes={prefs.breakMinutes}
                    onOpenExamSettings={() => setSettingsOpen(true)}
                    onSessionMenu={setMenuSession}
                    onEditLiveNote={() => setNoteOpen(true)}
                    onOpenCalendar={openCalendar}
                    todayPlans={todayPlans}
                    planLeftMs={planLeftMs}
                    hasStudyPlans={studyPlans.length > 0}
                    onOpenPlans={() => router.push('/study-plans' as any)}
                    onCreatePlan={() => router.push('/study-plan-wizard' as any)}
                    onStartPlanned={handleStartPlanned}
                />
            </ScrollView>

            <StudyToolsMenu bottom={insets.bottom + Spacing.lg} />

            <StudyStartSheet
                visible={startOpen}
                initial={lastChoice}
                recentSubjects={recentSubjects}
                passOf={passOf}
                onClose={() => setStartOpen(false)}
                onStart={(choice) => {
                    setStartOpen(false);
                    startSession(choice);
                }}
            />
            <SessionEditorSheet
                visible={editor !== null}
                initial={editor?.initial ?? null}
                defaultChoice={lastChoice}
                recentSubjects={recentSubjects}
                passOf={passOf}
                onClose={() => setEditor(null)}
                onSave={handleSaveSession}
            />
            <RunningNoteSheet
                visible={noteOpen && running !== null}
                subject={running?.subject ?? ''}
                note={running?.note ?? ''}
                onClose={() => setNoteOpen(false)}
                onSave={(note) => {
                    stopwatch.setNote(note);
                    setNoteOpen(false);
                }}
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
        container: { flex: 1 },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
        },
        sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        addButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
        addText: { fontSize: FontSize.md, fontWeight: '700', color: colors.badgeNew },
    });
}
