import { useMemo } from 'react';
import { useIsDarkTheme, useThemeColors, type ColorScheme } from '../../constants/theme';

/*
 * The account screens' colours, taken from the app theme and checked for contrast: the primary
 * button and links use the darker accent in Light (4.7:1 on white) and the bright accent with dark
 * text in Dark. Small text uses textSecondary; textMuted is only for placeholders.
 */
export interface AccountPalette {
    page: string;
    field: string;
    fieldBorder: string;
    track: string;
    trackSelected: string;
    ink: string;
    inkSecondary: string;
    placeholder: string;
    link: string;
    primary: string;
    onPrimary: string;
    primaryDisabled: string;
    onPrimaryDisabled: string;
    danger: string;
    dangerSoft: string;
    info: string;
    infoSoft: string;
    warn: string;
    warnSoft: string;
    divider: string;
    strength: [string, string, string, string];
    isDark: boolean;
}

export function accountPalette(colors: ColorScheme, isDark: boolean): AccountPalette {
    return {
        page: isDark ? colors.bgPrimary : colors.bgCard,
        field: colors.bgCard,
        fieldBorder: colors.border,
        track: isDark ? colors.bgCard : colors.bgPrimary,
        trackSelected: isDark ? colors.bgInput : colors.bgCard,
        ink: colors.textPrimary,
        inkSecondary: colors.textSecondary,
        placeholder: colors.textMuted,
        link: isDark ? colors.accent : colors.accentHover,
        primary: isDark ? colors.accent : colors.accentHover,
        onPrimary: isDark ? '#04130c' : '#ffffff',
        primaryDisabled: isDark ? colors.bgInput : colors.bgPrimary,
        onPrimaryDisabled: colors.textSecondary,
        danger: colors.btnAgain,
        dangerSoft: colors.btnAgainBg,
        info: isDark ? colors.accent : colors.accentHover,
        infoSoft: colors.accentLight,
        warn: isDark ? colors.btnHard : '#8a5a0c',
        warnSoft: colors.btnHardBg,
        divider: colors.borderLight,
        strength: [colors.btnAgain, colors.btnHard, colors.accent, colors.btnGood],
        isDark,
    };
}

export function useAccountPalette(): AccountPalette {
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    return useMemo(() => accountPalette(colors, isDark), [colors, isDark]);
}
