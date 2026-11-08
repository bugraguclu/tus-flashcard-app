import { createServer, request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { bearerToken, clientAddress, createAccountHandler, isAllowedOrigin, MAX_BODY_BYTES } from './http.ts';
import type { Logger } from './mailer.ts';
import { hashToken } from './secrets.ts';
import { createHarness, PASSWORD, registration } from './testing.ts';

interface Reply {
    status: number;
    headers: IncomingHttpHeaders;
    body: any;
}

const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(options: { allowedOrigins?: string[]; allowLocalOrigins?: boolean; trustProxy?: boolean } = {}) {
    const harness = createHarness();
    const logged: string[] = [];
    const log: Logger = {
        info: (message) => logged.push(message),
        warn: (message) => logged.push(message),
        error: (message, error) => logged.push(`${message} ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`),
    };
    const server = createServer(createAccountHandler(harness.service, {
        allowedOrigins: options.allowedOrigins ?? ['https://app.example.com'],
        allowLocalOrigins: options.allowLocalOrigins ?? false,
        trustProxy: options.trustProxy ?? false,
    }, log));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    function call(method: string, path: string, init: { headers?: Record<string, string>; body?: string | object } = {}): Promise<Reply> {
        const payload = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
        const headers: Record<string, string> = {
            ...(typeof init.body === 'object' ? { 'content-type': 'application/json' } : {}),
            ...(payload === undefined ? {} : { 'content-length': String(Buffer.byteLength(payload)) }),
            ...init.headers,
        };
        return new Promise((resolve, reject) => {
            const outgoing = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response: IncomingMessage) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve({ status: response.statusCode ?? 0, headers: response.headers, body: text ? JSON.parse(text) : null });
                });
            });
            outgoing.on('error', reject);
            if (payload !== undefined) outgoing.write(payload);
            outgoing.end();
        });
    }

    /** A body over the limit that the server must refuse before reading all of it. */
    function oversized(kind: 'declared' | 'streamed'): Promise<Reply> {
        return new Promise((resolve, reject) => {
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (kind === 'declared') headers['content-length'] = String(MAX_BODY_BYTES + 1);
            const outgoing = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/v1/login', headers }, (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    resolve({ status: response.statusCode ?? 0, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
                    outgoing.destroy();
                });
            });
            outgoing.on('error', reject);
            // Nothing more is sent after this, so the server's refusal is not raced by our own bytes.
            if (kind === 'declared') outgoing.flushHeaders();
            else outgoing.write('x'.repeat(MAX_BODY_BYTES + 1));
        });
    }

    return { ...harness, call, oversized, logged };
}

