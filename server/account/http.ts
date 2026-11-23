import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountErrorBody } from '../../lib/accountContract.ts';
import type { ServerConfig } from './config.ts';
import type { Logger } from './mailer.ts';
import { AccountError } from './service.ts';
import type { AccountService, RequestBody, RequestContext } from './service.ts';
import { SYNC_DEVICE_HEADER, SYNC_MAX_BODY_BYTES } from '../../lib/syncContract.ts';
import type { SyncService } from './sync.ts';

/*
 * HTTP in front of `AccountService`: routing, JSON in and out, CORS for the web build, and the
 * headers every response carries. Business rules stay in the service.
 */

export const MAX_BODY_BYTES = 16 * 1024;
const CLIENT_LABEL_LIMIT = 60;
const ALLOWED_HEADERS = `authorization, content-type, x-client, ${SYNC_DEVICE_HEADER}`;
/** Paths whose bodies may be as large as a sync part; the account endpoints keep 16 KB. */
const LARGE_BODY_PATHS = new Set(['/v1/sync/push']);

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Call {
    body: RequestBody;
    token: string | null;
    context: RequestContext;
    query: URLSearchParams;
    /** The sync device id header, when sent. */
    device: string | null;
    /** Aborted when the client goes away (long polls stop waiting). */
    signal: AbortSignal;
}

interface Outcome {
    status?: number;
    body: unknown;
}

type Handler = (call: Call) => Outcome | Promise<Outcome>;

type HttpSettings = Pick<ServerConfig, 'allowedOrigins' | 'allowLocalOrigins' | 'trustProxy'>;

function syncRoutes(service: AccountService, sync: SyncService): Array<[string, Partial<Record<Method, Handler>>]> {
    const user = (token: string | null, kind: 'push' | 'pull' | 'wait') => {
        const id = service.authenticatedUserId(token);
        service.limitSync(id, kind);
        return id;
    };
    return [
        ['/v1/sync/state', {
            GET: ({ token, device, context, query }) => ({
                body: sync.state(user(token, 'pull'), device, context.client, Number(query.get('format') ?? 0)),
            }),
        }],
        ['/v1/sync/push', { POST: ({ token, device, body }) => ({ body: sync.push(user(token, 'push'), device, body) }) }],
        ['/v1/sync/pull', {
            GET: ({ token, device, query }) => ({ body: sync.pull(user(token, 'pull'), device, query.get('since'), query.get('cursor')) }),
        }],
        ['/v1/sync/wait', {
            GET: async ({ token, device, query, signal }) => ({ body: await sync.wait(user(token, 'wait'), device, query.get('since'), signal) }),
        }],
        ['/v1/sync/devices', {
            GET: ({ token, device }) => ({ body: sync.devices(service.authenticatedUserId(token), device) }),
            DELETE: ({ token, body }) => ({ body: sync.removeDevice(service.authenticatedUserId(token), Number(body.dev)) }),
        }],
    ];
}

function routesFor(service: AccountService, sync: SyncService | null): Map<string, Partial<Record<Method, Handler>>> {
    return new Map<string, Partial<Record<Method, Handler>>>([
        ...(sync ? syncRoutes(service, sync) : []),
        ['/v1/health', { GET: () => ({ body: { ok: true } }) }],
        ['/v1/session', { GET: ({ token }) => ({ body: service.sessionInfo(token) }) }],
        ['/v1/register', { POST: async ({ body, context }) => ({ status: 201, body: await service.register(body, context) }) }],
        ['/v1/login', { POST: async ({ body, context }) => ({ body: await service.login(body, context) }) }],
        ['/v1/google', { POST: async ({ body, context }) => ({ body: await service.googleSignIn(body, context) }) }],
        ['/v1/apple', { POST: async ({ body, context }) => ({ body: await service.appleSignIn(body, context) }) }],
        ['/v1/logout', { POST: ({ token }) => ({ body: service.logout(token) }) }],
        ['/v1/email/verify', {
            POST: async ({ body, token, context }) => ({ body: await service.requestVerification(body, token, context) }),
        }],
        ['/v1/email/verify/confirm', {
            POST: async ({ body, token, context }) => ({ body: await service.confirmVerification(body, token, context) }),
        }],
        ['/v1/password/reset', { POST: async ({ body, context }) => ({ body: await service.requestPasswordReset(body, context) }) }],
        ['/v1/password/reset/confirm', {
            POST: async ({ body, context }) => ({ body: await service.confirmPasswordReset(body, context) }),
        }],
        ['/v1/password', { POST: async ({ body, token, context }) => ({ body: await service.changePassword(token, body, context) }) }],
        ['/v1/account', {
            PATCH: ({ body, token }) => ({ body: service.updateProfile(token, body) }),
            DELETE: async ({ body, token }) => ({ body: await service.deleteAccount(token, body) }),
        }],
        ['/v1/account/activity', { GET: ({ token }) => ({ body: service.activity(token) }) }],
    ]);
}

