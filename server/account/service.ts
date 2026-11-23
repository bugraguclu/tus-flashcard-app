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
import { AccountError } from './errors.ts';
import { AppleKeys, AppleTokens, verifyAppleIdToken } from './apple.ts';
import type { AppleKeyConfig, AppleTokenService } from './apple.ts';
import { GoogleKeys, verifyGoogleIdToken } from './google.ts';
import { IdTokenError } from './idToken.ts';
import type { IdTokenIdentity, KeySource } from './idToken.ts';
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

export { AccountError, ERROR_MESSAGES } from './errors.ts';
export type { AccountErrorDetails } from './errors.ts';

export interface RequestContext {
    ip: string;
    /** The app's own label for the session, e.g. "TusAnkiM iOS". */
    client: string | null;
}

export type RequestBody = Record<string, unknown>;

/** Who vouched for the address, besides the learner's own password. */
type Provider = 'google' | 'apple';

export interface AccountServiceDeps {
    store: AccountStore;
    config: Pick<
        ServerConfig,
        'secret' | 'registrationOpen' | 'emailVerificationRequired' | 'operatorName' | 'contactEmail' | 'sessionDays'
    > & {
        /** The sync endpoints are served (ACCOUNT_SYNC). */
        syncEnabled?: boolean;
        /** OAuth client IDs whose Google ID tokens are accepted; none turns Google sign-in off. */
        googleClientIds?: readonly string[];
        /** The app's bundle ID and web Services ID, whose Apple identity tokens are accepted; none turns Apple off. */
        appleClientIds?: readonly string[];
        /** Lets the server revoke Sign in with Apple when an account is deleted. */
        appleKey?: AppleKeyConfig | null;
    };
    mailer: Mailer;
    /** Google's and Apple's public keys, and Apple's token endpoints; tests pass their own. */
    googleKeys?: KeySource;
    appleKeys?: KeySource;
    appleTokens?: AppleTokenService | null;
    hasher?: PasswordHasher;
    limiter?: RateLimiter;
    now?: Clock;
    log?: Logger;
    /** Called inside account deletion, after the account row is gone (drops its synced collection). */
    onAccountDeleted?: (userId: string) => void;
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
    private readonly googleKeys: KeySource;
    private readonly appleKeys: KeySource;
    private readonly appleTokens: AppleTokenService | null;
    private readonly onAccountDeleted: ((userId: string) => void) | null;

    constructor(deps: AccountServiceDeps) {
        this.store = deps.store;
        this.config = deps.config;
        this.mailer = deps.mailer;
        this.now = deps.now ?? Date.now;
        this.hasher = deps.hasher ?? new PasswordHasher();
        this.limiter = deps.limiter ?? new RateLimiter(this.now);
        this.log = deps.log ?? SILENT_LOG;
        this.googleKeys = deps.googleKeys ?? new GoogleKeys(undefined, this.now);
        this.appleKeys = deps.appleKeys ?? new AppleKeys(undefined, this.now);
        const appleKey = deps.config.appleKey;
        this.appleTokens = deps.appleTokens !== undefined ? deps.appleTokens : appleKey ? new AppleTokens(appleKey) : null;
        this.onAccountDeleted = deps.onAccountDeleted ?? null;
    }

    /** The signed-in account's id, for the sync endpoints; throws `unauthorized` otherwise. */
    authenticatedUserId(token: string | null): string {
        return this.authenticate(token).id;
    }

    /** Per-account request budget shared with the sync endpoints. */
    limitSync(userId: string, kind: 'push' | 'pull' | 'wait'): void {
        const budget = kind === 'push' ? 600 : kind === 'pull' ? 1_200 : 600;
        this.limit(`sync:${kind}:${userId}`, budget, HOUR);
    }

    private get googleClientIds(): readonly string[] {
        return this.config.googleClientIds ?? [];
    }

