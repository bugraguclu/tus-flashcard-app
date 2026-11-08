/**
 * The account contract the app and the account server (`server/account`) share: limits, the
 * validation both sides run, error codes and the shapes on the wire. Keep it free of imports and
 * of non-erasable TypeScript (enums, namespaces): the server runs it under Node's own type
 * stripping and the app bundles it with Metro.
 */

/** The terms and privacy text a new account accepts; the server records it with the account. */
export const ACCOUNT_POLICY_VERSION = '2026-11-08';

export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const CODE_LENGTH = 6;
/** How long an e-mailed code stays valid. */
export const CODE_TTL_MINUTES = 15;
/** How soon another code may be sent to the same address. */
export const CODE_RESEND_SECONDS = 60;
/** Wrong guesses one code survives before it is withdrawn. */
export const CODE_MAX_ATTEMPTS = 5;

export type AccountLocale = 'tr' | 'en';

export type AccountFieldName = 'name' | 'email' | 'password' | 'currentPassword' | 'code' | 'consent';

export type AccountFieldIssue =
    | 'required'
    | 'too_long'
    | 'email_invalid'
    | 'password_too_short'
    | 'password_too_long'
    | 'password_common'
    | 'password_personal'
    | 'password_wrong'
    | 'code_invalid'
    | 'consent_required';

export type AccountFieldIssues = Partial<Record<AccountFieldName, AccountFieldIssue>>;

/** Server error codes, plus the three the app raises itself before or instead of a response. */
export type AccountErrorCode =
    | 'invalid_input'
    | 'invalid_credentials'
    | 'email_taken'
    | 'registration_closed'
    | 'unverified'
    | 'email_unavailable'
    | 'code_invalid'
    | 'code_expired'
    | 'wrong_password'
    | 'unauthorized'
    | 'rate_limited'
    | 'not_found'
    | 'payload_too_large'
    | 'server_error'
    | 'offline'
    | 'timeout'
    | 'not_configured';

export interface AccountUser {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
}

/** What the server tells a signed-out app about itself, so screens offer only what works. */
export interface AccountServiceConfig {
    registrationOpen: boolean;
    /** Codes can be e-mailed (verification and password reset). */
    emailReady: boolean;
    emailVerificationRequired: boolean;
    policyVersion: string;
    operatorName: string;
    contactEmail: string;
}

export interface AccountSessionGrant {
    user: AccountUser;
    token: string;
    expiresAt: string;
}

export interface AccountSessionInfo {
    config: AccountServiceConfig;
    user: AccountUser | null;
}

/** Registration either signs the learner in or, when the server demands it, asks for the code. */
export type AccountRegisterResult =
    | (AccountSessionGrant & { verificationSent: boolean })
    | { verificationRequired: true; email: string };

export interface AccountCodeSent {
    sent: boolean;
    /** Seconds before another code may be requested. */
    retryAfter: number;
}

export type AccountEventType =
    | 'account_created'
    | 'signed_in'
    | 'signed_out'
    | 'email_verified'
    | 'password_reset'
    | 'password_changed'
    | 'name_changed';

export interface AccountEvent {
    type: AccountEventType;
    createdAt: string;
}

export interface AccountErrorBody {
    error: {
        code: AccountErrorCode;
        message: string;
        fields?: AccountFieldIssues;
        retryAfter?: number;
        email?: string;
    };
}

// --- Normalisation -------------------------------------------------------------------------

/**
 * The address as the server stores it. `'İ'.toLowerCase()` is `i` plus a combining dot, so the
 * Turkish capital is folded to a plain `i` first; an address typed on a Turkish keyboard still
 * matches the one it was registered with.
 */
export function normalizeEmail(value: string): string {
    return value.normalize('NFC').trim().replace(/İ/g, 'i').toLowerCase();
}

