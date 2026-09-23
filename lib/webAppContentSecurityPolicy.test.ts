import { describe, expect, it } from 'vitest';
import { RICH_TEXT_EDITOR_SCRIPT } from './richTextEditorScript';
import { cspHashSource } from './sha256';
import { WEB_APP_DEVELOPMENT_CSP, WEB_APP_PRODUCTION_CSP } from './webAppContentSecurityPolicy';

function directive(policy: string, name: string): string {
    return policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';
}

describe('web app content security policy', () => {
    it('lets the rich text field script run in production, and no other inline script', () => {
        const scriptSrc = directive(WEB_APP_PRODUCTION_CSP, 'script-src');
        expect(scriptSrc).toContain(cspHashSource(RICH_TEXT_EDITOR_SCRIPT));
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    it('lets picked files and recordings be read from their blob: and data: URLs', () => {
        for (const policy of [WEB_APP_PRODUCTION_CSP, WEB_APP_DEVELOPMENT_CSP]) {
            const connectSrc = directive(policy, 'connect-src');
            expect(connectSrc).toContain('blob:');
            expect(connectSrc).toContain('data:');
        }
        expect(directive(WEB_APP_PRODUCTION_CSP, 'connect-src')).not.toContain('https:');
    });

    it('gives the development server what it needs without hashes that would disable inline script', () => {
        const scriptSrc = directive(WEB_APP_DEVELOPMENT_CSP, 'script-src');
        expect(scriptSrc).toContain("'unsafe-inline'");
        expect(scriptSrc).not.toContain("'sha256-");
        expect(directive(WEB_APP_DEVELOPMENT_CSP, 'connect-src')).toContain('ws:');
    });
});
