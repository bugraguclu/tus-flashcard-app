import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());

vi.mock('./storage', () => ({
    getDbSetting: (key: string) => settings.get(key) ?? null,
    setDbSetting: (key: string, value: string) => settings.set(key, value),
}));

import {
    CUSTOM_TOOLBAR_PRESETS,
    loadCustomToolbarButtons,
    persistCustomToolbarButtons,
    sanitizeButtonText,
    sanitizeCustomToolbarButton,
    sanitizeToolbarSnippet,
    type CustomToolbarButton,
} from './customToolbar';

/** WCAG relative luminance, so a preset's colours can be checked against both card themes. */
function relativeLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((digit) => digit + digit).join('') : value;
    const channels = [0, 2, 4].map((offset) => {
        const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: number, second: number): number {
    const [lighter, darker] = first >= second ? [first, second] : [second, first];
    return (lighter + 0.05) / (darker + 0.05);
}

describe('custom toolbar security and sanitization', () => {
    beforeEach(() => {
        settings.clear();
    });

    it('strips script tags and inline event handlers from snippets', () => {
        const xss1 = '<script>alert("hacked")</script><span style="color: red;">';
        expect(sanitizeToolbarSnippet(xss1)).not.toContain('<script');
        expect(sanitizeToolbarSnippet(xss1)).not.toContain('alert');
        expect(sanitizeToolbarSnippet(xss1)).toContain('<span style="color: red;">');

        const xss2 = '<img src="invalid" onerror="alert(document.cookie)">';
        expect(sanitizeToolbarSnippet(xss2)).not.toContain('onerror');
        expect(sanitizeToolbarSnippet(xss2)).not.toContain('alert');

        const xss3 = '<a href="javascript:void(0)" onclick="fetch(\'https://evil.com\')">';
        expect(sanitizeToolbarSnippet(xss3)).not.toContain('javascript:');
        expect(sanitizeToolbarSnippet(xss3)).not.toContain('onclick');
    });

    it('strips dangerous iframes, embeds, objects, and form elements', () => {
        const payload = '<iframe src="https://attacker.com"></iframe><form action="steal"><input name="pass"></form>';
        const clean = sanitizeToolbarSnippet(payload);
        expect(clean).not.toContain('<iframe');
        expect(clean).not.toContain('<form');
        expect(clean).not.toContain('<input');
    });

    it('preserves valid safe formatting tags and inline styles', () => {
        const safeSpan = '<span style="color: #ef4444; font-weight: bold;">';
        expect(sanitizeToolbarSnippet(safeSpan)).toBe(safeSpan);

        const safeMark = '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 3px;">';
        expect(sanitizeToolbarSnippet(safeMark)).toBe(safeMark);

        const safeClosing = '</span>';
        expect(sanitizeToolbarSnippet(safeClosing)).toBe(safeClosing);
    });

    it('limits text length to prevent memory or layout abuse', () => {
        const hugeString = '<span style="color: red;">' + 'a'.repeat(1000) + '</span>';
        const sanitized = sanitizeToolbarSnippet(hugeString);
        expect(sanitized.length).toBeLessThanOrEqual(500);

        const longButtonText = 'A'.repeat(50);
        expect(sanitizeButtonText(longButtonText)).toHaveLength(16);
    });

    it('sanitizes and validates full custom toolbar button objects', () => {
        const maliciousButton: Partial<CustomToolbarButton> = {
            id: 'btn-1',
            buttonText: '<b>Hacked</b>',
            prefix: '<script>alert(1)</script><mark style="background-color: yellow;">',
            suffix: '</mark><iframe src="evil.com"></iframe>',
        };

        const sanitized = sanitizeCustomToolbarButton(maliciousButton);
        expect(sanitized).toBeDefined();
        expect(sanitized?.buttonText).toBe('bHacked/b');
        expect(sanitized?.prefix).not.toContain('<script');
        expect(sanitized?.prefix).toContain('<mark style="background-color: yellow;">');
        expect(sanitized?.suffix).not.toContain('<iframe');
        expect(sanitized?.suffix).toBe('</mark>');
    });

    it('persists and loads custom toolbar buttons with strict security', () => {
        const buttons: CustomToolbarButton[] = [
            {
                id: 'btn-1',
                buttonText: 'Kırmızı',
                prefix: '<span style="color: #ef4444;">',
                suffix: '</span>',
            },
            {
                id: 'btn-2',
                buttonText: 'Vurgu',
                prefix: '<mark style="background-color: #fef08a;">',
                suffix: '</mark>',
            },
        ];

        persistCustomToolbarButtons(buttons);
        const loaded = loadCustomToolbarButtons();
        expect(loaded).toHaveLength(2);
        expect(loaded[0].buttonText).toBe('Kırmızı');
        expect(loaded[0].prefix).toBe('<span style="color: #ef4444;">');
        expect(loaded[1].buttonText).toBe('Vurgu');
    });

    it('provides valid presets that pass sanitization intact', () => {
        for (const preset of CUSTOM_TOOLBAR_PRESETS) {
            expect(sanitizeToolbarSnippet(preset.prefix)).toBe(preset.prefix);
            expect(sanitizeToolbarSnippet(preset.suffix)).toBe(preset.suffix);
            expect(sanitizeButtonText(preset.buttonText.tr)).toBe(preset.buttonText.tr);
            expect(sanitizeButtonText(preset.buttonText.en)).toBe(preset.buttonText.en);
            expect(preset.label.tr).toBeTruthy();
            expect(preset.label.en).toBeTruthy();
            expect(preset.description.tr).toBeTruthy();
            expect(preset.description.en).toBeTruthy();
        }
    });

    it('keeps every preset readable on both card themes', () => {
        // A preset writes its colours into the note itself, so it has to survive a light and a
        // night-mode card. One that pins a foreground without a background inherits the card's
        // own background, and a dark colour then disappears on a night card. 3:1 against Anki's
        // night card is the floor, and the light side is held to the same ratio against white.
        const nightCardLuminance = relativeLuminance('#2f2f31');
        for (const preset of CUSTOM_TOOLBAR_PRESETS) {
            const foreground = /(?:^|[;"\s])color:\s*(#[0-9a-fA-F]{3,6})/.exec(preset.prefix)?.[1];
            if (!foreground || /background-color:/i.test(preset.prefix)) continue;

            const luminance = relativeLuminance(foreground);
            expect(contrastRatio(luminance, nightCardLuminance)).toBeGreaterThanOrEqual(3);
            expect(contrastRatio(luminance, 1)).toBeGreaterThanOrEqual(3);
        }
    });
});
