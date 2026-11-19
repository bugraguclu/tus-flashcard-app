import { describe, expect, it, vi } from 'vitest';
import { AccountRequestError, createAccountClient } from './accountApi';

const user = { id: 'u1', name: 'Ayşe Yılmaz', email: 'ayse@example.com', emailVerified: false, createdAt: '2026-11-08T10:00:00.000Z', hasPassword: true, google: false, apple: false };
const grant = { user, token: 't'.repeat(43), expiresAt: '2027-01-07T10:00:00.000Z' };
const config = {
    registrationOpen: true,
    emailReady: true,
    emailVerificationRequired: false,
    googleSignIn: false,
    appleSignIn: false,
    policyVersion: '2026-11-08',
    operatorName: 'TusAnkiM',
    contactEmail: 'destek@example.com',
};

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name: string) => headers[name] ?? null },
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
}

function client(fetchImpl: ReturnType<typeof vi.fn>, timeoutMs = 1000) {
    return createAccountClient({ baseUrl: 'https://hesap.example.com', clientLabel: 'TusAnkiM test', fetch: fetchImpl as never, timeoutMs });
}

async function failure(promise: Promise<unknown>): Promise<AccountRequestError> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(AccountRequestError);
        return error as AccountRequestError;
    }
    throw new Error('expected the call to fail');
}

describe('account client requests', () => {
    it('sends JSON with the bearer token and client label, and reads the grant', async () => {
        const fetchImpl = vi.fn(async () => reply(200, grant));
        const result = await client(fetchImpl).changePassword('secret-token', { currentPassword: 'a', password: 'b' });
        expect(result).toEqual(grant);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
        expect(url).toBe('https://hesap.example.com/v1/password');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer secret-token');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(init.headers['X-Client']).toBe('TusAnkiM test');
        expect(JSON.parse(init.body)).toEqual({ currentPassword: 'a', password: 'b' });
    });

    it('reads a signed-out session and a signed-in one', async () => {
        const signedOut = await client(vi.fn(async () => reply(200, { config, user: null }))).session(null);
        expect(signedOut).toEqual({ config, user: null });
        const fetchImpl = vi.fn(async () => reply(200, { config, user }));
        expect((await client(fetchImpl).session('tok')).user).toEqual(user);
        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body?: string }];
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('tells a registration that signs in from one that waits for a code', async () => {
        const signedIn = await client(vi.fn(async () => reply(201, { ...grant, verificationSent: true }))).register({
            name: 'Ayşe', email: 'ayse@example.com', password: 'Kalp-Kapak-9', consent: true, policyVersion: '2026-11-08', locale: 'tr',
        });
        expect(signedIn).toEqual({ ...grant, verificationSent: true });
        const waiting = await client(vi.fn(async () => reply(201, { verificationRequired: true, email: 'ayse@example.com' }))).register({
            name: 'Ayşe', email: 'ayse@example.com', password: 'Kalp-Kapak-9', consent: true, policyVersion: '2026-11-08', locale: 'tr',
        });
        expect(waiting).toEqual({ verificationRequired: true, email: 'ayse@example.com' });
    });

    it('returns a grant from a signed-out verification and only the user from a signed-in one', async () => {
        expect(await client(vi.fn(async () => reply(200, grant))).confirmVerification({ email: 'a@b.co', code: '123456' }))
            .toEqual({ grant, user });
        expect(await client(vi.fn(async () => reply(200, { user: { ...user, emailVerified: true } }))).confirmVerification({ code: '123456' }, 'tok'))
            .toEqual({ grant: null, user: { ...user, emailVerified: true } });
    });
});

describe('account client failures', () => {
    it('keeps the server code, field problems and the address to verify', async () => {
        const error = await failure(client(vi.fn(async () => reply(403, {
            error: { code: 'unverified', message: 'Önce doğrulayın', email: 'ayse@example.com', fields: { email: 'email_invalid', bogus: 'x' } },
        }))).login({ email: 'ayse@example.com', password: 'x', locale: 'tr' }));
        expect(error.code).toBe('unverified');
        expect(error.status).toBe(403);
        expect(error.email).toBe('ayse@example.com');
        expect(error.fields).toEqual({ email: 'email_invalid' });
    });

    it('falls back to the HTTP status when the code is unknown or the body is not JSON', async () => {
        expect((await failure(client(vi.fn(async () => reply(401, { error: { code: 'whatever' } }))).session('tok'))).code).toBe('unauthorized');
        expect((await failure(client(vi.fn(async () => reply(502, '<html>Bad gateway</html>'))).session())).code).toBe('server_error');
    });

    it('takes the wait from the body or from Retry-After', async () => {
        expect((await failure(client(vi.fn(async () => reply(429, { error: { code: 'rate_limited', retryAfter: 42 } }))).session())).retryAfter).toBe(42);
        expect((await failure(client(vi.fn(async () => reply(429, {}, { 'Retry-After': '17' }))).session())).retryAfter).toBe(17);
    });

    it('reports no network as offline and a silent server as a timeout', async () => {
        expect((await failure(client(vi.fn(async () => {
            throw new TypeError('Network request failed');
        })).session())).code).toBe('offline');
        const hanging = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }));
        expect((await failure(client(hanging, 20).session())).code).toBe('timeout');
    });

    it('treats a successful reply of the wrong shape as a server error, never as half a user', async () => {
        expect((await failure(client(vi.fn(async () => reply(200, { user: { id: 1 }, token: 'x' }))).login({ email: 'a@b.co', password: 'x', locale: 'tr' }))).code)
            .toBe('server_error');
        expect((await failure(client(vi.fn(async () => reply(200, ''))).session())).code).toBe('server_error');
    });

    it('does not reach for the network when no server is configured', async () => {
        const fetchImpl = vi.fn();
        const offline = createAccountClient({ baseUrl: null, clientLabel: 'x', fetch: fetchImpl as never });
        expect((await failure(offline.session())).code).toBe('not_configured');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
