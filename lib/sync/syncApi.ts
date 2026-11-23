import { AccountRequestError, errorFromReply } from '../accountApi';
import {
    SYNC_DEVICE_HEADER,
    SYNC_FORMAT,
    SYNC_WAIT_MS,
    type PullReply,
    type PushReply,
    type PushRequest,
    type SyncDeviceInfo,
    type SyncStateReply,
    type WaitReply,
} from '../syncContract';
import type { SyncTransport } from './syncRun';

/*
 * The sync endpoints over HTTP (server/account/sync.ts), with the account's bearer token and this
 * device's random id. Failures arrive as AccountRequestError with a code, never as raw exceptions.
 */

export interface SyncHttpOptions {
    baseUrl: string;
    clientLabel: string;
    deviceId: string;
    getToken: () => string | null;
    fetch?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 30_000;

export function createSyncTransport(options: SyncHttpOptions): SyncTransport & {
    devices(): Promise<SyncDeviceInfo[]>;
    removeDevice(dev: number): Promise<void>;
} {
    const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

    async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
        const token = options.getToken();
        if (!token) throw new AccountRequestError('unauthorized');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            let response: Response;
            try {
                response = await fetchImpl(`${options.baseUrl}${path}`, {
                    method,
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                        'X-Client': options.clientLabel,
                        [SYNC_DEVICE_HEADER]: options.deviceId,
                        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: controller.signal,
                });
            } catch {
                throw new AccountRequestError(controller.signal.aborted && !signal?.aborted ? 'timeout' : 'offline');
            }
            let payload: unknown = null;
            try {
                const text = await response.text();
                payload = text ? JSON.parse(text) : null;
            } catch {
                payload = null;
            }
            if (!response.ok) throw errorFromReply(response.status, payload, response.headers.get('Retry-After'));
            if (typeof payload !== 'object' || payload === null) throw new AccountRequestError('server_error', { status: response.status });
            return payload as T;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }

    return {
        state: () => request<SyncStateReply>('GET', `/v1/sync/state?format=${SYNC_FORMAT}`),
        push: (body: PushRequest) => request<PushReply>('POST', '/v1/sync/push', body, 60_000),
        pull: (since: number, cursor: string | null) => request<PullReply>(
            'GET',
            `/v1/sync/pull?since=${since}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            undefined,
            60_000,
        ),
        wait: (since: number, signal?: AbortSignal) => request<WaitReply>('GET', `/v1/sync/wait?since=${since}`, undefined, SYNC_WAIT_MS + 15_000, signal),
        devices: async () => (await request<{ devices: SyncDeviceInfo[] }>('GET', '/v1/sync/devices')).devices,
        removeDevice: async (dev: number) => {
            await request('DELETE', '/v1/sync/devices', { dev });
        },
    };
}
