import { parseStoredSession, type StoredAccountSession } from './accountSession';

/*
 * The web build has no Keychain; the session sits in this origin's localStorage. The browser
 * preview is a regression target, not a release, so this only has to behave the same way.
 */

const SESSION_KEY = 'tusankim.account.session.v1';

function storage(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

export async function readStoredSession(): Promise<StoredAccountSession | null> {
    try {
        const raw = storage()?.getItem(SESSION_KEY);
        return raw ? parseStoredSession(raw) : null;
    } catch {
        return null;
    }
}

export async function writeStoredSession(session: StoredAccountSession): Promise<void> {
    const target = storage();
    if (!target) throw new Error('Browser storage is unavailable.');
    target.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
    try {
        storage()?.removeItem(SESSION_KEY);
    } catch {
        // Blocked storage holds nothing to clear.
    }
}