/** Collapses runs of whitespace; a name is shown on one line. */
export function normalizeName(value: string): string {
    return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Digits only: a pasted `482 913` or `482-913` is the same code. */
export function normalizeCode(value: string): string {
    return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/** Length in characters as a person counts them, not UTF-16 units. */
export function characterCount(value: string): number {
    return Array.from(value).length;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(value: string): boolean {
    const email = normalizeEmail(value);
    return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

export function isValidCode(value: string): boolean {
    return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value);
}

// --- Passwords ------------------------------------------------------------------------------

/**
 * Passwords seen at the top of public breach lists, plus the Turkish ones learners reach for.
 * The list is short on purpose: it stops the guesses an attacker tries first, and the length
 * rule does the rest.
 */
const COMMON_PASSWORDS = new Set([
    '12345678', '123456789', '1234567890', '0123456789', '87654321', '11111111', '00000000',
    '12341234', '11223344', '12121212', '123123123', '1q2w3e4r', '1q2w3e4r5t', 'q1w2e3r4',
    'qwertyui', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'asdasdasd', 'zxcvbnm1', 'password',
    'password1', 'password123', 'passw0rd', 'iloveyou', 'sunshine', 'princess', 'football',
    'baseball', 'welcome1', 'abc12345', 'abcd1234', 'aa123456', 'monkey123', 'dragon12',
    'letmein1', 'trustno1', 'superman', 'whatever', 'sifre123', 'sifre1234', 'parola123',
    'galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'turkiye1', 'istanbul',
    'ankara06', 'izmir35', 'tusankim', 'tus2026', 'tus2027', 'tushazirlik', 'doktor123',
    'hekim123', 'anki1234',
]);

/** Folds case and Turkish letters so `Şifre123` and `sifre123` count as the same guess. */
function foldForComparison(value: string): string {
    return value
        .normalize('NFC')
        .replace(/[İIı]/g, 'i')
        .toLowerCase()
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

function isTrivialPattern(folded: string): boolean {
    const characters = Array.from(folded);
    if (new Set(characters).size <= 2) return true;
    const codes = characters.map((character) => character.codePointAt(0) ?? 0);
    const steps = new Set(codes.slice(1).map((code, index) => code - codes[index]));
    // 12345678, abcdefgh, 98765432: a single repeated step is a sequence, not a password.
    return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

function isCommonPassword(password: string): boolean {
    const folded = foldForComparison(password);
    return COMMON_PASSWORDS.has(folded) || isTrivialPattern(folded);
}

export interface PasswordContext {
    email?: string;
    name?: string;
}

/** The first rule a new password breaks, or null when it may be used. */
export function passwordIssue(password: string, context: PasswordContext = {}): AccountFieldIssue | null {
    if (!password) return 'required';
    const length = characterCount(password);
    if (length < PASSWORD_MIN_LENGTH) return 'password_too_short';
    if (length > PASSWORD_MAX_LENGTH) return 'password_too_long';
    if (isCommonPassword(password)) return 'password_common';
    return isMostlyPersonal(password, context) ? 'password_personal' : null;
}

/**
 * The address or a name with at most four characters around it (`ayse1990`, `2026yilmaz`) is the
 * first thing someone who knows the learner would try. A longer password that merely contains
 * them is left alone.
 */
function isMostlyPersonal(password: string, context: PasswordContext): boolean {
    const folded = foldForComparison(password);
    const length = characterCount(folded);
    const tokens = [
        normalizeEmail(context.email ?? '').split('@')[0] ?? '',
        ...normalizeName(context.name ?? '').split(' '),
    ]
        .map(foldForComparison)
        .filter((token) => characterCount(token) >= 4);
    return tokens.some((token) => folded.includes(token) && length - characterCount(token) <= 4);
}

/**
 * 0 = nothing typed, 1 = weak (refused), 2 = fair, 3 = good, 4 = strong. Only a guide for the
 * meter; `passwordIssue` decides what is accepted.
 */
export function passwordStrength(password: string, context: PasswordContext = {}): 0 | 1 | 2 | 3 | 4 {
    if (!password) return 0;
    if (passwordIssue(password, context)) return 1;
    const length = characterCount(password);
    const classes = [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/]
        .filter((pattern) => pattern.test(password)).length;
    let score = 2;
    if (length >= 12) score += 1;
    if (classes >= 3 || length >= 16) score += 1;
    return Math.min(score, 4) as 2 | 3 | 4;
}

// --- Form validation ------------------------------------------------------------------------

function emailIssue(email: string): AccountFieldIssue | undefined {
    if (!email.trim()) return 'required';
    return isValidEmail(email) ? undefined : 'email_invalid';
}

function compact(issues: AccountFieldIssues): AccountFieldIssues {
    const result: AccountFieldIssues = {};
    for (const [field, issue] of Object.entries(issues) as Array<[AccountFieldName, AccountFieldIssue | undefined]>) {
        if (issue) result[field] = issue;
    }
    return result;
}

export function validateSignIn(input: { email: string; password: string }): AccountFieldIssues {
    return compact({
        email: emailIssue(input.email),
        password: input.password ? undefined : 'required',
    });
}

export function validateRegistration(input: {
    name: string;
    email: string;
    password: string;
    consent: boolean;
}): AccountFieldIssues {
    const name = normalizeName(input.name);
    return compact({
        name: !name ? 'required' : characterCount(name) > NAME_MAX_LENGTH ? 'too_long' : undefined,
        email: emailIssue(input.email),
        password: passwordIssue(input.password, { email: input.email, name }) ?? undefined,
        consent: input.consent === true ? undefined : 'consent_required',
    });
}

export function validateEmailOnly(input: { email: string }): AccountFieldIssues {
    return compact({ email: emailIssue(input.email) });
}

export function validateCode(input: { code: string }): AccountFieldIssues {
    const code = normalizeCode(input.code);
    return compact({ code: !code ? 'required' : isValidCode(code) ? undefined : 'code_invalid' });
}

export function validatePasswordReset(input: {
    email: string;
    code: string;
    password: string;
}, context: PasswordContext = {}): AccountFieldIssues {
    return compact({
        ...validateEmailOnly(input),
        ...validateCode(input),
        password: passwordIssue(input.password, { email: input.email, ...context }) ?? undefined,
    });
}

export function validatePasswordChange(input: {
    currentPassword: string;
    password: string;
}, context: PasswordContext = {}): AccountFieldIssues {
    return compact({
        currentPassword: input.currentPassword ? undefined : 'required',
        password: passwordIssue(input.password, context) ?? undefined,
    });
}

export function validateName(input: { name: string }): AccountFieldIssues {
    const name = normalizeName(input.name);
    return compact({ name: !name ? 'required' : characterCount(name) > NAME_MAX_LENGTH ? 'too_long' : undefined });
}

export function hasIssues(issues: AccountFieldIssues): boolean {
    return Object.keys(issues).length > 0;
}
