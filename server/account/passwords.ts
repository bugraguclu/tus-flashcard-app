import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/*
 * Password hashing with scrypt. A stored hash carries its own cost, so raising the cost later
 * only changes new hashes; `needsRehash` lets a successful sign-in upgrade an old one.
 */

export interface ScryptCost {
    N: number;
    r: number;
    p: number;
}

/** About 32 MiB and a few tens of milliseconds per check on a small server. */
export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 32768, r: 8, p: 1 };

const KEY_BYTES = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        // The same password typed with composed or decomposed letters (ş vs s + cedilla) must match.
        scrypt(password.normalize('NFC'), salt, KEY_BYTES, { ...cost, maxmem: MAX_MEMORY }, (error, key) => {
            if (error) reject(error);
            else resolve(key);
        });
    });
}

function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | null {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
    const cost = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
    // Bounds keep a damaged or hostile row from asking for gigabytes of memory.
    const sane = Number.isInteger(cost.N) && cost.N >= 2 && cost.N <= 2 ** 20 && (cost.N & (cost.N - 1)) === 0
        && Number.isInteger(cost.r) && cost.r >= 1 && cost.r <= 32
        && Number.isInteger(cost.p) && cost.p >= 1 && cost.p <= 16;
    if (!sane) return null;
    const salt = Buffer.from(parts[4], 'base64url');
    const key = Buffer.from(parts[5], 'base64url');
    if (salt.length < 8 || key.length !== KEY_BYTES) return null;
    return { cost, salt, key };
}

export class PasswordHasher {
    readonly cost: ScryptCost;
    private dummyHash: Promise<string> | null = null;

    constructor(cost: ScryptCost = DEFAULT_SCRYPT_COST) {
        this.cost = cost;
    }

    async hash(password: string): Promise<string> {
        const salt = randomBytes(SALT_BYTES);
        const key = await derive(password, salt, this.cost);
        return ['scrypt', this.cost.N, this.cost.r, this.cost.p, salt.toString('base64url'), key.toString('base64url')].join('$');
    }

    async verify(password: string, stored: string): Promise<boolean> {
        const parsed = parse(stored);
        if (!parsed) return false;
        const key = await derive(password, parsed.salt, parsed.cost);
        return timingSafeEqual(key, parsed.key);
    }

    /**
     * Spends the time of a real check when there is no account to check against, so a wrong
     * address and a wrong password take as long as each other.
     */
    async verifyAgainstNothing(password: string): Promise<false> {
        this.dummyHash ??= this.hash('tusankim-no-such-account');
        await this.verify(password, await this.dummyHash);
        return false;
    }

    needsRehash(stored: string): boolean {
        const parsed = parse(stored);
        return !parsed || parsed.cost.N !== this.cost.N || parsed.cost.r !== this.cost.r || parsed.cost.p !== this.cost.p;
    }
}
