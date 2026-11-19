import {
    ACCOUNT_POLICY_VERSION,
    CODE_MAX_ATTEMPTS,
    CODE_RESEND_SECONDS,
    CODE_TTL_MINUTES,
    hasIssues,
    normalizeCode,
    normalizeEmail,
    normalizeName,
    validateCode,
    validateEmailOnly,
    validateName,
    validatePasswordChange,
    validatePasswordReset,
    validateRegistration,
    validateSignIn,
} from '../../lib/accountContract.ts';
import type {
    AccountCodeSent,
    AccountErrorCode,
    AccountEvent,
    AccountEventType,
    AccountFieldIssues,
    AccountLocale,
    AccountRegisterResult,
    AccountServiceConfig,
    AccountSessionGrant,
    AccountSessionInfo,
    AccountUser,
} from '../../lib/accountContract.ts';
import type { ServerConfig } from './config.ts';
import { GoogleKeys, GoogleTokenError, verifyGoogleIdToken } from './google.ts';
import type { GoogleIdentity, GoogleKeySource } from './google.ts';
import { codeMail } from './mailer.ts';
import type { Logger, Mailer } from './mailer.ts';
import { PasswordHasher } from './passwords.ts';
import { RateLimiter } from './rateLimit.ts';
import type { Clock } from './rateLimit.ts';
import { hashCode, hashToken, isWellFormedToken, newCode, newId, newSessionToken, sameDigest } from './secrets.ts';
import { isUniqueEmailViolation } from './store.ts';
import type { AccountStore, CodePurpose, UserRow } from './store.ts';

/*
 * The account rules, independent of HTTP. Every public method takes the parsed JSON body (unknown
 * fields are ignored), the bearer token when the route has one, and where the request came from.
 */

/** Turkish defaults; the app shows its own localized text for each code. */
export const ERROR_MESSAGES: Record<AccountErrorCode, string> = {
    invalid_input: 'Bilgileri kontrol edip tekrar deneyin.',
    invalid_credentials: 'E-posta veya şifre hatalı.',
    email_taken: 'Bu e-posta adresiyle bir hesap zaten var. Giriş yapmayı veya şifrenizi yenilemeyi deneyin.',
    registration_closed: 'Yeni hesap oluşturma şu anda kapalı.',
    unverified: 'Önce e-posta adresinizi doğrulayın. Doğrulama kodunu e-postanıza gönderdik.',
    email_unavailable: 'E-posta şu anda gönderilemiyor. Biraz sonra tekrar deneyin.',
    code_invalid: 'Kod hatalı. Kontrol edip tekrar deneyin.',
    code_expired: 'Kodun süresi doldu veya çok fazla deneme yapıldı. Yeni bir kod isteyin.',
    wrong_password: 'Şifre hatalı.',
    unauthorized: 'Oturumunuz sona erdi. Tekrar giriş yapın.',
    rate_limited: 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.',
    not_found: 'İstenen işlem bulunamadı.',
    payload_too_large: 'İstek çok büyük.',
    server_error: 'Beklenmeyen bir sorun oluştu. Biraz sonra tekrar deneyin.',
    offline: 'Hesap sunucusuna ulaşılamıyor.',
    timeout: 'Hesap sunucusu zamanında yanıt vermedi.',
    not_configured: 'Hesap hizmeti yapılandırılmamış.',
    google_failed: 'Google ile giriş doğrulanamadı. Yeniden deneyin.',
};

export interface AccountErrorDetails {
    fields?: AccountFieldIssues;
    retryAfter?: number;
    email?: string;
}

export class AccountError extends Error {
    readonly code: AccountErrorCode;
    readonly status: number;
    readonly details: AccountErrorDetails;

