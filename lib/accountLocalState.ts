import { getDB } from './db';
import { getDbSetting, setDbSetting } from './dbSettings';
import { ACCOUNT_INSTALL_MARKER_KEY, ACCOUNT_PROMPT_RESOLVED_KEY } from './accountSession';
import { STARTER_DEMO_TAG } from './starterDemoDecks';

/*
 * The account's own bookkeeping in the collection's settings table. Only flags live here; the
 * session itself is in the Keychain (accountVault), which an exported collection never carries.
 */

/**
 * True on the first launch of this installation. Keychain items survive deleting the app, but the
 * collection database does not, so a missing marker means a reinstall that must start signed out.
 */
export function isFirstLaunchSinceInstall(): boolean {
    return getDbSetting(ACCOUNT_INSTALL_MARKER_KEY) !== '1';
}

export function markInstallSeen(): void {
    setDbSetting(ACCOUNT_INSTALL_MARKER_KEY, '1');
}

export function isAccountPromptResolved(): boolean {
    return getDbSetting(ACCOUNT_PROMPT_RESOLVED_KEY) === '1';
}

export function markAccountPromptResolved(): void {
    setDbSetting(ACCOUNT_PROMPT_RESOLVED_KEY, '1');
}

/** Whether the learner already has anything of their own here. When unsure, assume they do. */
export function collectionHasNotes(): boolean {
    try {
        // First-run starter demo cards carry the `tus-deneme` tag; they shouldn't hide the
        // one-time welcome page on a brand-new installation.
        const row = getDB().getFirstSync<{ found: number }>(
            'SELECT EXISTS(SELECT 1 FROM notes WHERE tags != ?) AS found',
            ` ${STARTER_DEMO_TAG} `,
        );
        return Boolean(row?.found);
    } catch {
        return true;
    }
}