describe('routing and responses', () => {
    it('answers health checks with the security headers every response carries', async () => {
        const { call } = await start();
        const reply = await call('GET', '/v1/health');
        expect(reply.status).toBe(200);
        expect(reply.body).toEqual({ ok: true });
        expect(reply.headers['cache-control']).toBe('no-store');
        expect(reply.headers['x-content-type-options']).toBe('nosniff');
        expect(reply.headers['referrer-policy']).toBe('no-referrer');
        expect(reply.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
        expect(reply.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(reply.headers.vary).toBe('Origin');
        expect((await call('GET', '/v1/health/?probe=1')).status).toBe(200);
    });

    it('gives unknown paths a 404 and known paths with the wrong method a 405', async () => {
        const { call } = await start();
        const missing = await call('GET', '/v1/nope');
        expect(missing.status).toBe(404);
        expect(missing.body).toEqual({ error: { code: 'not_found', message: expect.any(String) } });

        const wrongMethod = await call('DELETE', '/v1/session');
        expect(wrongMethod.status).toBe(405);
        expect(wrongMethod.headers.allow).toBe('GET, OPTIONS');
        expect(wrongMethod.body.error.code).toBe('not_found');
    });

    it('accepts JSON objects only', async () => {
        const { call } = await start();
        const form = await call('POST', '/v1/login', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
        expect(form.status).toBe(415);
        expect(form.body.error.code).toBe('invalid_input');

        const broken = await call('POST', '/v1/login', { headers: { 'content-type': 'application/json' }, body: '{"email":' });
        expect(broken.status).toBe(400);

        const list = await call('POST', '/v1/login', { body: ['ayse@example.com'] });
        expect(list.status).toBe(400);
        expect(list.body.error.code).toBe('invalid_input');

        const charset = await call('POST', '/v1/login', {
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ email: 'ayse', password: '' }),
        });
        expect(charset.status).toBe(400);
        expect(charset.body.error.fields).toEqual({ email: 'email_invalid', password: 'required' });
    });

    it('refuses bodies over 16 KB, declared or streamed', async () => {
        const { oversized } = await start();
        const declared = await oversized('declared');
        expect(declared.status).toBe(413);
        expect(declared.body.error.code).toBe('payload_too_large');
        expect(declared.headers.connection).toBe('close');

        const streamed = await oversized('streamed');
        expect(streamed.status).toBe(413);
        expect(streamed.body.error.code).toBe('payload_too_large');
    });

    it('treats an empty body as an empty object', async () => {
        const { call } = await start();
        const reply = await call('POST', '/v1/logout');
        expect(reply.status).toBe(200);
        expect(reply.body).toEqual({});
    });

    it('turns unexpected failures into a 500 without logging the request body', async () => {
        const { call, store, logged } = await start();
        store.close();
        const reply = await call('POST', '/v1/login', { body: { email: 'ayse@example.com', password: PASSWORD } });
        expect(reply.status).toBe(500);
        expect(reply.body.error.code).toBe('server_error');
        expect(logged.join('\n')).toContain('POST /v1/login failed');
        expect(logged.join('\n')).not.toContain(PASSWORD);
    });
});

describe('accounts over HTTP', () => {
    it('registers with 201, labels the session and reads it back with the bearer token', async () => {
        const { call, store } = await start();
        const created = await call('POST', '/v1/register', { headers: { 'x-client': 'TusAnkiM iOS' }, body: registration() });
        expect(created.status).toBe(201);
        expect(created.body.user.email).toBe('ayse@example.com');
        expect(store.findSession(hashToken(created.body.token))?.client).toBe('TusAnkiM iOS');

        const long = await call('POST', '/v1/login', { headers: { 'x-client': 'x'.repeat(100) }, body: { email: 'ayse@example.com', password: PASSWORD } });
        expect(store.findSession(hashToken(long.body.token))?.client).toBe('x'.repeat(60));

        const session = await call('GET', '/v1/session', { headers: { authorization: `Bearer ${created.body.token}` } });
        expect(session.status).toBe(200);
        expect(session.body.user.id).toBe(created.body.user.id);
        expect(session.body.config.registrationOpen).toBe(true);

        const lowercase = await call('GET', '/v1/session', { headers: { authorization: `bearer ${created.body.token}` } });
        expect(lowercase.body.user.id).toBe(created.body.user.id);

        const basic = await call('GET', '/v1/session', { headers: { authorization: 'Basic YXlzZTpzaWZyZQ==' } });
        expect(basic.status).toBe(401);
        expect(basic.body.error.code).toBe('unauthorized');

        const anonymous = await call('GET', '/v1/session');
        expect(anonymous.body.user).toBeNull();

        const activity = await call('GET', '/v1/account/activity', { headers: { authorization: `Bearer ${created.body.token}` } });
        // Newest first: the explicit sign-in above, the one registration made, then the account itself.
        expect(activity.body.events.map((event: { type: string }) => event.type)).toEqual(['signed_in', 'signed_in', 'account_created']);
    });

    it('carries field issues in the error body', async () => {
        const { call } = await start();
        const invalid = await call('POST', '/v1/register', { body: registration({ password: 'password123' }) });
        expect(invalid.status).toBe(400);
        expect(invalid.body.error).toEqual({ code: 'invalid_input', message: expect.any(String), fields: { password: 'password_common' } });
    });

    it('sends Retry-After with a 429', async () => {
        const { call } = await start();
        await call('POST', '/v1/register', { body: registration() });
        let reply: Reply | null = null;
        for (let attempt = 0; attempt < 11; attempt += 1) {
            reply = await call('POST', '/v1/login', { body: { email: 'ayse@example.com', password: 'yanlis-sifre-99' } });
        }
        expect(reply?.status).toBe(429);
        expect(reply?.body.error.code).toBe('rate_limited');
        expect(Number(reply?.headers['retry-after'])).toBe(reply?.body.error.retryAfter);
        expect(reply?.body.error.retryAfter).toBeGreaterThan(0);
    });

    it('runs the whole password-reset flow', async () => {
        const { call, mailer } = await start();
        const created = await call('POST', '/v1/register', { body: registration() });
        const requested = await call('POST', '/v1/password/reset', { body: { email: 'ayse@example.com', locale: 'en' } });
        expect(requested.body).toEqual({ sent: true, retryAfter: 60 });
        const reset = await call('POST', '/v1/password/reset/confirm', {
            body: { email: 'ayse@example.com', code: mailer.lastCode('reset'), password: 'yesil-armut-77' },
        });
        expect(reset.status).toBe(200);
        expect(reset.body.token).toBeTruthy();
        const old = await call('GET', '/v1/session', { headers: { authorization: `Bearer ${created.body.token}` } });
        expect(old.status).toBe(401);
    });

    it('renames and deletes through PATCH and DELETE /v1/account', async () => {
        const { call } = await start();
        const created = await call('POST', '/v1/register', { body: registration() });
        const auth = { authorization: `Bearer ${created.body.token}` };
        const renamed = await call('PATCH', '/v1/account', { headers: auth, body: { name: 'Ayşe Nur' } });
        expect(renamed.body.user.name).toBe('Ayşe Nur');
        const refused = await call('DELETE', '/v1/account', { headers: auth, body: { password: 'yanlis-sifre-99' } });
        expect(refused.status).toBe(400);
        expect(refused.body.error).toMatchObject({ code: 'wrong_password', fields: { password: 'password_wrong' } });
        const deleted = await call('DELETE', '/v1/account', { headers: auth, body: { password: PASSWORD } });
        expect(deleted.status).toBe(200);
        expect((await call('GET', '/v1/session', { headers: auth })).status).toBe(401);
    });
});

describe('CORS', () => {
    it('names only allowed origins', async () => {
        const { call } = await start();
        const allowed = await call('GET', '/v1/health', { headers: { origin: 'https://app.example.com' } });
        expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
        const other = await call('GET', '/v1/health', { headers: { origin: 'https://evil.example' } });
        expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight requests', async () => {
        const { call } = await start();
        const preflight = await call('OPTIONS', '/v1/account', {
            headers: { origin: 'https://app.example.com', 'access-control-request-method': 'DELETE' },
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers['access-control-allow-methods']).toBe('PATCH, DELETE, OPTIONS');
        expect(preflight.headers['access-control-allow-headers']).toBe('authorization, content-type, x-client');
        expect(preflight.headers['access-control-max-age']).toBe('600');

        const stranger = await call('OPTIONS', '/v1/account', { headers: { origin: 'https://evil.example' } });
        expect(stranger.status).toBe(204);
        expect(stranger.headers['access-control-allow-methods']).toBeUndefined();

        expect((await call('OPTIONS', '/v1/unknown', { headers: { origin: 'https://app.example.com' } })).status).toBe(404);
    });

    it('accepts any local port in development only', async () => {
        const development = { allowedOrigins: [], allowLocalOrigins: true };
        expect(isAllowedOrigin('http://localhost:8081', development)).toBe(true);
        expect(isAllowedOrigin('http://127.0.0.1:19006', development)).toBe(true);
        expect(isAllowedOrigin('http://[::1]:8081', development)).toBe(true);
        expect(isAllowedOrigin('http://localhost.evil.example', development)).toBe(false);
        expect(isAllowedOrigin('http://localhost:8081/path', development)).toBe(false);
        expect(isAllowedOrigin('null', development)).toBe(false);
        expect(isAllowedOrigin('http://localhost:8081', { allowedOrigins: [], allowLocalOrigins: false })).toBe(false);

        const { call } = await start({ allowedOrigins: [], allowLocalOrigins: true });
        const reply = await call('GET', '/v1/health', { headers: { origin: 'http://localhost:8081' } });
        expect(reply.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    });
});

describe('request details', () => {
    it('reads bearer tokens', () => {
        expect(bearerToken(undefined)).toBeNull();
        expect(bearerToken('Bearer abc')).toBe('abc');
        expect(bearerToken('bearer   abc  ')).toBe('abc');
        expect(bearerToken('Basic abc')).toBe('');
        expect(bearerToken('Bearer')).toBe('');
        expect(bearerToken('Bearer a b')).toBe('');
    });

    it('takes the client address from the trusted proxy only when told to', () => {
        const request = (forwarded?: string) => ({
            headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
            socket: { remoteAddress: '172.17.0.1' },
        }) as unknown as IncomingMessage;
        expect(clientAddress(request('1.1.1.1, 203.0.113.5'), false)).toBe('172.17.0.1');
        expect(clientAddress(request('1.1.1.1, 203.0.113.5'), true)).toBe('203.0.113.5');
        expect(clientAddress(request(), true)).toBe('172.17.0.1');
    });
});
