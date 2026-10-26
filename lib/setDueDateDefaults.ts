import { getDbSetting, setDbSetting } from './dbSettings';

/**
 * The text Anki's Set Due Date dialog opens with: whatever was last applied from the same place,
 * kept apart for the browser and the reviewer (`Config.String.SET_DUE_BROWSER` / `SET_DUE_REVIEWER`),
 * and empty before the first use.
 */
export type SetDueDateContext = 'browser' | 'reviewer';

const KEYS: Record<SetDueDateContext, string> = {
    browser: 'set_due_browser',
    reviewer: 'set_due_reviewer',
};

export function getSetDueDateDefault(context: SetDueDateContext): string {
    return getDbSetting(KEYS[context]) ?? '';
}

export function rememberSetDueDateInput(context: SetDueDateContext, input: string): void {
    setDbSetting(KEYS[context], input.trim());
}
