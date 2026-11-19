import type {
    AccountCodeSent,
    AccountDeleteProof,
    AccountErrorCode,
    AccountEvent,
    AccountFieldIssues,
    AccountLocale,
    AccountRegisterResult,
    AccountSessionGrant,
    AccountSessionInfo,
    AccountUser,
} from './accountContract';
import {
    parseCodeSent,
    parseEvents,
    parseGrant,
    parseServiceConfig,
    parseUser,
} from './accountSession';

/*
 * The app's only door to the account server. Every failure — no network, a timeout, a server
 * error, a reply of the wrong shape — arrives as an AccountRequestError with a code the screens
 * know how to word, never as a raw exception.
 */

const KNOWN_CODES = new Set<AccountErrorCode>([
    'invalid_input', 'invalid_credentials', 'email_taken', 'registration_closed', 'unverified',
    'email_unavailable', 'code_invalid', 'code_expired', 'wrong_password', 'unauthorized',
    'rate_limited', 'not_found', 'payload_too_large', 'server_error', 'offline', 'timeout',
    'not_configured', 'google_failed', 'apple_failed',
]);

const FIELD_NAMES = new Set(['name', 'email', 'password', 'currentPassword', 'code', 'consent']);

export class AccountRequestError extends Error {
    readonly code: AccountErrorCode;
    readonly status: number;
    readonly fields: AccountFieldIssues;
    /** Seconds the server asked us to wait, when it did. */
    readonly retryAfter: number | null;
    /** The address the server wants a code for (an unverified sign-in). */
    readonly email: string | null;

    constructor(
        code: AccountErrorCode,
        details: { status?: number; message?: string; fields?: AccountFieldIssues; retryAfter?: number | null; email?: string | null } = {},
    ) {
        super(details.message || code);
        this.name = 'AccountRequestError';
        this.code = code;
        this.status = details.status ?? 0;
        this.fields = details.fields ?? {};
        this.retryAfter = details.retryAfter ?? null;
        this.email = details.email ?? null;
    }
}

export function isAccountRequestError(error: unknown): error is AccountRequestError {
    return error instanceof AccountRequestError;
}

type FetchLike = (input: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
}>;

export interface AccountClientOptions {
    baseUrl: string | null;
    clientLabel: string;
    fetch?: FetchLike;
    timeoutMs?: number;
}

function codeForStatus(status: number): AccountErrorCode {
    if (status === 401) return 'unauthorized';
    if (status === 404) return 'not_found';
    if (status === 413) return 'payload_too_large';
    if (status === 429) return 'rate_limited';
    return 'server_error';
}

function parseFields(value: unknown): AccountFieldIssues {
    if (typeof value !== 'object' || value === null) return {};
    const fields: AccountFieldIssues = {};
    for (const [name, issue] of Object.entries(value)) {
        if (FIELD_NAMES.has(name) && typeof issue === 'string' && issue.length <= 40) {
            (fields as Record<string, string>)[name] = issue;
        }
    }
    return fields;
}

function retryAfterSeconds(body: unknown, header: string | null): number | null {
    if (typeof body === 'number' && Number.isFinite(body)) return Math.max(0, Math.round(body));
    const seconds = header ? Number(header) : NaN;
    return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : null;
}

function errorFromReply(status: number, payload: unknown, retryHeader: string | null): AccountRequestError {
    const error = typeof payload === 'object' && payload !== null
        ? (payload as { error?: Record<string, unknown> }).error
        : undefined;
    const declared = typeof error?.code === 'string' && KNOWN_CODES.has(error.code as AccountErrorCode)
        ? error.code as AccountErrorCode
        : null;
    return new AccountRequestError(declared ?? codeForStatus(status), {
        status,
        message: typeof error?.message === 'string' ? error.message.slice(0, 300) : undefined,
        fields: parseFields(error?.fields),
        retryAfter: retryAfterSeconds(error?.retryAfter, retryHeader),
        email: typeof error?.email === 'string' ? error.email.slice(0, 320) : null,
    });
}

function expect<T>(value: T | null, status: number): T {
    if (value === null) throw new AccountRequestError('server_error', { status });
    return value;
}

