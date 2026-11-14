import type { TranslationKey } from './i18n';

/**
 * Why startup has not reached the deck list: still running after its 30-second budget, or failed.
 * Owned here so the startup hook and the screen that explains it share one definition.
 */
export type StartupIssue = 'timeout' | 'failed';

/**
 * The one way on each state offers. A timed-out start is a migration still writing to the
 * collection, which opens the app by itself when it ends, so starting again would only race it:
 * its way on is to keep waiting. A failed start can be tried again. (A restore from backup is
 * deliberately not offered here.)
 */
export type StartupIssueAction = 'keepWaiting' | 'retry';

export interface StartupIssueView {
    title: string;
    message: string;
    action: StartupIssueAction;
    actionLabel: string;
}

type Translate = (key: TranslationKey) => string;

/**
 * The copy and the action for a startup issue (help.shell.startupError in the in-app guide). The
 * failed text does not point at Settings › About › Support: this screen stands in for the app's
 * navigation, so Settings cannot be reached from it.
 */
export function startupIssueView(issue: StartupIssue, t: Translate): StartupIssueView {
    if (issue === 'timeout') {
        return {
            title: t('root.startupSlowTitle'),
            message: t('root.startupSlowMessage'),
            action: 'keepWaiting',
            actionLabel: t('root.startupKeepWaiting'),
        };
    }
    return {
        title: t('root.errorTitle'),
        message: t('root.startupErrorMessage'),
        action: 'retry',
        actionLabel: t('common.retry'),
    };
}
