import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_POLICY_VERSION } from '../../lib/accountContract.ts';
import { AppleTokens, verifyAppleIdToken } from './apple.ts';
import type { AppleTokenService } from './apple.ts';
import type { JsonWebKey, KeySource } from './idToken.ts';
import { AccountError } from './service.ts';
import { createHarness, PASSWORD, registration } from './testing.ts';

const BUNDLE_ID = 'com.tusankim.app';
const NOW = Date.UTC(2026, 10, 8, 9, 0, 0);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'apple-1', alg: 'RS256' } as JsonWebKey;
const keys: KeySource = { key: async (kid) => (kid === 'apple-1' ? PUBLIC_JWK : null) };

function b64(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A token shaped like Apple's: no name, and `email_verified` as a string. */
function appleToken(claims: Record<string, unknown> = {}): string {
    const now = Math.floor(NOW / 1000);
    const head = b64({ alg: 'RS256', kid: 'apple-1' });
    const body = b64({
        iss: 'https://appleid.apple.com',
        aud: BUNDLE_ID,
        sub: '001234.abcdef.1234',
        email: 'x7k2@privaterelay.appleid.com',
        email_verified: 'true',
        is_private_email: 'true',
        iat: now - 10,
        exp: now + 600,
        ...claims,
    });
    const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
    return `${head}.${body}.${signature}`;
}

async function accountFailure(work: () => unknown): Promise<AccountError> {
    try {
        await work();
    } catch (error) {
        if (error instanceof AccountError) return error;
        throw error;
    }
    throw new Error('expected an AccountError');
}

/** Records what the server asked Apple, and answers like Apple. */
function fakeAppleTokens(refreshToken: string | null = 'refresh-1') {
    const calls: string[] = [];
    const tokens: AppleTokenService = {
        exchange: async (code, clientId) => {
            calls.push(`exchange ${code} for ${clientId}`);
            return refreshToken;
        },
        revoke: async (token, clientId) => {
            calls.push(`revoke ${token} for ${clientId}`);
        },
    };
    return { calls, tokens };
}

describe('Apple identity token check', () => {
    it('accepts a token Apple signed for our app, with its string "true"', async () => {
        await expect(verifyAppleIdToken(appleToken(), { clientIds: [BUNDLE_ID], keys, now: NOW })).resolves.toEqual({
            subject: '001234.abcdef.1234',
            email: 'x7k2@privaterelay.appleid.com',
            emailVerified: true,
            name: '',
            audience: BUNDLE_ID,
        });
    });

    it('refuses a Google-issued token and another app’s token', async () => {
        await expect(verifyAppleIdToken(appleToken({ iss: 'https://accounts.google.com' }), { clientIds: [BUNDLE_ID], keys, now: NOW }))
            .rejects.toThrow('wrong issuer');
        await expect(verifyAppleIdToken(appleToken({ aud: 'com.other.app' }), { clientIds: [BUNDLE_ID], keys, now: NOW }))
            .rejects.toThrow('wrong audience');
    });
});

describe('Apple client secret', () => {
    it('is an ES256 JWT for our team and client, which Apple can check with the key', () => {
        const { privateKey: p8, publicKey: p8Public } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const tokens = new AppleTokens(
            { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: p8.export({ format: 'pem', type: 'pkcs8' }).toString() },
            undefined,
            () => NOW,
        );
        const [head, body, signature] = tokens.clientSecret(BUNDLE_ID).split('.');
        expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
        expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toEqual({
            iss: 'TEAM123456',
            iat: NOW / 1000,
            exp: NOW / 1000 + 300,
            aud: 'https://appleid.apple.com',
            sub: BUNDLE_ID,
        });
        const signed = verify('sha256', Buffer.from(`${head}.${body}`), { key: p8Public, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
        expect(signed).toBe(true);
    });

    it('trades a code and revokes a refresh token with form posts to Apple', async () => {
        const { privateKey: p8 } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const posts: Array<{ url: string; fields: URLSearchParams }> = [];
        const tokens = new AppleTokens(
            { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: p8.export({ format: 'pem', type: 'pkcs8' }).toString() },
            async (url, init) => {
                posts.push({ url, fields: new URLSearchParams(init.body) });
                return { ok: true, status: 200, json: async () => ({ refresh_token: 'refresh-9' }) };
            },
            () => NOW,
        );
        expect(await tokens.exchange('code-1', BUNDLE_ID)).toBe('refresh-9');
        await tokens.revoke('refresh-9', BUNDLE_ID);
        expect(posts.map((post) => post.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
        expect(posts[0].fields.get('grant_type')).toBe('authorization_code');
        expect(posts[0].fields.get('code')).toBe('code-1');
        expect(posts[1].fields.get('token')).toBe('refresh-9');
        expect(posts[1].fields.get('token_type_hint')).toBe('refresh_token');
        expect(posts[1].fields.get('client_secret')?.split('.')).toHaveLength(3);
    });
});

describe('Sign in with Apple', () => {
    const harness = (refreshToken?: string | null) => {
        const apple = fakeAppleTokens(refreshToken);
        return { ...createHarness({ appleClientIds: [BUNDLE_ID] }, { appleKeys: keys, appleTokens: apple.tokens }), apple };
    };
    const signIn = { identityToken: appleToken(), authorizationCode: 'code-1', name: 'Ayşe Yılmaz', consent: true, policyVersion: ACCOUNT_POLICY_VERSION };

    it('is off, and says so, without client IDs', async () => {
        const { service, context } = createHarness({}, { appleKeys: keys });
        expect(service.publicConfig().appleSignIn).toBe(false);
        expect((await accountFailure(() => service.appleSignIn(signIn, context))).code).toBe('not_found');
    });

    it('creates an account with the name the app passes on, then signs in to it without one', async () => {
        const { service, context, store, apple } = harness();
        expect(service.publicConfig().appleSignIn).toBe(true);
        expect((await accountFailure(() => service.appleSignIn({ ...signIn, consent: false }, context))).details.fields)
            .toEqual({ consent: 'consent_required' });

        const first = await service.appleSignIn(signIn, context);
        expect(first.created).toBe(true);
        expect(first.user).toMatchObject({
            email: 'x7k2@privaterelay.appleid.com', name: 'Ayşe Yılmaz', emailVerified: true, hasPassword: false, apple: true, google: false,
        });
        expect(apple.calls).toEqual([`exchange code-1 for ${BUNDLE_ID}`]);
        expect(store.appleGrant(first.user.id)).toEqual({ clientId: BUNDLE_ID, refreshToken: 'refresh-1' });

        const again = await service.appleSignIn({ identityToken: appleToken(), authorizationCode: 'code-2', name: '' }, context);
        expect(again.created).toBe(false);
        expect(again.user).toMatchObject({ id: first.user.id, name: 'Ayşe Yılmaz' });
    });

    it('links an existing account with the same address and keeps its password', async () => {
        const { service, context } = harness();
        const made = await service.register(registration(), context) as { user: { id: string } };
        const grant = await service.appleSignIn({ ...signIn, identityToken: appleToken({ email: 'ayse@example.com' }) }, context);
        expect(grant.user).toMatchObject({ id: made.user.id, apple: true, hasPassword: true, emailVerified: true });
        await expect(service.login({ email: 'ayse@example.com', password: PASSWORD }, context)).resolves.toBeTruthy();
    });

    it('still signs in when Apple refuses the code, and refuses tokens it did not sign', async () => {
        const { service, context, store } = harness(null);
        const grant = await service.appleSignIn(signIn, context);
        expect(store.appleGrant(grant.user.id)).toBeUndefined();
        expect((await accountFailure(() => service.appleSignIn({ ...signIn, identityToken: 'forged' }, context))).code).toBe('apple_failed');
        expect((await accountFailure(() => service.appleSignIn({ ...signIn, identityToken: appleToken({ email_verified: 'false' }) }, context))).code)
            .toBe('apple_failed');
    });

    it('deletes a password-less account with a fresh Apple token and revokes the access at Apple', async () => {
        const { service, context, store, apple } = harness();
        const grant = await service.appleSignIn(signIn, context);
        expect((await accountFailure(() => service.deleteAccount(grant.token, { appleIdentityToken: appleToken({ sub: 'someone-else' }) }))).code)
            .toBe('apple_failed');
        await service.deleteAccount(grant.token, { appleIdentityToken: appleToken() });
        expect(store.countUsers()).toBe(0);
        expect(apple.calls).toContain(`revoke refresh-1 for ${BUNDLE_ID}`);
    });

    it('revokes at Apple when a linked account is deleted with its password', async () => {
        const { service, context, apple } = harness();
        await service.register(registration(), context);
        const grant = await service.appleSignIn({ ...signIn, identityToken: appleToken({ email: 'ayse@example.com' }) }, context);
        await service.deleteAccount(grant.token, { password: PASSWORD });
        expect(apple.calls.at(-1)).toBe(`revoke refresh-1 for ${BUNDLE_ID}`);
    });
});
