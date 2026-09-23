import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cspHashSource, sha256Base64 } from './sha256';

const reference = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

describe('sha256Base64', () => {
    it('matches the standard digest across block boundaries', () => {
        for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
            const text = 'a'.repeat(length);
            expect(sha256Base64(text)).toBe(reference(text));
        }
    });

    it('hashes the UTF-8 encoding, as a browser does for an inline script', () => {
        for (const text of ['çalışma zamanı', 'ĞğİıŞş', '🧠 kart', ' line ']) {
            expect(sha256Base64(text)).toBe(reference(text));
        }
    });

    it('reproduces the Expo hydration hash already pinned in the web CSP', () => {
        // The one inline script Expo Router emits; its hash is hard-coded in app/+html.tsx.
        expect(cspHashSource('globalThis.__EXPO_ROUTER_HYDRATE__=true;'))
            .toBe("'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='");
    });
});
