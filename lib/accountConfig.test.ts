import { describe, expect, it } from 'vitest';
import { DEV_ACCOUNT_API_URL, resolveAccountApiUrl } from './accountConfig';

describe('account server address', () => {
    it('is off in a release build that names no server', () => {
        expect(resolveAccountApiUrl(undefined, false)).toBeNull();
        expect(resolveAccountApiUrl('   ', false)).toBeNull();
    });

    it('uses the local development server when a development build names none', () => {
        expect(resolveAccountApiUrl(undefined, true)).toBe(DEV_ACCOUNT_API_URL);
    });

    it('takes a configured HTTPS address, without a trailing slash', () => {
        expect(resolveAccountApiUrl('https://hesap.tusankim.app/', false)).toBe('https://hesap.tusankim.app');
        expect(resolveAccountApiUrl('HTTPS://Hesap.Example.com:8443/api/', false)).toBe('https://hesap.example.com:8443/api');
    });

    it('never sends a password over plain HTTP beyond this machine', () => {
        expect(resolveAccountApiUrl('http://hesap.example.com', false)).toBeNull();
        expect(resolveAccountApiUrl('http://192.168.1.20:8787', true)).toBeNull();
        expect(resolveAccountApiUrl('http://127.0.0.1:8787', false)).toBe('http://127.0.0.1:8787');
        expect(resolveAccountApiUrl('http://[::1]:8787', false)).toBe('http://[::1]:8787');
    });

    it('refuses addresses that are not plain origins', () => {
        for (const bad of ['ftp://x.com', 'https://', 'https://x.com?next=1', 'https://user@x.com', 'javascript:alert(1)']) {
            expect(resolveAccountApiUrl(bad, false)).toBeNull();
        }
    });
});
