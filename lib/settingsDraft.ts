import { stableSnapshot } from './dirtyState';
import type { AppSettings } from './types';

/**
 * The Settings draft moved onto settings that changed in storage after the draft was taken.
 *
 * Settings keeps one draft from the moment it opens, and its Save writes every field back,
 * including the default preset's fields. A backup restored or a collection package imported from
 * a screen opened over Settings changes those rows underneath it; saving the draft as it was would
 * write the old values back over them. Here the learner's own edits (fields where the draft
 * differs from what it started from) win, and every other field comes from `latest`.
 */
export function rebaseSettingsDraft(baseline: AppSettings, draft: AppSettings, latest: AppSettings): AppSettings {
    const rebased: Record<string, unknown> = { ...latest };
    const before = baseline as unknown as Record<string, unknown>;
    const after = draft as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (stableSnapshot(after[key]) !== stableSnapshot(before[key])) rebased[key] = after[key];
    }
    return rebased as unknown as AppSettings;
}
