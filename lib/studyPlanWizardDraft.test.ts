/**
 * Detailed Study Plan wizard draft persistence tests:
 * - Preserves step, target exam, dates, course order/hours/pass/proficiency, weekly capacities
 *   and day overrides across sessions (iOS relaunch / web reload).
 * - Never writes incomplete drafts into real study plans (`tus_study_plans_v1`).
 * - Clears the draft once the plan is created.
 * - Handles corrupt, wrong-version, expired (>30d) and past-deadline drafts recoverably.
 */

import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import { loadStudyPlans, saveStudyPlans } from './studyPlanStore';
import {
    WIZARD_DRAFT_KEY,
    WIZARD_DRAFT_MAX_AGE_MS,
    clearStudyPlanWizardDraft,
    loadStudyPlanWizardDraft,
    parseStudyPlanWizardDraft,
    saveStudyPlanWizardDraft,
    serializeStudyPlanWizardDraft,
} from './studyPlanWizardDraft';
import { defaultDetailedPlanDraft, emptyStudyPlan, generateDetailedPlan } from './studyPlans';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => db.close());

const TODAY = '2026-11-19';
const NOW = new Date(2026, 10, 19, 12, 0).getTime();

describe('study plan wizard draft persistence', () => {
    it('persists step 2 with customized courses and capacities and restores cleanly on reopen', () => {
        const base = defaultDetailedPlanDraft(TODAY);
        const reordered = [base.courses[1], base.courses[0], ...base.courses.slice(2)];
        reordered[0] = { ...reordered[0], pass: 3, proficiency: 8, hours: 35 };
        const draft = {
            ...base,
            targetExam: '2027 TUS 1. Dönem',
            deadlineYmd: '2027-03-01',
            courses: reordered,
            weeklyMinutes: [240, 480, 480, 480, 480, 420, 300],
            dayOverrides: { '2026-11-25': 120 },
        };

        expect(saveStudyPlanWizardDraft(1, draft, NOW)).toBe(true);

        // Incomplete draft must NOT write to real study plans.
        expect(loadStudyPlans()).toEqual([]);

        // Reopen in a fresh session (same DB on iOS / IndexedDB-restored DB on web).
        const loaded = loadStudyPlanWizardDraft(TODAY, NOW + 60_000);
        expect(loaded.status).toBe('restored');
        if (loaded.status !== 'restored') throw new Error('expected restored draft');
        expect(loaded.value.step).toBe(1);
        expect(loaded.value.draft).toEqual(draft);
    });

    it('clears the draft after a plan is created without touching existing or created plans', () => {
        const existing = emptyStudyPlan(TODAY, 'existing-1');
        saveStudyPlans([existing]);

        const draft = {
            ...defaultDetailedPlanDraft(TODAY),
            courses: [{ subject: 'Anatomi', pass: 2, proficiency: 7, hours: 8 }],
            deadlineYmd: '2026-12-01',
        };
        expect(saveStudyPlanWizardDraft(2, draft, NOW)).toBe(true);
        expect(loadStudyPlans()).toEqual([existing]);

        // Generate and save real plan, then clear draft.
        const generated = generateDetailedPlan(draft);
        expect(generated.ok).toBe(true);
        if (!generated.ok) throw new Error(generated.problem);
        saveStudyPlans(generated.blocks);
        expect(clearStudyPlanWizardDraft()).toBe(true);

        expect(loadStudyPlanWizardDraft(TODAY, NOW + 5_000)).toEqual({ status: 'empty' });
        expect(loadStudyPlans().length).toBe(1 + generated.blocks.length);
    });

    it('discards corrupt JSON and structural corruption recoverably and cleans up storage', () => {
        const corruptPayloads = [
            '{not valid json',
            '[]',
            JSON.stringify({ version: 1, step: 99, updatedAtMs: NOW, draft: defaultDetailedPlanDraft(TODAY) }),
            JSON.stringify({ version: 1, step: 1, updatedAtMs: NOW, draft: { ...defaultDetailedPlanDraft(TODAY), startYmd: '2026-02-31' } }),
            JSON.stringify({ version: 1, step: 1, updatedAtMs: NOW, draft: { ...defaultDetailedPlanDraft(TODAY), courses: [] } }),
            JSON.stringify({
                version: 1,
                step: 1,
                updatedAtMs: NOW,
                draft: {
                    ...defaultDetailedPlanDraft(TODAY),
                    courses: [
                        { subject: 'Anatomi', pass: 1, proficiency: 5, hours: 10 },
                        { subject: 'anatomi', pass: 2, proficiency: 6, hours: 12 },
                    ],
                },
            }),
            JSON.stringify({ version: 1, step: 1, updatedAtMs: NOW, draft: { ...defaultDetailedPlanDraft(TODAY), weeklyMinutes: [480, 480] } }),
            JSON.stringify({ version: 1, step: 1, updatedAtMs: NOW, draft: { ...defaultDetailedPlanDraft(TODAY), dayOverrides: { 'bad-date': 60 } } }),
        ];

        for (const payload of corruptPayloads) {
            db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', WIZARD_DRAFT_KEY, payload);
            const first = loadStudyPlanWizardDraft(TODAY, NOW);
            expect(first).toEqual({ status: 'discarded', reason: 'corrupt' });
            // Storage was cleaned up so the next visit starts clean without repeating the notice.
            expect(loadStudyPlanWizardDraft(TODAY, NOW)).toEqual({ status: 'empty' });
        }
    });

    it('discards unknown schema versions and stale or past-deadline drafts recoverably', () => {
        const draft = defaultDetailedPlanDraft(TODAY);

        // Unknown schema version.
        const wrongVersion = JSON.stringify({ version: 2, step: 1, draft, updatedAtMs: NOW });
        expect(parseStudyPlanWizardDraft(wrongVersion, TODAY, NOW)).toEqual({ status: 'discarded', reason: 'version' });

        // Draft older than 30 days.
        const oldSerialized = serializeStudyPlanWizardDraft(1, draft, NOW - WIZARD_DRAFT_MAX_AGE_MS - 1_000);
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', WIZARD_DRAFT_KEY, oldSerialized);
        expect(loadStudyPlanWizardDraft(TODAY, NOW)).toEqual({ status: 'discarded', reason: 'stale' });
        expect(loadStudyPlanWizardDraft(TODAY, NOW)).toEqual({ status: 'empty' });

        // Draft whose target deadline has already passed.
        const expiredDeadline = { ...draft, startYmd: '2026-10-01', deadlineYmd: '2026-11-18' };
        const expiredSerialized = serializeStudyPlanWizardDraft(2, expiredDeadline, NOW - 60_000);
        expect(parseStudyPlanWizardDraft(expiredSerialized, TODAY, NOW)).toEqual({ status: 'discarded', reason: 'stale' });
    });

    it('reports write failure cleanly without crashing when storage cannot be written', () => {
        const original = dbHolder.db;
        dbHolder.db = {
            runSync: () => { throw new Error('readonly database'); },
            getFirstSync: () => { throw new Error('readonly database'); },
        };
        try {
            expect(saveStudyPlanWizardDraft(1, defaultDetailedPlanDraft(TODAY), NOW)).toBe(false);
            expect(loadStudyPlanWizardDraft(TODAY, NOW)).toEqual({ status: 'error' });
            expect(clearStudyPlanWizardDraft()).toBe(false);
        } finally {
            dbHolder.db = original;
        }
    });

    it('does not announce an invalid draft as discarded when its removal failed', () => {
        const original = dbHolder.db;
        dbHolder.db = {
            getFirstSync: () => ({ value: '{broken' }),
            runSync: () => { throw new Error('readonly database'); },
        };
        try {
            expect(loadStudyPlanWizardDraft(TODAY, NOW)).toEqual({ status: 'error' });
        } finally {
            dbHolder.db = original;
        }
    });
});