export function createAccountClient(options: AccountClientOptions) {
    const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
    const timeoutMs = options.timeoutMs ?? 15_000;

    async function request(
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
        path: string,
        { token, body }: { token?: string | null; body?: object } = {},
    ): Promise<{ status: number; payload: unknown }> {
        if (!options.baseUrl) throw new AccountRequestError('not_configured');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let response: Awaited<ReturnType<FetchLike>>;
            try {
                response = await fetchImpl(`${options.baseUrl}${path}`, {
                    method,
                    headers: {
                        Accept: 'application/json',
                        'X-Client': options.clientLabel,
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
            } catch {
                throw new AccountRequestError(controller.signal.aborted ? 'timeout' : 'offline');
            }
            let text = '';
            try {
                text = await response.text();
            } catch {
                throw new AccountRequestError(controller.signal.aborted ? 'timeout' : 'offline', { status: response.status });
            }
            let payload: unknown = null;
            if (text) {
                try {
                    payload = JSON.parse(text);
                } catch {
                    payload = null;
                }
            }
            if (!response.ok) throw errorFromReply(response.status, payload, response.headers.get('Retry-After'));
            if (typeof payload !== 'object' || payload === null) {
                throw new AccountRequestError('server_error', { status: response.status });
            }
            return { status: response.status, payload };
        } finally {
            clearTimeout(timer);
        }
    }

    const grantFrom = ({ status, payload }: { status: number; payload: unknown }) => expect(parseGrant(payload), status);
    const codeSentFrom = ({ status, payload }: { status: number; payload: unknown }) => expect(parseCodeSent(payload), status);
    const userFrom = ({ status, payload }: { status: number; payload: unknown }) =>
        expect(parseUser((payload as { user?: unknown }).user), status);

    return {
        async session(token?: string | null): Promise<AccountSessionInfo> {
            const reply = await request('GET', '/v1/session', { token });
            const payload = reply.payload as { config?: unknown; user?: unknown };
            const config = expect(parseServiceConfig(payload.config), reply.status);
            const user = payload.user === null || payload.user === undefined ? null : expect(parseUser(payload.user), reply.status);
            return { config, user };
        },

        async register(input: {
            name: string;
            email: string;
            password: string;
            consent: boolean;
            policyVersion: string;
            locale: AccountLocale;
        }): Promise<AccountRegisterResult> {
            const reply = await request('POST', '/v1/register', { body: input });
            const payload = reply.payload as { verificationRequired?: unknown; email?: unknown; verificationSent?: unknown };
            if (payload.verificationRequired === true) {
                return { verificationRequired: true, email: typeof payload.email === 'string' ? payload.email : input.email };
            }
            return { ...grantFrom(reply), verificationSent: payload.verificationSent === true };
        },

        /** Signs in, or creates the account, with an ID token from Google's sign-in sheet. */
        async signInWithGoogle(input: {
            idToken: string;
            consent: boolean;
            policyVersion: string;
            locale: AccountLocale;
        }): Promise<AccountSessionGrant & { created: boolean }> {
            const reply = await request('POST', '/v1/google', { body: input });
            return { ...grantFrom(reply), created: (reply.payload as { created?: unknown }).created === true };
        },

        /**
         * Signs in, or creates the account, with Apple's identity token. Apple names the learner
         * only the first time, so `name` is empty afterwards; the authorization code lets the
         * server revoke the access when the account is deleted.
         */
        async signInWithApple(input: {
            identityToken: string;
            authorizationCode: string;
            name: string;
            consent: boolean;
            policyVersion: string;
            locale: AccountLocale;
        }): Promise<AccountSessionGrant & { created: boolean }> {
            const reply = await request('POST', '/v1/apple', { body: input });
            return { ...grantFrom(reply), created: (reply.payload as { created?: unknown }).created === true };
        },

        async login(input: { email: string; password: string; locale: AccountLocale }): Promise<AccountSessionGrant> {
            return grantFrom(await request('POST', '/v1/login', { body: input }));
        },

        async logout(token: string): Promise<void> {
            await request('POST', '/v1/logout', { token, body: {} });
        },

        async requestVerification(input: { email?: string; locale: AccountLocale }, token?: string | null): Promise<AccountCodeSent> {
            return codeSentFrom(await request('POST', '/v1/email/verify', { token, body: input }));
        },

        /** Signed out, a right code also signs in; signed in, it only marks the address verified. */
        async confirmVerification(
            input: { email?: string; code: string },
            token?: string | null,
        ): Promise<{ grant: AccountSessionGrant | null; user: AccountUser }> {
            const reply = await request('POST', '/v1/email/verify/confirm', { token, body: input });
            const grant = parseGrant(reply.payload);
            return grant ? { grant, user: grant.user } : { grant: null, user: userFrom(reply) };
        },

        async requestPasswordReset(input: { email: string; locale: AccountLocale }): Promise<AccountCodeSent> {
            return codeSentFrom(await request('POST', '/v1/password/reset', { body: input }));
        },

        async confirmPasswordReset(input: { email: string; code: string; password: string }): Promise<AccountSessionGrant> {
            return grantFrom(await request('POST', '/v1/password/reset/confirm', { body: input }));
        },

        async changePassword(token: string, input: { currentPassword: string; password: string }): Promise<AccountSessionGrant> {
            return grantFrom(await request('POST', '/v1/password', { token, body: input }));
        },

        async updateProfile(token: string, input: { name: string }): Promise<AccountUser> {
            return userFrom(await request('PATCH', '/v1/account', { token, body: input }));
        },

        /** Confirmed with the password, or with a fresh Google or Apple token for an account without one. */
        async deleteAccount(token: string, input: AccountDeleteProof): Promise<void> {
            await request('DELETE', '/v1/account', { token, body: input });
        },

        async activity(token: string): Promise<AccountEvent[]> {
            return parseEvents((await request('GET', '/v1/account/activity', { token })).payload);
        },
    };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
