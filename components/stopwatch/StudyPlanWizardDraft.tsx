import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useAppSettings, useCollectionInvalidation } from '../../contexts/AppContext';
import { useI18n } from '../../hooks/useI18n';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { alert, confirm } from '../../lib/confirm';
import { studyDayYmd } from '../../lib/studyAnalysis';
import { saveStudyPlans, STUDY_PLANS_KEY } from '../../lib/studyPlanStore';
import { defaultDetailedPlanDraft, generateDetailedPlan, type DetailedPlanDraft } from '../../lib/studyPlans';
import { clearStudyPlanWizardDraft, loadStudyPlanWizardDraft, saveStudyPlanWizardDraft, WIZARD_DRAFT_KEY } from '../../lib/studyPlanWizardDraft';
import { commitSettingsWrite } from '../../lib/settingsWrite';

export const STUDY_PLAN_WIZARD_STEPS = ['index', 'courses', 'capacity'] as const;
interface Wizard {
    draft: DetailedPlanDraft; update: (patch: Partial<DetailedPlanDraft>) => void;
    result: ReturnType<typeof generateDetailedPlan>; leave: () => void; create: () => void;
    showingStep: (step: number) => void; busy: boolean; readFailed: boolean; persistFailed: boolean;
    resumeStep: number | null; discarded: boolean; retryRead: () => void; resume: () => void; discard: () => void;
}
const Context = createContext<Wizard | null>(null);
export function useStudyPlanWizardDraft(): Wizard {
    const wizard = useContext(Context);
    if (!wizard) throw new Error('StudyPlanWizardProvider is required');
    return wizard;
}

