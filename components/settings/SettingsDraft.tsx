import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppSettingsActions, useCollectionInvalidation } from '../../contexts/AppContext';
import { useI18n } from '../../hooks/useI18n';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { alert, confirmAsync } from '../../lib/confirm';
import { hasSnapshotChanged, stableSnapshot } from '../../lib/dirtyState';
import { canGradeRevealedCard } from '../../lib/reviewerTouchControls';
import { rebaseSettingsDraft } from '../../lib/settingsDraft';
import { DEFAULT_SETTINGS, loadSettings, saveSettingsDurably } from '../../lib/storage';
import type { AppSettings } from '../../lib/types';

export function settingsMatch(actual: AppSettings, expected: AppSettings): boolean {
    return stableSnapshot(actual) === stableSnapshot(expected);
}

export interface SettingsDraft {
    /** The learner's edits, applied app-wide as a preview and stored only on Save. */
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    updateSettings: (patch: Partial<AppSettings>) => void;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    /** Takes `persisted` as both the draft's stored baseline and, through `setSettings`, its value. */
    markSaved: (persisted: AppSettings) => void;
    loading: boolean;
    saving: boolean;
    isDirty: boolean;
    /** The brief "Saved" confirmation, cleared by any edit made while it shows. */
    showSaved: boolean;
    showSavedState: () => void;
    save: () => Promise<void>;
    /** Each page calls this as it is shown: the category, or null for the list. */
    showingPage: (section: string | null) => void;
}

const SettingsDraftContext = createContext<SettingsDraft | null>(null);

export function useSettingsDraft(): SettingsDraft {
    const draft = useContext(SettingsDraftContext);
    if (!draft) throw new Error('useSettingsDraft must be used inside SettingsDraftProvider');
    return draft;
}

/**
 * One Settings draft for every page of Settings. The category list and each category page are
 * screens of their own, so the back swipe on a page returns to the list; the draft lives above
 * them and survives that, and only leaving Settings with unsaved edits asks first.
 *
 * Each page reports itself as it is shown, so browser Back from a category page goes to the list
 * instead of asking about leaving Settings; only Back from the list asks.
 */
export function SettingsDraftProvider({ children }: { children: React.ReactNode }) {
    const { refreshSettings: refreshData, previewSettings } = useAppSettingsActions();
    const { markSchedulingStale } = useCollectionInvalidation();
    const { l } = useI18n();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    // The stored settings the draft started from; savedSnapshot is the same value serialized.
    const baselineRef = useRef<AppSettings | null>(null);
    const shownPageRef = useRef<string | null>(null);
    const showingPage = useCallback((section: string | null) => { shownPageRef.current = section; }, []);
    const onList = useCallback(() => shownPageRef.current === null, []);

    const markSaved = useCallback((persisted: AppSettings) => {
        baselineRef.current = persisted;
        setSavedSnapshot(stableSnapshot(persisted));
    }, []);

    const isDirty = hasSnapshotChanged(savedSnapshot, settings);
    // The confirmation lingers briefly after a save, but an edit made meanwhile is not saved.
    const showSaved = saved && !isDirty;
    useUnsavedChangesGuard(isDirty, {
        title: l('Kaydedilmemiş değişiklikler', 'Unsaved changes'),
        message: l(
            'Ayarlarınız kaydedilmedi. Çıkarsanız değişiklikler kaybolacak.',
            'Your settings have not been saved. They will be lost if you leave.',
        ),
        browserBackLeaves: onList,
    });

    useEffect(() => {
        const loaded = loadSettings();
        setSettings(loaded);
        markSaved(loaded);
        setLoading(false);
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, [markSaved]);

    // Backups (restore) and Import (a collection package) open over Settings and rewrite the
    // settings rows. When Settings is shown again its draft moves onto them, keeping only the
    // learner's own edits, so a later Save cannot write the old values back.
    useFocusEffect(useCallback(() => {
        const baseline = baselineRef.current;
        if (!baseline) return;
        const latest = loadSettings();
        if (settingsMatch(latest, baseline)) return;
        setSettings((draft) => rebaseSettingsDraft(baseline, draft, latest));
        markSaved(latest);
    }, [markSaved]));

    // Keep the whole app in sync with the draft, while device storage remains untouched until Save.
    useEffect(() => {
        if (!loading) previewSettings(settings);
    }, [loading, previewSettings, settings]);

    // A discarded draft must not remain active in screens that stay mounted behind Settings.
    useEffect(() => () => refreshData(), [refreshData]);

    const showSavedState = useCallback(() => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 1400);
    }, []);

    const updateSettings = useCallback((patch: Partial<AppSettings>) => {
        setSettings((prev) => ({ ...prev, ...patch }));
    }, []);

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    }, []);

    const savingRef = useRef(false);
    const save = useCallback(async () => {
        if (savingRef.current) return;
        Keyboard.dismiss();
        let current = settingsRef.current;
        savingRef.current = true;
        setSaving(true);
        try {
            // A tap zone or swipe direction set to another action can leave a hidden answer bar with
            // nothing that grades; Controls warns about it, and Save never stores it.
            if (!canGradeRevealedCard(current)) {
                const showButtons = await confirmAsync(
                    l('Kartları yanıtlamanın bir yolu kalmadı', 'No way left to answer cards'),
                    l(
                        'Yanıt düğmeleri gizli ve etkin hiçbir dokunma bölgesi veya kaydırma yönü Tekrar, Zor, İyi ya da Kolay uygulamıyor. Yanıt düğmeleri geri açılarak kaydedilsin mi?',
                        'The answer buttons are hidden and no enabled tap zone or swipe direction answers Again, Hard, Good, or Easy. Save with the answer buttons shown again?',
                    ),
                    { confirmLabel: l('Düğmeleri aç ve kaydet', 'Show buttons and save') },
                );
                if (!showButtons) return;
                current = { ...current, showAnswerButtons: true };
                setSettings((draft) => ({ ...draft, showAnswerButtons: true }));
            }
            const baseline = baselineRef.current ?? current;
            // Fields this draft did not touch are taken as stored now, not as they were when it opened.
            const result = await saveSettingsDurably(rebaseSettingsDraft(baseline, current, loadSettings()));
            const persisted = loadSettings();
            if (!result.ok || !settingsMatch(persisted, result.settings)) {
                setSaved(false);
                alert(
                    l('Ayarlar kaydedilemedi', 'Settings Not Saved'),
                    l('Değişiklik cihaz depolamasına kaydedilemedi. Lütfen yeniden deneyin.', 'The change could not be saved to device storage. Please try again.'),
                );
                return;
            }
            // Preserve edits made while the durable write was pending.
            setSettings((draft) => {
                const next = rebaseSettingsDraft(current, draft, persisted);
                return settingsMatch(draft, next) ? draft : next;
            });
            markSaved(persisted);
            refreshData();

            if (
                baseline.dayRolloverHour !== persisted.dayRolloverHour
                || baseline.learnAheadMinutes !== persisted.learnAheadMinutes
            ) {
                markSchedulingStale();
            }

            showSavedState();
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [l, markSaved, markSchedulingStale, refreshData, showSavedState]);

    const value = useMemo<SettingsDraft>(() => ({
        settings,
        setSettings,
        updateSettings,
        updateSetting,
        markSaved,
        loading,
        saving,
        isDirty,
        showSaved,
        showSavedState,
        save,
        showingPage,
    }), [settings, updateSettings, updateSetting, markSaved, loading, saving, isDirty, showSaved, showSavedState, save, showingPage]);

    return <SettingsDraftContext.Provider value={value}>{children}</SettingsDraftContext.Provider>;
}
