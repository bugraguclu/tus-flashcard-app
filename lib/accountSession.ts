import type {
    AccountCodeSent,
    AccountEvent,
    AccountEventType,
    AccountServiceConfig,
    AccountSessionGrant,
    AccountUser,
} from './accountContract';
import { NAME_MAX_LENGTH } from './accountContract';

/*
 * Pure checks for everything that crosses the device boundary: server replies and the session
 * kept in the Keychain. A reply that does not have the expected shape is treated as no reply, so
 * a broken or hostile server can never leave half a user in the app.
 */

export interface StoredAccountSession {
    token: string;
    user: AccountUser;
    expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): string | null {
    return typeof value === 'string' && value.length <= max ? value : null;
}

export function parseUser(value: unknown): AccountUser | null {
    if (!isRecord(value)) return null;
    const id = boundedString(value.id, 64);
    const name = boundedString(value.name, 400);
    const email = boundedString(value.email, 320);
    const createdAt = boundedString(value.createdAt, 40);
    if (!id || name === null || !email || !createdAt || typeof value.emailVerified !== 'boolean') return null;
    return {
        id,
        name,
        email,
        emailVerified: value.emailVerified,
        createdAt,
        // Servers from before Google sign-in send neither: every such account has a password.
        hasPassword: value.hasPassword !== false,
        google: value.google === true,
        apple: value.apple === true,
    };
}

export function parseGrant(value: unknown): AccountSessionGrant | null {
    if (!isRecord(value)) return null;
    const user = parseUser(value.user);
    const token = boundedString(value.token, 256);
    const expiresAt = boundedString(value.expiresAt, 40);
    if (!user || !token || !expiresAt) return null;
    return { user, token, expiresAt };
}

export function parseServiceConfig(value: unknown): AccountServiceConfig | null {
    if (!isRecord(value)) return null;
    const flags = ['registrationOpen', 'emailReady', 'emailVerificationRequired'] as const;
    if (flags.some((flag) => typeof value[flag] !== 'boolean')) return null;
    return {
        registrationOpen: value.registrationOpen as boolean,
        emailReady: value.emailReady as boolean,
        emailVerificationRequired: value.emailVerificationRequired as boolean,
        googleSignIn: value.googleSignIn === true,
        appleSignIn: value.appleSignIn === true,
        policyVersion: boundedString(value.policyVersion, 40) ?? '',
        operatorName: boundedString(value.operatorName, 200) ?? '',
        contactEmail: boundedString(value.contactEmail, 320) ?? '',
        sync: value.sync === true,
    };
}

export function parseCodeSent(value: unknown): AccountCodeSent | null {
    if (!isRecord(value) || typeof value.sent !== 'boolean') return null;
    const retryAfter = typeof value.retryAfter === 'number' && Number.isFinite(value.retryAfter)
        ? Math.max(0, Math.round(value.retryAfter))
        : 0;
    return { sent: value.sent, retryAfter };
}

const EVENT_TYPES = new Set<AccountEventType>([
    'account_created',
    'signed_in',
    'signed_out',
    'email_verified',
    'password_reset',
    'password_changed',
    'name_changed',
]);

export function parseEvents(value: unknown): AccountEvent[] {
    if (!isRecord(value) || !Array.isArray(value.events)) return [];
    return value.events.flatMap((event): AccountEvent[] => {
        if (!isRecord(event)) return [];
        const createdAt = boundedString(event.createdAt, 40);
        return createdAt && EVENT_TYPES.has(event.type as AccountEventType)
            ? [{ type: event.type as AccountEventType, createdAt }]
            : [];
    });
}

export function parseStoredSession(raw: string): StoredAccountSession | null {
    try {
        const grant = parseGrant(JSON.parse(raw));
        return grant ? { token: grant.token, user: grant.user, expiresAt: grant.expiresAt } : null;
    } catch {
        return null;
    }
}

/** Two letters for the avatar: initials of the first and last name, else the address. */
export function accountInitials(user: Pick<AccountUser, 'name' | 'email'>): string {
    const words = user.name.trim().split(/\s+/).filter(Boolean);
    const letters = words.length >= 2
        ? [words[0], words[words.length - 1]].map((word) => Array.from(word)[0] ?? '')
        : Array.from(words[0] ?? user.email).slice(0, words.length === 1 ? 1 : 2);
    return letters.join('').toLocaleUpperCase('tr-TR') || '?';
}

// --- First run -------------------------------------------------------------------------------

/** Settings-table keys (lib/dbSettings) that remember the account screen's own state. */
/**
 * The name a new account starts with, so sign-up asks only for an address and a password: the
 * address's local part as words (`ayse.yilmaz` → `Ayse Yilmaz`). The learner can change it on the
 * account page. Never empty and never longer than the server accepts.
 */
export function nameFromEmail(email: string): string {
    const local = email.trim().split('@')[0] ?? '';
    const words = local
        .split(/[._+\-\s]+/)
        .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1));
    const name = words.join(' ').slice(0, NAME_MAX_LENGTH).trim();
    return name || 'TusAnkiM';
}

export const ACCOUNT_PROMPT_RESOLVED_KEY = 'account_prompt_resolved_v1';
export const ACCOUNT_INSTALL_MARKER_KEY = 'account_install_marker_v1';

/**
 * The welcome sign-in screen comes up once, on a collection that has nothing in it yet. Someone
 * who already studies here is never stopped on the way to their decks; they find the account at
 * the top of Settings instead.
 */
export function shouldOfferFirstRunPrompt(state: {
    enabled: boolean;
    signedIn: boolean;
    promptResolved: boolean;
    collectionHasNotes: boolean;
}): boolean {
    return state.enabled && !state.signedIn && !state.promptResolved && !state.collectionHasNotes;
}
