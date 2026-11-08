import * as SecureStore from 'expo-secure-store';
import { parseStoredSession, type StoredAccountSession } from './accountSession';

/*
 * The signed-in session lives in the iOS Keychain, never in the collection database: a backup or
 * an exported collection must not carry a key to the learner's account. THIS_DEVICE_ONLY keeps it
 * out of device-to-device migration, so a new phone signs in afresh. The web build keeps it in
 * localStorage (accountVault.web.ts).
 */

const SESSION_KEY = 'tusankim.account.session.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function readStoredSession(): Promise<StoredAccountSession | null> {
    try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
        return raw ? parseStoredSession(raw) : null;
    } catch (error) {
        console.warn('[Account] could not read the stored session:', error);
        return null;
    }
}

export async function writeStoredSession(session: StoredAccountSession): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), OPTIONS);
}

export async function clearStoredSession(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
    } catch (error) {
        console.warn('[Account] could not clear the stored session:', error);
    }
}