    constructor(code: AccountErrorCode, status: number, message: string = ERROR_MESSAGES[code], details: AccountErrorDetails = {}) {
        super(message);
        this.name = 'AccountError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export interface RequestContext {
    ip: string;
    /** The app's own label for the session, e.g. "TusAnkiM iOS". */
    client: string | null;
}

export type RequestBody = Record<string, unknown>;

export interface AccountServiceDeps {
    store: AccountStore;
    config: Pick<
        ServerConfig,
        'secret' | 'registrationOpen' | 'emailVerificationRequired' | 'operatorName' | 'contactEmail' | 'sessionDays'
    > & {
        /** OAuth client IDs whose Google ID tokens are accepted; none turns Google sign-in off. */
        googleClientIds?: readonly string[];
    };
    mailer: Mailer;
    /** Google's public keys; tests pass their own. */
    googleKeys?: GoogleKeySource;
    hasher?: PasswordHasher;
    limiter?: RateLimiter;
    now?: Clock;
    log?: Logger;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A session's expiry moves forward at most once an hour, so checking a session stays cheap. */
const SESSION_TOUCH_INTERVAL = HOUR;
const ACTIVITY_LIMIT = 20;
const POLICY_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SILENT_LOG: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function field(body: RequestBody, name: string): string {
    const value = body[name];
    return typeof value === 'string' ? value : '';
}

function localeOf(body: RequestBody): AccountLocale {
    return body.locale === 'en' ? 'en' : 'tr';
}

function iso(milliseconds: number): string {
    return new Date(milliseconds).toISOString();
}

function invalidInput(fields: AccountFieldIssues): AccountError {
    return new AccountError('invalid_input', 400, undefined, { fields });
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export class AccountService {
    private readonly store: AccountStore;
    private readonly config: AccountServiceDeps['config'];
    private readonly mailer: Mailer;
    private readonly hasher: PasswordHasher;
    private readonly limiter: RateLimiter;
    private readonly now: Clock;
    private readonly log: Logger;
    private readonly googleKeys: GoogleKeySource;

    constructor(deps: AccountServiceDeps) {
        this.store = deps.store;
        this.config = deps.config;
        this.mailer = deps.mailer;
        this.now = deps.now ?? Date.now;
        this.hasher = deps.hasher ?? new PasswordHasher();
        this.limiter = deps.limiter ?? new RateLimiter(this.now);
        this.log = deps.log ?? SILENT_LOG;
        this.googleKeys = deps.googleKeys ?? new GoogleKeys(undefined, this.now);
    }

    private get googleClientIds(): readonly string[] {
        return this.config.googleClientIds ?? [];
    }

    private get sessionMs(): number {
        return this.config.sessionDays * DAY;
    }

    // --- Public -------------------------------------------------------------------------------

    publicConfig(): AccountServiceConfig {
        return {
            registrationOpen: this.config.registrationOpen && (!this.config.emailVerificationRequired || this.mailer.ready),
            emailReady: this.mailer.ready,
            emailVerificationRequired: this.config.emailVerificationRequired,
            googleSignIn: this.googleClientIds.length > 0,
            policyVersion: ACCOUNT_POLICY_VERSION,
            operatorName: this.config.operatorName,
            contactEmail: this.config.contactEmail,
        };
    }

    /** Without a token: what the server offers. With one: also who it belongs to, or 401. */
    sessionInfo(token: string | null): AccountSessionInfo {
        const config = this.publicConfig();
        if (token === null) return { config, user: null };
        return { config, user: this.toUser(this.authenticate(token)) };
    }

    async register(body: RequestBody, context: RequestContext): Promise<AccountRegisterResult> {
        this.limit(`register:${context.ip}`, 10, HOUR);
        if (!this.publicConfig().registrationOpen) throw new AccountError('registration_closed', 403);

        const input = {
            name: field(body, 'name'),
            email: field(body, 'email'),
            password: field(body, 'password'),
            consent: body.consent === true,
        };
        const issues = validateRegistration(input);
        if (hasIssues(issues)) throw invalidInput(issues);

        const email = normalizeEmail(input.email);
        if (this.store.findUserByEmail(email)) throw new AccountError('email_taken', 409);

        const passwordHash = await this.hasher.hash(input.password);
        const now = this.now();
        const user: UserRow = {
            id: newId(),
            email,
            name: normalizeName(input.name),
            passwordHash,
            emailVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
            googleSub: null,
        };
        const requestedPolicy = field(body, 'policyVersion');
        const policyVersion = POLICY_VERSION_PATTERN.test(requestedPolicy) ? requestedPolicy : ACCOUNT_POLICY_VERSION;
        try {
            this.store.transaction(() => {
                this.store.insertUser(user);
                this.store.insertConsent(user.id, policyVersion, now);
                this.store.insertEvent(user.id, 'account_created', 'email', now);
            });
        } catch (error) {
            // Two sign-ups for one address can both pass the check above while hashing.
            if (isUniqueEmailViolation(error)) throw new AccountError('email_taken', 409);
            throw error;
        }

        const locale = localeOf(body);
        if (this.config.emailVerificationRequired) {
            const quota = this.tryTakeCodeQuota('verify', email);
            if (quota) {
                try {
                    await this.issueCode(user, 'verify', locale);
                } catch (error) {
                    // An account nobody can verify would only block the address; let them retry.
                    this.refund(quota);
                    this.store.transaction(() => {
                        this.store.deleteCodes(email);
                        this.store.deleteUser(user.id);
                    });
                    throw error;
                }
            }
            return { verificationRequired: true, email };
        }

        const grant = this.openSession(user, context, 'email');
        let verificationSent = false;
        if (this.mailer.ready) {
            const quota = this.tryTakeCodeQuota('verify', email);
            if (quota) {
                try {
                    await this.issueCode(user, 'verify', locale);
                    verificationSent = true;
                } catch {
                    // The account works without it; the learner can ask for a code later.
                    this.refund(quota);
                }
            }
        }
        return { ...grant, verificationSent };
    }

    async login(body: RequestBody, context: RequestContext): Promise<AccountSessionGrant> {
        this.limit(`login:${context.ip}`, 30, 15 * MINUTE);
        const input = { email: field(body, 'email'), password: field(body, 'password') };
        const issues = validateSignIn(input);
        if (hasIssues(issues)) throw invalidInput(issues);

        const email = normalizeEmail(input.email);
        this.limit(`login-address:${email}`, 10, 15 * MINUTE);
        const user = this.store.findUserByEmail(email);
        // An account made with Google has no password: it fails like an unknown address, in the same time.
        const valid = user && user.passwordHash
            ? await this.hasher.verify(input.password, user.passwordHash)
            : await this.hasher.verifyAgainstNothing(input.password);
        if (!user || !valid) throw new AccountError('invalid_credentials', 401);

        if (this.hasher.needsRehash(user.passwordHash)) {
            this.store.setPassword(user.id, await this.hasher.hash(input.password), this.now());
        }

        if (this.config.emailVerificationRequired && user.emailVerifiedAt === null) {
            if (!this.mailer.ready) throw new AccountError('email_unavailable', 503);
            // Within the resend window the code already sent is still the one to type.
            const quota = this.tryTakeCodeQuota('verify', email);
            if (quota) {
                try {
                    await this.issueCode(user, 'verify', localeOf(body));
                } catch (error) {
                    this.refund(quota);
                    throw error;
                }
            }
            throw new AccountError('unverified', 403, undefined, { email });
        }

        return this.openSession(user, context, 'email');
    }

    /**
     * Sign in with Google, creating the account on first use. Google has verified the address, so
     * an existing account with that address is the learner's own: it is linked and marked
     * verified. A new account needs the same consent as a sign-up and no password.
     */
    async googleSignIn(body: RequestBody, context: RequestContext): Promise<AccountSessionGrant & { created: boolean }> {
        this.limit(`google:${context.ip}`, 30, 15 * MINUTE);
        const identity = await this.googleIdentity(field(body, 'idToken'));
        const email = normalizeEmail(identity.email);
        const now = this.now();

        const known = this.store.findUserByGoogleSub(identity.subject) ?? this.store.findUserByEmail(email);
        if (known) {
            if (known.googleSub === null || known.emailVerifiedAt === null) {
                this.store.transaction(() => {
                    if (known.googleSub === null) this.store.setGoogleSub(known.id, identity.subject, now);
                    if (known.emailVerifiedAt === null) {
                        this.store.markVerified(known.id, now);
                        this.store.insertEvent(known.id, 'email_verified', 'google', now);
                    }
                });
            }
            const user = this.store.findUserById(known.id) ?? known;
            return { ...this.openSession(user, context, 'google'), created: false };
        }

        if (!this.config.registrationOpen) throw new AccountError('registration_closed', 403);
        if (body.consent !== true) throw invalidInput({ consent: 'consent_required' });
        const fallbackName = email.split('@')[0] ?? '';
        const name = normalizeName(identity.name) || normalizeName(fallbackName) || 'TusAnkiM';
        const user: UserRow = {
            id: newId(),
            email,
            name: Array.from(name).slice(0, 80).join(''),
            passwordHash: '',
            emailVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
            googleSub: identity.subject,
        };
        const requestedPolicy = field(body, 'policyVersion');
        const policyVersion = POLICY_VERSION_PATTERN.test(requestedPolicy) ? requestedPolicy : ACCOUNT_POLICY_VERSION;
        try {
            this.store.transaction(() => {
                this.store.insertUser(user);
                this.store.insertConsent(user.id, policyVersion, now);
                this.store.insertEvent(user.id, 'account_created', 'google', now);
            });
        } catch (error) {
            // A second tap that raced the first: sign in to the account it made.
            const existing = this.store.findUserByGoogleSub(identity.subject);
            if (existing) return { ...this.openSession(existing, context, 'google'), created: false };
            throw error;
        }
        return { ...this.openSession(user, context, 'google'), created: true };
    }

    logout(token: string | null): Record<string, never> {
        if (token === null || !isWellFormedToken(token)) return {};
        const tokenHash = hashToken(token);
        const session = this.store.findSession(tokenHash);
        if (session) {
            this.store.transaction(() => {
                this.store.deleteSession(tokenHash);
                this.store.insertEvent(session.userId, 'signed_out', null, this.now());
            });
        }
        return {};
    }

    async requestVerification(body: RequestBody, token: string | null, context: RequestContext): Promise<AccountCodeSent> {
        const signedIn = token === null ? null : this.authenticate(token);
        this.limit(`email:${context.ip}`, 10, HOUR);

        let user: UserRow | undefined;
        let email: string;
        if (signedIn) {
            if (signedIn.emailVerifiedAt !== null) return { sent: false, retryAfter: 0 };
            user = signedIn;
            email = signedIn.email;
        } else {
            const raw = field(body, 'email');
            const issues = validateEmailOnly({ email: raw });
            if (hasIssues(issues)) throw invalidInput(issues);
            email = normalizeEmail(raw);
            user = this.store.findUserByEmail(email);
        }

        if (!this.mailer.ready) throw new AccountError('email_unavailable', 503);
        const quota = this.takeCodeQuota('verify', email);
        // Signed out, the answer is the same whether or not the address has an unverified account.
        if (user && user.emailVerifiedAt === null) {
            try {
                await this.issueCode(user, 'verify', localeOf(body));
            } catch (error) {
                this.refund(quota);
                throw error;
            }
        }
        return { sent: true, retryAfter: CODE_RESEND_SECONDS };
    }

    async confirmVerification(
        body: RequestBody,
        token: string | null,
        context: RequestContext,
    ): Promise<{ user: AccountUser } | AccountSessionGrant> {
        const signedIn = token === null ? null : this.authenticate(token);
        this.limit(`code:${context.ip}`, 30, 15 * MINUTE);

        const rawEmail = signedIn ? signedIn.email : field(body, 'email');
        const rawCode = field(body, 'code');
        const issues: AccountFieldIssues = {
            ...(signedIn ? {} : validateEmailOnly({ email: rawEmail })),
            ...validateCode({ code: rawCode }),
        };
        if (hasIssues(issues)) throw invalidInput(issues);

        const email = normalizeEmail(rawEmail);
        this.consumeCode(email, 'verify', normalizeCode(rawCode));
        const user = this.store.findUserByEmail(email);
        // The account was deleted after the code went out.
        if (!user) throw new AccountError('code_expired', 400);

        const now = this.now();
        this.store.transaction(() => {
            this.store.markVerified(user.id, now);
            this.store.insertEvent(user.id, 'email_verified', 'code', now);
        });
        const verified = this.store.findUserById(user.id) ?? user;
        // Signed out, the code proved the address, which is as much as a reset code proves.
        return signedIn ? { user: this.toUser(verified) } : this.openSession(verified, context, 'code');
    }

    async requestPasswordReset(body: RequestBody, context: RequestContext): Promise<AccountCodeSent> {
        this.limit(`email:${context.ip}`, 10, HOUR);
        const raw = field(body, 'email');
        const issues = validateEmailOnly({ email: raw });
        if (hasIssues(issues)) throw invalidInput(issues);
        if (!this.mailer.ready) throw new AccountError('email_unavailable', 503);

        const email = normalizeEmail(raw);
        const quota = this.takeCodeQuota('reset', email);
        const user = this.store.findUserByEmail(email);
        if (user) {
            try {
                await this.issueCode(user, 'reset', localeOf(body));
            } catch (error) {
                this.refund(quota);
                throw error;
            }
        }
        // Same answer either way: this endpoint must not tell who has an account.
        return { sent: true, retryAfter: CODE_RESEND_SECONDS };
    }

    async confirmPasswordReset(body: RequestBody, context: RequestContext): Promise<AccountSessionGrant> {
        this.limit(`code:${context.ip}`, 30, 15 * MINUTE);
        const input = { email: field(body, 'email'), code: field(body, 'code'), password: field(body, 'password') };
        // Only the address is used as context: judging the password against the account's name
        // before the code is checked would tell a stranger what that name is.
        const issues = validatePasswordReset(input);
        if (hasIssues(issues)) throw invalidInput(issues);

        const email = normalizeEmail(input.email);
        this.consumeCode(email, 'reset', normalizeCode(input.code));
        const user = this.store.findUserByEmail(email);
        if (!user) throw new AccountError('code_expired', 400);

        const passwordHash = await this.hasher.hash(input.password);
        const now = this.now();
        this.store.transaction(() => {
            this.store.setPassword(user.id, passwordHash, now);
            this.store.markVerified(user.id, now);
            this.store.deleteUserSessions(user.id);
            this.store.insertEvent(user.id, 'password_reset', 'code', now);
        });
        return this.openSession(this.store.findUserById(user.id) ?? user, context, null);
    }

    async changePassword(token: string | null, body: RequestBody, context: RequestContext): Promise<AccountSessionGrant> {
        const user = this.authenticate(token);
        this.limit(`password:${user.id}`, 10, HOUR);
        const input = { currentPassword: field(body, 'currentPassword'), password: field(body, 'password') };
        const issues = validatePasswordChange(input, { email: user.email, name: user.name });
        if (hasIssues(issues)) throw invalidInput(issues);
        if (!(await this.hasher.verify(input.currentPassword, user.passwordHash))) {
            throw new AccountError('wrong_password', 400, undefined, { fields: { currentPassword: 'password_wrong' } });
        }

        const passwordHash = await this.hasher.hash(input.password);
        const now = this.now();
        this.store.transaction(() => {
            this.store.setPassword(user.id, passwordHash, now);
            // Every other device signs in again with the new password.
            this.store.deleteUserSessions(user.id);
            this.store.insertEvent(user.id, 'password_changed', 'password', now);
        });
        return this.openSession(this.store.findUserById(user.id) ?? user, context, null);
    }

    updateProfile(token: string | null, body: RequestBody): { user: AccountUser } {
        const user = this.authenticate(token);
        const raw = field(body, 'name');
        const issues = validateName({ name: raw });
        if (hasIssues(issues)) throw invalidInput(issues);
        const name = normalizeName(raw);
        if (name === user.name) return { user: this.toUser(user) };
        const now = this.now();
        this.store.transaction(() => {
            this.store.setName(user.id, name, now);
            this.store.insertEvent(user.id, 'name_changed', null, now);
        });
        return { user: this.toUser({ ...user, name, updatedAt: now }) };
    }

    async deleteAccount(token: string | null, body: RequestBody): Promise<Record<string, never>> {
        const user = this.authenticate(token);
        this.limit(`password:${user.id}`, 10, HOUR);
        const googleToken = field(body, 'googleIdToken');
        if (googleToken && user.googleSub !== null) {
            // Proving it is still the same Google account stands in for a password.
            const identity = await this.googleIdentity(googleToken);
            if (identity.subject !== user.googleSub) throw new AccountError('google_failed', 400);
        } else {
            const password = field(body, 'password');
            if (!password) throw invalidInput({ password: 'required' });
            if (!user.passwordHash || !(await this.hasher.verify(password, user.passwordHash))) {
                throw new AccountError('wrong_password', 400, undefined, { fields: { password: 'password_wrong' } });
            }
        }
        this.store.transaction(() => {
            this.store.deleteCodes(user.email);
            this.store.deleteUser(user.id);
        });
        this.log.info('[account] an account was deleted at its owner’s request');
        return {};
    }

    activity(token: string | null): { events: AccountEvent[] } {
        const user = this.authenticate(token);
        return {
            events: this.store.listEvents(user.id, ACTIVITY_LIMIT).map((event) => ({
                type: event.type as AccountEventType,
                createdAt: iso(event.createdAt),
            })),
        };
    }

    // --- Internals ------------------------------------------------------------------------------

    private toUser(row: UserRow): AccountUser {
        return {
            id: row.id,
            name: row.name,
            email: row.email,
            emailVerified: row.emailVerifiedAt !== null,
            createdAt: iso(row.createdAt),
            hasPassword: row.passwordHash !== '',
            google: row.googleSub !== null,
        };
    }

    /** A checked Google identity with a verified address, or `google_failed`. */
    private async googleIdentity(idToken: string): Promise<GoogleIdentity> {
        if (this.googleClientIds.length === 0) throw new AccountError('not_found', 404);
        if (!idToken) throw new AccountError('google_failed', 400);
        let identity: GoogleIdentity;
        try {
            identity = await verifyGoogleIdToken(idToken, { clientIds: this.googleClientIds, keys: this.googleKeys, now: this.now() });
        } catch (error) {
            if (error instanceof GoogleTokenError) this.log.warn(`[account] a Google token was refused: ${error.message}`);
            else this.log.warn(`[account] a Google token could not be checked: ${describe(error)}`);
            throw new AccountError('google_failed', 400);
        }
        if (!identity.emailVerified) throw new AccountError('google_failed', 400);
        return identity;
    }

    private limit(key: string, limit: number, windowMs: number): void {
        const decision = this.limiter.take(key, limit, windowMs);
        if (!decision.ok) throw new AccountError('rate_limited', 429, undefined, { retryAfter: decision.retryAfter });
    }

    /**
     * One code per minute per address and purpose, five an hour and ten a day: with five guesses
     * per code, that keeps a six-digit code out of reach of guessing.
     */
    private codeQuotas(purpose: CodePurpose, email: string): Array<[string, number, number]> {
        return [
            [`code-resend:${purpose}:${email}`, 1, CODE_RESEND_SECONDS * 1000],
            [`code-hour:${purpose}:${email}`, 5, HOUR],
            [`code-day:${purpose}:${email}`, 10, DAY],
        ];
    }

    private tryTakeCodeQuota(purpose: CodePurpose, email: string): string[] | null {
        const taken: string[] = [];
        for (const [key, limit, windowMs] of this.codeQuotas(purpose, email)) {
            if (!this.limiter.take(key, limit, windowMs).ok) {
                this.refund(taken);
                return null;
            }
            taken.push(key);
        }
        return taken;
    }

    private takeCodeQuota(purpose: CodePurpose, email: string): string[] {
        const taken: string[] = [];
        for (const [key, limit, windowMs] of this.codeQuotas(purpose, email)) {
            const decision = this.limiter.take(key, limit, windowMs);
            if (!decision.ok) {
                this.refund(taken);
                throw new AccountError('rate_limited', 429, undefined, { retryAfter: decision.retryAfter });
            }
            taken.push(key);
        }
        return taken;
    }

    private refund(keys: string[]): void {
        for (const key of keys) this.limiter.refund(key);
    }

    /** Replaces any earlier code of this purpose and mails the new one. */
    private async issueCode(user: UserRow, purpose: CodePurpose, locale: AccountLocale): Promise<void> {
        const code = newCode();
        const now = this.now();
        this.store.deleteCodes(user.email, purpose);
        const id = this.store.insertCode({
            email: user.email,
            purpose,
            codeHash: hashCode(this.config.secret, purpose, user.email, code),
            createdAt: now,
            expiresAt: now + CODE_TTL_MINUTES * MINUTE,
        });
        try {
            await this.mailer.send({ to: user.email, purpose, code, ...codeMail({ purpose, code, name: user.name, locale }) });
        } catch (error) {
            this.store.deleteCode(id);
            this.log.warn(`[account] a ${purpose} code could not be sent: ${describe(error)}`);
            throw new AccountError('email_unavailable', 503);
        }
    }

    /** Accepts the live code once; wrong guesses count against it until it is withdrawn. */
    private consumeCode(email: string, purpose: CodePurpose, code: string): void {
        const now = this.now();
        const row = this.store.latestCode(email, purpose);
        if (!row || row.expiresAt <= now) {
            if (row) this.store.deleteCodes(email, purpose);
            throw new AccountError('code_expired', 400);
        }
        if (sameDigest(row.codeHash, hashCode(this.config.secret, purpose, email, code))) {
            this.store.deleteCodes(email, purpose);
            return;
        }
        if (this.store.addCodeAttempt(row.id) >= CODE_MAX_ATTEMPTS) {
            this.store.deleteCodes(email, purpose);
            throw new AccountError('code_expired', 400);
        }
        throw new AccountError('code_invalid', 400, undefined, { fields: { code: 'code_invalid' } });
    }

    private authenticate(token: string | null): UserRow {
        if (token === null || !isWellFormedToken(token)) throw new AccountError('unauthorized', 401);
        const tokenHash = hashToken(token);
        const session = this.store.findSession(tokenHash);
        const now = this.now();
        if (!session || session.expiresAt <= now) {
            if (session) this.store.deleteSession(tokenHash);
            throw new AccountError('unauthorized', 401);
        }
        const user = this.store.findUserById(session.userId);
        if (!user) {
            this.store.deleteSession(tokenHash);
            throw new AccountError('unauthorized', 401);
        }
        if (now - session.lastUsedAt >= SESSION_TOUCH_INTERVAL) {
            this.store.touchSession(tokenHash, now, now + this.sessionMs);
        }
        return user;
    }

    /** `signInMethod` records a `signed_in` event; null when the session only replaces others. */
    private openSession(user: UserRow, context: RequestContext, signInMethod: string | null): AccountSessionGrant {
        const token = newSessionToken();
        const now = this.now();
        const expiresAt = now + this.sessionMs;
        this.store.transaction(() => {
            this.store.insertSession({
                tokenHash: hashToken(token),
                userId: user.id,
                createdAt: now,
                lastUsedAt: now,
                expiresAt,
                client: context.client,
            });
            if (signInMethod) this.store.insertEvent(user.id, 'signed_in', signInMethod, now);
        });
        return { user: this.toUser(user), token, expiresAt: iso(expiresAt) };
    }
}
