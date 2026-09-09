import { describe, expect, it } from 'vitest';
import { resolveThemeColors } from '../constants/theme';

describe('appearance theme resolution', () => {
    it('follows the system and exposes a true black night surface', () => {
        expect(resolveThemeColors('system', 'light').isDark).toBe(false);
        const night = resolveThemeColors('system', 'dark');
        expect(night.isDark).toBe(true);
        expect(night.colors.bgPrimary).toBe('#000000');
    });

    it('lets an explicit selection override the system', () => {
        expect(resolveThemeColors('dark', 'light').isDark).toBe(true);
        expect(resolveThemeColors('light', 'dark').isDark).toBe(false);
    });
});
