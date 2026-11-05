import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { useAppSettings } from '../../contexts/AppContext';
import { useI18n } from '../../hooks/useI18n';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { alert } from '../../lib/confirm';
import { hasSnapshotChanged, stableSnapshot } from '../../lib/dirtyState';
import { studyDayYmd } from '../../lib/studyAnalysis';
import { saveStudyPlans } from '../../lib/studyPlanStore';
import { defaultDetailedPlanDraft, generateDetailedPlan, type DetailedPlanDraft } from '../../lib/studyPlans';

/** The wizard's steps, in order, by the route that shows each under `/study-plan-wizard`. */
export const STUDY_PLAN_WIZARD_STEPS = ['index', 'courses', 'capacity'] as const;

interface StudyPlanWizardDraft {
    draft: DetailedPlanDraft;
    update: (patch: Partial<DetailedPlanDraft>) => void;
    result: ReturnType<typeof generateDetailedPlan>;
    /** Leaves the whole wizard, asking first when something was entered. */
    leave: () => void;
    /** Saves the plan generated from the draft as it is now, then leaves. */
    create: () => void;
    /** Each step calls this as it is shown. */
    showingStep: (step: number) => void;
}

const StudyPlanWizardContext = createContext<StudyPlanWizardDraft | null>(null);

export function useStudyPlanWizardDraft(): StudyPlanWizardDraft {
    const wizard = useContext(StudyPlanWizardContext);
    if (!wizard) throw new Error('useStudyPlanWizardDraft must be used inside StudyPlanWizardProvider');
    return wizard;
}

/**
 * The Detailed Plan draft, shared by the wizard's steps. Each step is a page of the wizard's own
 * stack, so the back swipe goes to the step before; leaving the wizard, from its first step or with
 * its Cancel button, asks before discarding what was entered.
 *
 * Each step reports itself as it is shown, so browser Back from a later step goes to the step
 * before instead of asking about leaving.
 */
export function StudyPlanWizardProvider({ children }: { children: React.ReactNode }) {
    const { l } = useI18n();
    const router = useRouter();
    // In the wizard's layout, this is the wizard's own route in the stack that opened it.
    const navigation = useNavigation();
    const { settings } = useAppSettings();
    const [initialSnapshot] = useState(() => stableSnapshot(
        defaultDetailedPlanDraft(studyDayYmd(Date.now(), settings.dayRolloverHour)),
    ));
    const [draft, setDraft] = useState<DetailedPlanDraft>(() => JSON.parse(initialSnapshot) as DetailedPlanDraft);
    const [created, setCreated] = useState(false);
    const update = useCallback((patch: Partial<DetailedPlanDraft>) => setDraft((current) => ({ ...current, ...patch })), []);
    const result = useMemo(() => generateDetailedPlan(draft), [draft]);
    const shownStepRef = useRef(0);
    const showingStep = useCallback((step: number) => { shownStepRef.current = step; }, []);
    const onFirstStep = useCallback(() => shownStepRef.current === 0, []);

    useUnsavedChangesGuard(!created && hasSnapshotChanged(initialSnapshot, draft), {
        title: l('Plan kaydedilmeden çıkılsın mı?', 'Leave without saving the plan?'),
        message: l('Girdiğiniz bilgiler silinir.', 'What you entered will be discarded.'),
        browserBackLeaves: onFirstStep,
    });

    const leave = useCallback(() => {
        if (navigation.canGoBack()) navigation.goBack();
        else router.replace('/study-plans' as any);
    }, [navigation, router]);

    // Leave only once the saved draft no longer holds the screen.
    useEffect(() => {
        if (created) leave();
    }, [created, leave]);

    const create = useCallback(() => {
        const fresh = generateDetailedPlan(draft);
        if (!fresh.ok) return;
        try {
            saveStudyPlans(fresh.blocks);
            setCreated(true);
        } catch (error) {
            console.warn('[StudyPlanWizard] save failed:', error);
            alert(l('Plan kaydedilemedi', 'The plan could not be saved'), l('Planlarınız değiştirilmedi.', 'Your plans were not changed.'));
        }
    }, [draft, l]);

    const value = useMemo(
        () => ({ draft, update, result, leave, create, showingStep }),
        [draft, update, result, leave, create, showingStep],
    );
    return <StudyPlanWizardContext.Provider value={value}>{children}</StudyPlanWizardContext.Provider>;
}
