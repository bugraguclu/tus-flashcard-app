import { afterEach, describe, expect, it, vi } from 'vitest';
import { Linking } from 'react-native';
import { createOnShouldStartLoadWithRequest } from 'react-native-webview/src/WebViewShared';
import {
    CARD_CONTENT_SECURITY_POLICY,
    CARD_WEBVIEW_ORIGIN_WHITELIST,
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

    // The editor loads a field from the media directory so Anki's bare filenames resolve there.
    // That access is only safe while it stays passive: local media may be shown, nothing may be
    // sent anywhere, and no plugin or nested frame may be embedded alongside it.
    it('lets a field show local media without giving it a way to send anything out', () => {
        const policy = editorContentSecurityPolicy('fixed-nonce');
        expect(policy).toContain("img-src 'self' file: data: blob:");
        expect(policy).toContain("media-src 'self' file: data: blob:");
        expect(policy).toContain("connect-src 'none'");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("base-uri 'none'");
    });
});

// react-native-webview checks `originWhitelist` before the app's onShouldStartLoadWithRequest and
// opens every URL that fails it through Linking itself. These cases run the library's own check.
describe('card WebView navigation routing', () => {
    const MEDIA = 'file:///var/mobile/Containers/Data/Application/APP/Documents/media/';

    afterEach(() => vi.restoreAllMocks());

    function route(originWhitelist: readonly string[], url: string, isTopFrame = true) {
        const openURL = vi.spyOn(Linking, 'openURL');
        const canOpenURL = vi.spyOn(Linking, 'canOpenURL');
        const handler = vi.fn(() => false);
        const loadRequest = vi.fn();
        createOnShouldStartLoadWithRequest(loadRequest, originWhitelist, handler)({
            nativeEvent: { url, isTopFrame, lockIdentifier: 7 },
        } as never);
        vi.restoreAllMocks();
        return {
            reachedHandler: handler.mock.calls.length === 1,
            openedBySystem: openURL.mock.calls.length > 0 || canOpenURL.mock.calls.length > 0,
            loaded: loadRequest.mock.calls[0]?.[0] as boolean,
        };
    }

    it('hands every card navigation to the app handler and never to the system', () => {
        for (const url of [
            'https://docs.ankiweb.net',
            'http://example.com/',
            'mailto:someone@example.com',
            'tel:+905550000000',
            'sms:+905550000000',
            'tusankim://import?file=x',
            'itms-apps://apps.apple.com/app/id1',
            'data:text/html,hello',
            'blob:https://example.com/id',
            'javascript:alert(1)',
            'file:///etc/passwd',
            `${MEDIA}notlar.pdf`,
            MEDIA,
            'about:blank',
            'relative-without-scheme',
        ]) {
            expect(route(CARD_WEBVIEW_ORIGIN_WHITELIST, url), url).toEqual({
                reachedHandler: true,
                openedBySystem: false,
                loaded: false,
            });
            expect(route(CARD_WEBVIEW_ORIGIN_WHITELIST, url, false).openedBySystem, `${url} in a frame`).toBe(false);
        }
    });

    // Pins why the list is not the one the reviewer used to pass: with it, a tapped HTTPS link went
    // straight to Safari without the confirmation the handler asks for.
    it('lets the library open a link itself when the whitelist rejects it', () => {
        expect(route(['about:blank', 'file://*'], 'https://docs.ankiweb.net')).toEqual({
            reachedHandler: false,
            openedBySystem: true,
            loaded: false,
        });
    });
});
