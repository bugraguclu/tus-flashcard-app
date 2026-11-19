import { createPublicKey, verify as verifySignature } from 'node:crypto';

/*
 * OpenID Connect ID tokens, as "Sign in with Google" and "Sign in with Apple" hand them to the app.
 * The server checks each one itself: an RS256 signature by one of the provider's published keys,
 * the provider as issuer, one of our client IDs as audience, and a lifetime that has not run out.
 * No provider library, and no call to the provider per sign-in beyond its key list.
 */

/** One RSA key from a provider's list, as JSON Web Key fields. */
export interface JsonWebKey {
    kty?: string;
    kid?: string;
    n?: string;
    e?: string;
    alg?: string;
    use?: string;
}

export interface IdTokenIdentity {
    /** The provider's stable account ID (`sub`); an address can change, this cannot. */
    subject: string;
    email: string;
    emailVerified: boolean;
    /** Empty when the provider does not put a name in the token (Apple never does). */
    name: string;
    /** The client ID the token was issued to. */
    audience: string;
}

export interface KeySource {
    /** The public key the provider signed with, or null when it is not (or no longer) published. */
    key(kid: string): Promise<JsonWebKey | null>;
}

export class IdTokenError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = 'IdTokenError';
    }
}

/** Clocks on phones and servers drift; Google's own libraries allow five minutes. */
const CLOCK_SKEW_MS = 5 * 60_000;
const KEY_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_KEY_LIFETIME_MS = 60 * 60_000;

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

/** A provider's key list, kept for as long as its Cache-Control allows and fetched again on a miss. */
export class JwksKeys implements KeySource {
    private keys = new Map<string, JsonWebKey>();
    private expiresAt = 0;
    private loading: Promise<void> | null = null;
    // Plain fields, not constructor parameter properties: Node runs this file by stripping types.
    private readonly url: string;
    private readonly fetchImpl: FetchLike;
    private readonly now: () => number;

    constructor(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, now: () => number = Date.now) {
        this.url = url;
        this.fetchImpl = fetchImpl;
        this.now = now;
    }

    async key(kid: string): Promise<JsonWebKey | null> {
        if (this.now() >= this.expiresAt || !this.keys.has(kid)) await this.refresh();
        return this.keys.get(kid) ?? null;
    }

    private refresh(): Promise<void> {
        this.loading ??= this.load().finally(() => {
            this.loading = null;
        });
        return this.loading;
    }

    private async load(): Promise<void> {
        const response = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(KEY_FETCH_TIMEOUT_MS) });
        if (!response.ok) throw new IdTokenError('signing keys could not be loaded');
        const body = await response.json() as { keys?: unknown };
        const next = new Map<string, JsonWebKey>();
        for (const entry of Array.isArray(body.keys) ? body.keys : []) {
            const jwk = entry as JsonWebKey;
            if (typeof jwk.kid === 'string' && jwk.kty === 'RSA') next.set(jwk.kid, jwk);
        }
        const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
        this.keys = next;
        this.expiresAt = this.now() + (maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_KEY_LIFETIME_MS);
    }
}

function decodeJson(part: string): Record<string, unknown> {
    try {
        const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
        // Falls through to the error below.
    }
    throw new IdTokenError('malformed token');
}

/** Checks an ID token and returns who it names; throws IdTokenError otherwise. */
export async function verifyIdToken(
    token: string,
    options: { issuers: ReadonlySet<string>; clientIds: readonly string[]; keys: KeySource; now: number },
): Promise<IdTokenIdentity> {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 8192) throw new IdTokenError('malformed token');
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new IdTokenError('unexpected algorithm');

    const jwk = await options.keys.key(header.kid);
    if (!jwk) throw new IdTokenError('unknown signing key');
    const signed = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        createPublicKey({ key: { kty: 'RSA', n: jwk.n ?? '', e: jwk.e ?? '' }, format: 'jwk' }),
        Buffer.from(signaturePart, 'base64url'),
    );
    if (!signed) throw new IdTokenError('bad signature');

    const claims = decodeJson(payloadPart);
    if (typeof claims.iss !== 'string' || !options.issuers.has(claims.iss)) throw new IdTokenError('wrong issuer');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const audience = audiences.find((entry): entry is string => typeof entry === 'string' && options.clientIds.includes(entry));
    if (!audience) throw new IdTokenError('wrong audience');
    const expires = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
    const issued = typeof claims.iat === 'number' ? claims.iat * 1000 : Number.POSITIVE_INFINITY;
    if (expires + CLOCK_SKEW_MS <= options.now) throw new IdTokenError('expired');
    if (issued - CLOCK_SKEW_MS > options.now) throw new IdTokenError('issued in the future');
    if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email) {
        throw new IdTokenError('missing account');
    }
    return {
        subject: claims.sub,
        email: claims.email,
        // Google sends a boolean; Apple sends the string "true".
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
        name: typeof claims.name === 'string' ? claims.name : '',
        audience,
    };
}
