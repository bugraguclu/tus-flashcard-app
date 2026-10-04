import React, { createContext, useContext } from 'react';
import { Platform, useColorScheme, type ColorSchemeName } from 'react-native';

export type ColorScheme = typeof LightColors;
export type ThemeMode = 'system' | 'light' | 'dark';

/** Theme selection is user-facing and applied live throughout theme-aware screens. */
export const DARK_MODE_UI_ENABLED = true;

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

    // Browser row states. Anki tints the row rather than fading it, so the text of a suspended
    // card stays as readable as any other — the row says "this one is not coming up", not
    // "this one is less important".
    rowSuspendedBg: '#fcf1cf',
    rowBuriedBg: '#e6ebe9',

    // Statistics charts. Card states keep the colours Anki gives them (new blue, learning orange,
    // relearning red, young and mature green), stepped per theme and checked as a set: every pair
    // that sits side by side in a stack stays apart under colour-blindness simulation (ΔE ≥ 8)
    // and with full colour vision (ΔE ≥ 15).
    chartNew: '#2f7fc1',
    chartLearn: '#e08a1e',
    chartRelearn: '#d1453b',
    chartYoung: '#6cc28a',
    chartMature: '#1f7a4a',
    chartFiltered: '#8a63c9',
    chartGood: '#27864e',

    // The reviewer's card panel. A tint of the page rather than white: the card reads as a
    // surface without a bright slab behind the question.
    reviewerCard: '#ddefe7',
    reviewerCardBorder: '#c8e0d6',
    // Cloze deletions: the blue catalog cards use, which sits with the green palette, and the
    // tint that marks a deletion still hidden on the question side of any cloze card.
    clozeText: '#1d5fa6',
    clozeTint: 'rgba(29, 95, 166, 0.12)',

    white: '#ffffff',
    transparent: 'transparent',
};

const DarkColors: ColorScheme = {
    bgPrimary: '#000000',
    bgSecondary: '#0b0d0c',
    bgCard: '#151816',
    bgSidebar: '#080a09',
    bgInput: '#1c211e',
    border: '#343b37',
    borderLight: '#292f2c',

    textPrimary: '#f1f6f3',
    textSecondary: '#bac7c0',
    textMuted: '#87948e',

    accent: '#4db88a',
    accentLight: '#173126',
    accentHover: '#5ccf9c',

    btnAgain: '#e05545',
    btnAgainBg: '#321d1d',
    btnHard: '#e8a020',
    btnHardBg: '#322916',
    btnGood: '#3aad60',
    btnGoodBg: '#17301f',
    btnEasy: '#4a9ad0',
    btnEasyBg: '#17283a',

    badgeNew: '#4a9ad0',
    badgeNewBg: '#253040',
    badgeLearn: '#e8a020',
    badgeLearnBg: '#3a3020',
    badgeReview: '#3aad60',
    badgeReviewBg: '#253828',

    streak: '#f2994a',
    streakBg: '#3d2f1f',

    rowSuspendedBg: '#3b3218',
    rowBuriedBg: '#232826',

    chartNew: '#3a84ca',
    chartLearn: '#d08000',
    chartRelearn: '#af2934',
    chartYoung: '#54a863',
    chartMature: '#137738',
    chartFiltered: '#9470cd',
    chartGood: '#1d7d3e',

    reviewerCard: '#121513',
    reviewerCardBorder: '#252b28',
    clozeText: '#5aa9f0',
    clozeTint: 'rgba(90, 169, 240, 0.16)',

    white: '#ffffff',
    transparent: 'transparent',
};

// Default export for backward compatibility — light theme. Screens that have not yet
// been migrated to useThemeColors() will keep rendering the light palette regardless
// of the user's theme preference.
export const Colors = LightColors;

const ThemeColorsContext = createContext<ColorScheme>(LightColors);
const ThemeIsDarkContext = createContext<boolean>(false);

export function resolveThemeColors(
    mode: ThemeMode,
    systemScheme: ColorSchemeName,
): { colors: ColorScheme; isDark: boolean } {
    const effective = mode === 'system' ? systemScheme : mode;
    const isDark = effective === 'dark';
    return { colors: isDark ? DarkColors : LightColors, isDark };
}

/**
 * Wraps the app and resolves the user's `themeMode` preference ('system' | 'light' | 'dark')
 * against the OS color scheme, feeding the result to useThemeColors() below. Must sit inside
 * AppProvider (needs the persisted setting) and outside anything that calls useThemeColors().
 */
export function ThemeColorsProvider({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const { colors, isDark } = resolveThemeColors(mode, systemScheme);
    return React.createElement(
        ThemeIsDarkContext.Provider,
        { value: isDark },
        React.createElement(ThemeColorsContext.Provider, { value: colors }, children),
    );
}

/** Hook that returns the color palette for the current theme (preference + system fallback). */
export function useThemeColors(): ColorScheme {
    return useContext(ThemeColorsContext);
}

/**
 * Whether the resolved theme is dark. Card rendering needs the answer as a boolean, not as a
 * palette: Anki hands note types `nightMode night_mode` classes and lets their own stylesheet
 * decide, so an imported deck themes itself instead of being recoloured from outside.
 */
export function useIsDarkTheme(): boolean {
    return useContext(ThemeIsDarkContext);
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

interface DropShadow {
    /** Horizontal offset in points; negative casts the shadow to the left. */
    x?: number;
    /** Vertical offset in points. */
    y: number;
    /** Blur radius in points. */
    blur: number;
    /** Opacity of the black shadow, 0–1. */
    opacity: number;
    /** Android's elevation, kept for parity with the shadow's weight. */
    elevation?: number;
}

/**
 * A black drop shadow in the form each platform draws: React Native's shadow props natively and
 * `boxShadow` on web, where react-native-web draws the same shadow but warns on every shadow* prop.
 */
export function dropShadow({ x = 0, y, blur, opacity, elevation }: DropShadow) {
    return Platform.select({
        web: { boxShadow: `${x}px ${y}px ${blur}px rgba(0, 0, 0, ${opacity})` },
        default: {
            shadowColor: '#000',
            shadowOffset: { width: x, height: y },
            shadowOpacity: opacity,
            shadowRadius: blur,
            ...(elevation === undefined ? {} : { elevation }),
        },
    });
}

/** Removes a shadow a base style gave, on every platform. */
export const NO_SHADOW = Platform.select({
    web: { boxShadow: 'none' },
    default: { shadowOpacity: 0, elevation: 0 },
});

export const Shadows = {
    sm: dropShadow({ y: 1, blur: 3, opacity: 0.06, elevation: 1 }),
    md: dropShadow({ y: 2, blur: 8, opacity: 0.07, elevation: 3 }),
    lg: dropShadow({ y: 4, blur: 16, opacity: 0.08, elevation: 5 }),
};
