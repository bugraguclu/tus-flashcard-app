import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CODE_LENGTH } from '../../lib/accountContract.ts';
import type { CodePurpose } from './store.ts';

/*
 * Session tokens are 256 random bits handed to the app once; the database keeps only their
 * SHA-256, so a leaked database cannot be replayed as sessions. Codes are kept as an HMAC keyed by
 * ACCOUNT_SECRET, because a six-digit code is cheap to brute-force from a bare hash.
 */

const TOKEN_BYTES = 32;
/** 32 bytes in unpadded base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isWellFormedToken(token: string): boolean {
    return TOKEN_PATTERN.test(token);
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newCode(): string {
    return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function hashCode(secret: string, purpose: CodePurpose, email: string, code: string): string {
    return createHmac('sha256', secret).update(`${purpose}\n${email}\n${code}`, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function newId(): string {
    return randomUUID();
}