/** Local drafts wrap the existing routed wizard; plans and draft removal commit together. */
export function StudyPlanWizardProvider({ children }: { children: React.ReactNode }) {
    const { l } = useI18n(); const router = useRouter(); const navigation = useNavigation();
    const { settings } = useAppSettings(); const { invalidateCollection } = useCollectionInvalidation();
    const today = studyDayYmd(Date.now(), settings.dayRolloverHour);
    const [loaded, setLoaded] = useState(() => loadStudyPlanWizardDraft(today, Date.now(), { preserveCorrupt: true }));
    const [draft, setDraft] = useState(() => loaded.status === 'restored' ? loaded.value.draft : defaultDetailedPlanDraft(today));
    const [resumeStep, setResumeStep] = useState<number | null>(() => loaded.status === 'restored' ? loaded.value.step : null);
    const [resumeTarget, setResumeTarget] = useState<number | null>(null);
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false); const [created, setCreated] = useState(false);
    const [persistFailed, setPersistFailed] = useState(false); const [pending, setPending] = useState(false);
    const touched = useRef(false); const operation = useRef(false);
    const latest = useRef<{ step: number; draft: DetailedPlanDraft } | null>(null);
    const sequence = useRef<Promise<unknown>>(Promise.resolve());
    const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
        const next = sequence.current.then(work, work); sequence.current = next.catch(() => undefined); return next;
    }, []);
    const persist = useCallback(async () => {
        const entry = latest.current;
        if (!entry) { await sequence.current; return; }
        try {
            await enqueue(() => commitSettingsWrite([WIZARD_DRAFT_KEY], () => {
                if (!saveStudyPlanWizardDraft(entry.step, entry.draft)) throw new Error('Draft write failed');
            }));
            if (latest.current === entry) { latest.current = null; setPending(false); }
            setPersistFailed(false);
        } catch (error) { setPersistFailed(true); throw error; }
    }, [enqueue]);
    const showingStep = useCallback((next: number) => setStep(next), []);
    const result = useMemo(() => generateDetailedPlan(draft), [draft]);
    const finishLeaving = useCallback(() => {
        if (navigation.canGoBack()) navigation.goBack(); else router.replace('/study-plans');
    }, [navigation, router]);
    const canLeave = useCallback(async () => {
        try { await persist(); return true; } catch { return false; }
    }, [persist]);
    const onFirstStep = useCallback(() => step === 0, [step]);
    useUnsavedChangesGuard(!created && (pending || persistFailed), {
        title: l('Taslak kaydedilemeden çıkılsın mı?', 'Leave without saving the draft?'),
        message: l('Yerel depolamaya yazılamadığı için son değişiklikleriniz kaybolabilir.', 'The latest changes may be lost because local storage could not be written.'),
        browserBackLeaves: onFirstStep, beforeLeave: canLeave,
    });
    const update = useCallback((patch: Partial<DetailedPlanDraft>) => {
        if (operation.current || loaded.status === 'error') return;
        touched.current = true; setResumeStep(null);
        setDraft((current) => { const next = { ...current, ...patch }; latest.current = { step, draft: next }; return next; });
        setPending(true);
    }, [step, loaded.status]);
    useEffect(() => {
        if (!touched.current || created || loaded.status === 'error') return;
        latest.current = { step, draft }; setPending(true);
        const timer = setTimeout(() => { if (!operation.current) void persist().catch(() => undefined); }, 300);
        return () => clearTimeout(timer);
    }, [step, draft, created, loaded.status, persist]);
    useEffect(() => {
        const subscription = AppState?.addEventListener?.('change', (state) => {
            if (state !== 'active' && !operation.current) void persist().catch(() => undefined);
        });
        return () => { subscription?.remove(); if (!operation.current) void persist().catch(() => undefined); };
    }, [persist]);
    useEffect(() => {
        if (resumeTarget === null) return;
        if (step >= resumeTarget) { setResumeTarget(null); return; }
        router.push(`/study-plan-wizard/${STUDY_PLAN_WIZARD_STEPS[step + 1]}` as any);
    }, [step, resumeTarget, router]);
    useEffect(() => { if (created) finishLeaving(); }, [created, finishLeaving]);
    const retryRead = () => {
        const next = loadStudyPlanWizardDraft(today, Date.now(), { preserveCorrupt: true }); setLoaded(next);
        if (next.status === 'error') return;
        setDraft(next.status === 'restored' ? next.value.draft : defaultDetailedPlanDraft(today));
        setResumeStep(next.status === 'restored' ? next.value.step : null);
    };
    const reset = async () => {
        if (operation.current) return; operation.current = true; setBusy(true);
        try {
            await enqueue(() => commitSettingsWrite([WIZARD_DRAFT_KEY], () => { if (!clearStudyPlanWizardDraft()) throw new Error('Draft delete failed'); }));
            latest.current = null; touched.current = false; setPending(false); setPersistFailed(false);
            setResumeStep(null); setLoaded({ status: 'empty' }); setDraft(defaultDetailedPlanDraft(today));
            // Return through the wizard's own stack, retaining its parent and back gesture.
            router.dismissTo('/study-plan-wizard');
        } catch { setPersistFailed(true); }
        finally { operation.current = false; setBusy(false); }
    };
    const discard = () => confirm(l('Plan taslağı silinsin mi?', 'Discard the saved draft?'),
        l('Kaldığınız adım ve bilgiler silinir; yeni planla başlanır.', 'The saved step and entries will be cleared to start a new plan.'), () => { void reset(); }, { destructive: true });
    const create = async () => {
        if (operation.current || loaded.status === 'error') return;
        const fresh = generateDetailedPlan(draft); if (!fresh.ok) return;
        operation.current = true; setBusy(true);
        try {
            await enqueue(() => commitSettingsWrite([STUDY_PLANS_KEY, WIZARD_DRAFT_KEY], () => {
                saveStudyPlans(fresh.blocks); if (!clearStudyPlanWizardDraft()) throw new Error('Draft delete failed');
            }));
            latest.current = null; touched.current = false; setPending(false); setCreated(true);
            invalidateCollection({ keepsStudyQueue: true });
        } catch (error) {
            console.warn('[StudyPlanWizard] save failed:', error);
            alert(l('Plan kaydedilemedi', 'The plan could not be saved'), l('Planlarınız değiştirilmedi. Taslağınız korunuyor.', 'Your plans were not changed. Your draft is preserved.'));
            latest.current = { step, draft }; setPending(true); setPersistFailed(true);
        } finally { operation.current = false; setBusy(false); }
    };
    const value: Wizard = { draft, update, result, leave: finishLeaving, create, showingStep, busy,
        readFailed: loaded.status === 'error', persistFailed, resumeStep, discarded: loaded.status === 'discarded', retryRead,
        resume: () => { setResumeStep(null); touched.current = true; setResumeTarget(resumeStep); }, discard };
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
