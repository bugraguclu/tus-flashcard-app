import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from './legalLinks';

describe('legal links', () => {
    it('open the same pages the App Store listing names', () => {
        const metadata = readFileSync('docs/app-store/metadata-tr.md', 'utf8');
        expect(metadata).toContain(`Gizlilik: \`${PRIVACY_URL}\``);
        expect(metadata).toContain(`Destek: \`${SUPPORT_URL}\``);
        expect(metadata).toContain(`Koşullar: \`${TERMS_URL}\``);
    });

    it('point at pages the website builds', () => {
        for (const [url, page] of [[PRIVACY_URL, 'gizlilik'], [SUPPORT_URL, 'destek'], [TERMS_URL, 'kullanim-kosullari']]) {
            expect(new URL(url).pathname).toBe(`/${page}/`);
            expect(() => readFileSync(`website/src/pages/${page}.astro`)).not.toThrow();
        }
    });
});
