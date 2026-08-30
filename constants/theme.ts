import React, { createContext, useContext, useEffect } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import {
    DEFAULT_TYPE_ROLE,
    FONT_SCALE_CAPS,
    INPUT_FONT_SCALE_CAP,
    MIN_TOUCH_TARGET,
    clampFontScale,
    fontScaleCap,
    scaledFontSize,
    scaledRowHeight,
    type TypeRole,
} from '../lib/typography';

export type ColorScheme = typeof LightColors;
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const LightColors = {
    bgPrimary: '#e8f5f0',
    bgSecondary: '#f4faf7',
    bgCard: '#ffffff',
    bgSidebar: '#dff0ea',
    bgInput: '#f0f7f4',
    border: '#c4ddd4',
    borderLight: '#d8ebe4',

    textPrimary: '#2c3e36',
    textSecondary: '#556b62',
    textMuted: '#7f9a8f',

    accent: '#3a9e78',
    accentLight: '#e0f3ec',
    accentHover: '#2e8264',

    btnAgain: '#c0392b',
    btnAgainBg: '#fdecea',
    btnHard: '#d68910',
    btnHardBg: '#fef5e7',
    btnGood: '#27864e',
    btnGoodBg: '#e8f6ee',
    btnEasy: '#2874a6',
    btnEasyBg: '#eaf2f8',

    badgeNew: '#2874a6',
    badgeNewBg: '#ddeaf5',
    badgeLearn: '#d68910',
    badgeLearnBg: '#fef5e7',
    badgeReview: '#27864e',
    badgeReviewBg: '#e0f3ec',

    streak: '#ef8a1d',
    streakBg: '#fdeedd',

    white: '#ffffff',
    transparent: 'transparent',
};

const DarkColors: ColorScheme = {
    bgPrimary: '#1a2520',
    bgSecondary: '#212e28',
    bgCard: '#2a3832',
    bgSidebar: '#1e2b25',
    bgInput: '#253028',
    border: '#3a4f46',
    borderLight: '#33453c',

    textPrimary: '#e0ede7',
    textSecondary: '#a8c2b6',
    textMuted: '#7a9a8c',

    accent: '#4db88a',
    accentLight: '#2a3f34',
    accentHover: '#5ccf9c',

    btnAgain: '#e05545',
    btnAgainBg: '#3a2525',
    btnHard: '#e8a020',
    btnHardBg: '#3a3020',
    btnGood: '#3aad60',
    btnGoodBg: '#253828',
    btnEasy: '#4a9ad0',
    btnEasyBg: '#253040',

    badgeNew: '#4a9ad0',
    badgeNewBg: '#253040',
    badgeLearn: '#e8a020',
    badgeLearnBg: '#3a3020',
    badgeReview: '#3aad60',
    badgeReviewBg: '#253828',

    streak: '#f2994a',
    streakBg: '#3d2f1f',

    white: '#ffffff',
    transparent: 'transparent',
};

// Default export for backward compatibility — light theme. Screens that have not yet
// been migrated to useThemeColors() will keep rendering the light palette regardless
// of the user's theme preference.
export const Colors = LightColors;

/** Background painted by the native launch screen; matches bgPrimary so startup never flashes. */
export const SplashBackground: Record<ResolvedScheme, string> = {
    light: LightColors.bgPrimary,
    dark: DarkColors.bgPrimary,
};

export function schemeColors(scheme: ResolvedScheme): ColorScheme {
    return scheme === 'dark' ? DarkColors : LightColors;
}

const ThemeColorsContext = createContext<ColorScheme>(LightColors);
const ThemeSchemeContext = createContext<ResolvedScheme>('light');

/**
 * Mirrors an explicit theme choice onto the native appearance. iOS applies it as
 * `overrideUserInterfaceStyle` on every window, so the keyboard, native sheets, alerts and
 * scroll indicators follow the in-app theme instead of the device setting; 'system' clears it.
 */
function useNativeAppearanceSync(mode: ThemeMode): void {
    useEffect(() => {
        if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
        Appearance.setColorScheme(mode === 'system' ? null : mode);
    }, [mode]);
}

/**
 * Wraps the app and resolves the user's `themeMode` preference ('system' | 'light' | 'dark')
 * against the OS color scheme, feeding the result to useThemeColors() below. Must sit inside
 * AppProvider (needs the persisted setting) and outside anything that calls useThemeColors().
 */
export function ThemeColorsProvider({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    useNativeAppearanceSync(mode);
    // With an explicit mode the native override also changes what useColorScheme() reports, so
    // only the 'system' branch reads it; switching back to 'system' re-resolves once the
    // override is cleared and the appearance change event lands.
    const scheme: ResolvedScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
    return React.createElement(
        ThemeSchemeContext.Provider,
        { value: scheme },
        React.createElement(ThemeColorsContext.Provider, { value: schemeColors(scheme) }, children),
    );
}

/** Hook that returns the color palette for the current theme (preference + system fallback). */
export function useThemeColors(): ColorScheme {
    return useContext(ThemeColorsContext);
}

/** Resolved 'light' | 'dark' for surfaces that need the scheme itself (status bar, keyboards). */
export function useThemeScheme(): ResolvedScheme {
    return useContext(ThemeSchemeContext);
}

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const BorderRadius = {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 20,
    full: 9999,
};

export const FontSize = {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 28,
    title: 32,
};

/**
 * Dynamic Type policy, re-exported from lib/typography so screens reach it through the same
 * module as the rest of the design tokens while the arithmetic stays unit tested. Text growth is
 * capped per role rather than globally: body copy is what the reader actually needs bigger, and a
 * title sharing a row with controls has far less room to give.
 */
export const Typography = {
    scaleCaps: FONT_SCALE_CAPS,
    defaultRole: DEFAULT_TYPE_ROLE,
    inputScaleCap: INPUT_FONT_SCALE_CAP,
    minTouchTarget: MIN_TOUCH_TARGET,
    capFor: fontScaleCap,
    clamp: clampFontScale,
    fontSize: scaledFontSize,
    rowHeight: scaledRowHeight,
} as const;

export type { TypeRole };

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 5,
    },
};
