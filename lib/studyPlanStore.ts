/**
 * Storage for "Çalışma Planlama": the learner's plans, kept as one key of the SQLite settings
 * table and carried by backups (`studyPlans`). The plans themselves are `studyPlans.ts`.
 */

import { getDB } from './db';
import { getDbSetting } from './dbSettings';
import { normalizeStudyPlans, studyPlanProblem, type StudyPlanBlock } from './studyPlans';

const PLANS_KEY = 'tus_study_plans_v1';

/**
 * Every stored plan. Throws when the stored list cannot be read, so a save never replaces plans
 * it could not see.
 */
export function loadStudyPlans(): StudyPlanBlock[] {
    const raw = getDbSetting(PLANS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Çalışma planları okunamadı.');
    return normalizeStudyPlans(parsed);
}

/** Plans for screens that only show them: an unreadable list shows none. */
export function readStudyPlansForDisplay(): StudyPlanBlock[] {
    try {
        return loadStudyPlans();
    } catch (error) {
        console.warn('[StudyPlans] read failed:', error);
        return [];
    }
}

function writePlans(plans: readonly StudyPlanBlock[]): void {
    getDB().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', PLANS_KEY, JSON.stringify(plans));
}

/** Add plans, or replace the stored ones with the same ids. Every plan must be valid. */
export function saveStudyPlans(plans: readonly StudyPlanBlock[]): StudyPlanBlock[] {
    const ids = new Set(plans.map((plan) => plan.id));
    if (ids.size !== plans.length) throw new Error('Aynı plan iki kez kaydedilemez.');
    for (const plan of plans) {
        if (studyPlanProblem(plan) !== null) throw new Error('Geçersiz çalışma planı.');
    }
    const next = [...loadStudyPlans().filter((plan) => !ids.has(plan.id)), ...plans];
    writePlans(next);
    return next;
}

/** Remove plans by id; plans of a detailed plan can go together by their group. */
export function removeStudyPlans(ids: readonly string[]): StudyPlanBlock[] {
    const removing = new Set(ids);
    const next = loadStudyPlans().filter((plan) => !removing.has(plan.id));
    writePlans(next);
    return next;
}

// --- Backup ---

export function readStudyPlansForBackup(): StudyPlanBlock[] {
    return readStudyPlansForDisplay();
}

/** Replace every plan with a backup's. Runs inside the restore's own transaction. */
export function replaceStudyPlans(raw: unknown): void {
    writePlans(normalizeStudyPlans(raw));
}