export function isAllowedOrigin(origin: string, settings: Pick<HttpSettings, 'allowedOrigins' | 'allowLocalOrigins'>): boolean {
    if (settings.allowedOrigins.includes(origin)) return true;
    if (!settings.allowLocalOrigins) return false;
    try {
        const url = new URL(origin);
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
        return local && (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin;
    } catch {
        return false;
    }
}

/** `null` when there is no Authorization header; `''` when it is not a bearer token. */
export function bearerToken(header: string | undefined): string | null {
    if (header === undefined) return null;
    const match = /^Bearer[ \t]+([^\s]+)[ \t]*$/i.exec(header);
    return match ? match[1] : '';
}

export function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
    if (trustProxy) {
        const header = request.headers['x-forwarded-for'];
        const value = Array.isArray(header) ? header.join(',') : header ?? '';
        const hops = value.split(',').map((hop) => hop.trim()).filter(Boolean);
        // The proxy we trust appends the address it saw; anything to its left the client wrote.
        if (hops.length) return hops[hops.length - 1];
    }
    return request.socket.remoteAddress ?? 'unknown';
}

function clientLabel(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return null;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CLIENT_LABEL_LIMIT);
    return clean || null;
}

function readBody(request: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<RequestBody> {
    return new Promise((resolve, reject) => {
        const declared = Number(request.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
            reject(new AccountError('payload_too_large', 413));
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        request.on('data', (chunk: Buffer) => {
            if (settled) return;
            size += chunk.length;
            if (size > maxBytes) {
                settled = true;
                reject(new AccountError('payload_too_large', 413));
                return;
            }
            chunks.push(chunk);
        });
        request.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        });
        request.on('end', () => {
            if (settled) return;
            settled = true;
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }
            const type = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (type !== 'application/json') {
                reject(new AccountError('invalid_input', 415, 'İstek gövdesi JSON olmalı.'));
                return;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                reject(new AccountError('invalid_input', 400, 'İstek gövdesi okunamadı.'));
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                reject(new AccountError('invalid_input', 400, 'İstek gövdesi bir JSON nesnesi olmalı.'));
                return;
            }
            resolve(parsed as RequestBody);
        });
    });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(payload));
    response.end(payload);
}

function sendError(response: ServerResponse, error: AccountError): void {
    const { fields, retryAfter, email } = error.details;
    const body: AccountErrorBody = {
        error: {
            code: error.code,
            message: error.message,
            ...(fields && Object.keys(fields).length ? { fields } : {}),
            ...(retryAfter ? { retryAfter } : {}),
            ...(email ? { email } : {}),
        },
    };
    if (error.status === 429 && retryAfter) response.setHeader('Retry-After', String(retryAfter));
    // The rest of an oversized body is not read; the connection cannot carry another request.
    if (error.status === 413) response.setHeader('Connection', 'close');
    sendJson(response, error.status, body);
}

function setCommonHeaders(response: ServerResponse): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

export function createAccountHandler(
    service: AccountService,
    settings: HttpSettings,
    log: Logger,
    sync: SyncService | null = null,
): (request: IncomingMessage, response: ServerResponse) => void {
    const routes = routesFor(service, sync);

    async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        setCommonHeaders(response);
        response.setHeader('Vary', 'Origin');
        const origin = request.headers.origin;
        const corsAllowed = typeof origin === 'string' && isAllowedOrigin(origin, settings);
        if (corsAllowed) response.setHeader('Access-Control-Allow-Origin', origin);

        const url = new URL(request.url ?? '/', 'http://account.invalid');
        const path = url.pathname.replace(/\/+$/, '') || '/';
        const route = routes.get(path);
        const method = (request.method ?? 'GET').toUpperCase();

        if (method === 'OPTIONS') {
            if (!route) throw new AccountError('not_found', 404);
            if (corsAllowed) {
                response.setHeader('Access-Control-Allow-Methods', [...Object.keys(route), 'OPTIONS'].join(', '));
                response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
                response.setHeader('Access-Control-Max-Age', '600');
            }
            response.statusCode = 204;
            response.end();
            return;
        }

        if (!route) throw new AccountError('not_found', 404);
        const handler = route[method as Method];
        if (!handler) {
            response.setHeader('Allow', [...Object.keys(route), 'OPTIONS'].join(', '));
            throw new AccountError('not_found', 405, 'Bu adres bu yöntemi desteklemiyor.');
        }

        const body = method === 'GET' ? {} : await readBody(request, LARGE_BODY_PATHS.has(path) ? SYNC_MAX_BODY_BYTES : MAX_BODY_BYTES);
        const gone = new AbortController();
        response.on('close', () => gone.abort());
        const deviceHeader = request.headers[SYNC_DEVICE_HEADER];
        const outcome = await handler({
            body,
            token: bearerToken(request.headers.authorization),
            context: {
                ip: clientAddress(request, settings.trustProxy),
                client: clientLabel(request.headers['x-client']),
            },
            query: url.searchParams,
            device: (Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader) ?? null,
            signal: gone.signal,
        });
        if (response.destroyed) return;
        sendJson(response, outcome.status ?? 200, outcome.body);
    }

    return (request, response) => {
        handle(request, response).catch((error: unknown) => {
            if (response.headersSent) {
                response.destroy();
                return;
            }
            if (error instanceof AccountError) {
                sendError(response, error);
                return;
            }
            // Never the body: it may hold a password.
            log.error(`[account] ${request.method} ${request.url} failed`, error);
            sendError(response, new AccountError('server_error', 500));
        });
    };
}
