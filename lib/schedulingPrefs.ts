// Per-surface defaults for Anki's Set Due Date and Forget dialogs. Anki keeps the reviewer's and
// the browser's values apart (rslib's StringKey/BoolKey config entries), so rescheduling from one
// surface never overwrites what the other offers next time.

import { getDbSetting, setDbSetting } from './storage';
import type { ForgetOptions } from './setDueDate';

export type SchedulingContext = 'reviewer' | 'browser';

const SET_DUE_DATE_KEYS: Record<SchedulingContext, string> = {
    reviewer: 'setDueDateReviewer',
    browser: 'setDueDateBrowser',
};

const RESTORE_POSITION_KEYS: Record<SchedulingContext, string> = {
    reviewer: 'restorePositionReviewer',
    browser: 'restorePositionBrowser',
};

const RESET_COUNTS_KEYS: Record<SchedulingContext, string> = {
    reviewer: 'resetCountsReviewer',
    browser: 'resetCountsBrowser',
};

/** The value the Set Due Date field opens with; empty until the user has set one here. */
export function getSetDueDateInput(context: SchedulingContext): string {
    return getDbSetting(SET_DUE_DATE_KEYS[context]) ?? '';
}

export function rememberSetDueDateInput(context: SchedulingContext, value: string): void {
    setDbSetting(SET_DUE_DATE_KEYS[context], value);
}

/** Anki starts both Forget options off and remembers whatever the user last confirmed. */
export function getForgetOptions(context: SchedulingContext): ForgetOptions {
    return {
        restorePosition: getDbSetting(RESTORE_POSITION_KEYS[context]) === 'true',
        resetCounts: getDbSetting(RESET_COUNTS_KEYS[context]) === 'true',
    };
}

export function rememberForgetOptions(context: SchedulingContext, options: ForgetOptions): void {
    setDbSetting(RESTORE_POSITION_KEYS[context], String(options.restorePosition));
    setDbSetting(RESET_COUNTS_KEYS[context], String(options.resetCounts));
}
