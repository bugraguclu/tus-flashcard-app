import { describe, expect, it } from 'vitest';
import {
    CARD_CONTENT_SECURITY_POLICY,
    editorContentSecurityPolicy,
    safeExternalCardUrl,
} from './cardContentSecurity';

describe('card content security boundary', () => {
    it('denies scripts, network connections, forms, objects and nested frames by default', () => {
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("script-src 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("frame-src 'none'");
    });

    it('accepts only credential-free HTTPS links for an explicit external open', () => {
        expect(safeExternalCardUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
        for (const value of [
            'http://example.com',
            '//example.com',
            'javascript:alert(1)',
            'file:///etc/passwd',
            'data:text/html,hello',
            'blob:https://example.com/id',
            'https://user:secret@example.com/',
            '/relative',
        ]) {
            expect(safeExternalCardUrl(value)).toBeNull();
        }
    });

    it('gives the editor only a nonce-bound script and no network or navigation capabilities', () => {
        const policy = editorContentSecurityPolicy('fixed-nonce');
        expect(policy).toContain("script-src 'nonce-fixed-nonce'");
        expect(policy).toContain("connect-src 'none'");
        expect(policy).toContain("frame-src 'none'");
        expect(policy).toContain("form-action 'none'");
        expect(policy).not.toContain("'unsafe-eval'");
        expect(policy).not.toContain("script-src 'unsafe-inline'");
    });
});