    private get appleClientIds(): readonly string[] {
        return this.config.appleClientIds ?? [];
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
            appleSignIn: this.appleClientIds.length > 0,
            policyVersion: ACCOUNT_POLICY_VERSION,
            operatorName: this.config.operatorName,
            contactEmail: this.config.contactEmail,
            sync: this.config.syncEnabled === true,
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
            appleSub: null,
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

    /** Sign in with Google: see `providerSignIn`. */
    async googleSignIn(body: RequestBody, context: RequestContext): Promise<AccountSessionGrant & { created: boolean }> {
        this.limit(`google:${context.ip}`, 30, 15 * MINUTE);
        const identity = await this.providerIdentity('google', field(body, 'idToken'));
        return this.providerSignIn('google', identity, body, context);
    }

    /**
     * Sign in with Apple: see `providerSignIn`. Apple puts no name in its token and tells the app
     * the learner's name only the first time, so the app sends it along. When the server holds the
     * developer account's key, it also trades the authorization code for the refresh token that
     * lets it revoke the app's access when the account is deleted, as Apple requires.
     */
    async appleSignIn(body: RequestBody, context: RequestContext): Promise<AccountSessionGrant & { created: boolean }> {
        this.limit(`apple:${context.ip}`, 30, 15 * MINUTE);
        const identity = await this.providerIdentity('apple', field(body, 'identityToken'));
        const grant = await this.providerSignIn('apple', { ...identity, name: field(body, 'name') }, body, context);
        const code = field(body, 'authorizationCode');
        if (this.appleTokens && code) {
            try {
                const refreshToken = await this.appleTokens.exchange(code, identity.audience);
                if (refreshToken) this.store.setAppleGrant(grant.user.id, { clientId: identity.audience, refreshToken });
                else this.log.warn('[account] Apple refused an authorization code; this account cannot be revoked at Apple');
            } catch (error) {
                this.log.warn(`[account] an Apple authorization code could not be exchanged: ${describe(error)}`);
            }
        }
        return grant;
    }

    /**
     * Sign in with a provider, creating the account on first use. The provider has verified the
     * address, so an existing account with that address is the learner's own: it is linked and
     * marked verified. A new account needs the same consent as a sign-up and no password.
     */
    private async providerSignIn(
        provider: Provider,
        identity: IdTokenIdentity,
        body: RequestBody,
        context: RequestContext,
    ): Promise<AccountSessionGrant & { created: boolean }> {
        const email = normalizeEmail(identity.email);
        const now = this.now();

        const known = this.findBySub(provider, identity.subject) ?? this.store.findUserByEmail(email);
        if (known) {
            const linked = (provider === 'google' ? known.googleSub : known.appleSub) !== null;
            if (!linked || known.emailVerifiedAt === null) {
                this.store.transaction(() => {
                    if (!linked) {
                        if (provider === 'google') this.store.setGoogleSub(known.id, identity.subject, now);
                        else this.store.setAppleSub(known.id, identity.subject, now);
                    }
                    if (known.emailVerifiedAt === null) {
                        this.store.markVerified(known.id, now);
                        this.store.insertEvent(known.id, 'email_verified', provider, now);
                    }
                });
            }
            const user = this.store.findUserById(known.id) ?? known;
            return { ...this.openSession(user, context, provider), created: false };
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
            googleSub: provider === 'google' ? identity.subject : null,
            appleSub: provider === 'apple' ? identity.subject : null,
        };
        const requestedPolicy = field(body, 'policyVersion');
        const policyVersion = POLICY_VERSION_PATTERN.test(requestedPolicy) ? requestedPolicy : ACCOUNT_POLICY_VERSION;
        try {
            this.store.transaction(() => {
                this.store.insertUser(user);
                this.store.insertConsent(user.id, policyVersion, now);
                this.store.insertEvent(user.id, 'account_created', provider, now);
            });
        } catch (error) {
            // A second tap that raced the first: sign in to the account it made.
            const existing = this.findBySub(provider, identity.subject);
            if (existing) return { ...this.openSession(existing, context, provider), created: false };
            throw error;
        }
        return { ...this.openSession(user, context, provider), created: true };
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
        const appleToken = field(body, 'appleIdentityToken');
        if (googleToken && user.googleSub !== null) {
            // Proving it is still the same Google or Apple account stands in for a password.
            const identity = await this.providerIdentity('google', googleToken);
            if (identity.subject !== user.googleSub) throw new AccountError('google_failed', 400);
        } else if (appleToken && user.appleSub !== null) {
            const identity = await this.providerIdentity('apple', appleToken);
            if (identity.subject !== user.appleSub) throw new AccountError('apple_failed', 400);
        } else {
            const password = field(body, 'password');
            if (!password) throw invalidInput({ password: 'required' });
            if (!user.passwordHash || !(await this.hasher.verify(password, user.passwordHash))) {
                throw new AccountError('wrong_password', 400, undefined, { fields: { password: 'password_wrong' } });
            }
        }
        const appleGrant = this.store.appleGrant(user.id);
        this.store.transaction(() => {
            this.store.deleteCodes(user.email);
            this.store.deleteUser(user.id);
        });
        this.log.info('[account] an account was deleted at its owner’s request');
        if (this.onAccountDeleted) {
            try {
                this.onAccountDeleted(user.id);
            } catch (error) {
                this.log.error('[account] a deleted account’s synced collection could not be removed', error);
            }
        }
        if (appleGrant) {
            if (!this.appleTokens) this.log.warn('[account] a deleted account’s Apple access was not revoked: no Apple key is set');
            else {
                try {
                    await this.appleTokens.revoke(appleGrant.refreshToken, appleGrant.clientId);
                } catch (error) {
                    this.log.warn(`[account] a deleted account’s Apple access could not be revoked: ${describe(error)}`);
                }
            }
        }
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
            apple: row.appleSub !== null,
        };
    }

    /** A checked Google or Apple identity with a verified address, or `google_failed` / `apple_failed`. */
    private async providerIdentity(provider: Provider, idToken: string): Promise<IdTokenIdentity> {
        const clientIds = provider === 'google' ? this.googleClientIds : this.appleClientIds;
        const failed = provider === 'google' ? 'google_failed' : 'apple_failed';
        if (clientIds.length === 0) throw new AccountError('not_found', 404);
        if (!idToken) throw new AccountError(failed, 400);
        let identity: IdTokenIdentity;
        try {
            const options = { clientIds, now: this.now() };
            identity = provider === 'google'
                ? await verifyGoogleIdToken(idToken, { ...options, keys: this.googleKeys })
                : await verifyAppleIdToken(idToken, { ...options, keys: this.appleKeys });
        } catch (error) {
            const label = provider === 'google' ? 'Google' : 'Apple';
            if (error instanceof IdTokenError) this.log.warn(`[account] a token from ${label} was refused: ${error.message}`);
            else this.log.warn(`[account] a token from ${label} could not be checked: ${describe(error)}`);
            throw new AccountError(failed, 400);
        }
        if (!identity.emailVerified) throw new AccountError(failed, 400);
        return identity;
    }

    private findBySub(provider: Provider, subject: string): UserRow | undefined {
        return provider === 'google' ? this.store.findUserByGoogleSub(subject) : this.store.findUserByAppleSub(subject);
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
