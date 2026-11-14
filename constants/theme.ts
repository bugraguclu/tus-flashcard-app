import React, { createContext, useContext } from 'react';
import { Platform, useColorScheme, type ColorSchemeName } from 'react-native';

export type ColorScheme = typeof LightColors;
export type ThemeMode = 'system' | 'light' | 'dark';

/** Theme selection is user-facing and applied live throughout theme-aware screens. */
export const DARK_MODE_UI_ENABLED = true;

const LightColors = {
    bgPrimary: '#f3f5f6',
    bgSecondary: '#f8f9fa',
    bgCard: '#ffffff',
    bgSidebar: '#ffffff',
    bgInput: '#f1f3f4',
    border: '#dde1e4',
    borderLight: '#e9ecee',

    textPrimary: '#24292c',
    textSecondary: '#596166',
    textMuted: '#858d92',

    accent: '#14998a',
    accentLight: '#e4f4f1',
    accentHover: '#0e8275',

    btnAgain: '#c94139',
    btnAgainBg: '#fcecea',
    btnHard: '#b8680f',
    btnHardBg: '#fcf1e3',
    btnGood: '#1f8a52',
    btnGoodBg: '#e6f4ec',
    btnEasy: '#2b6eab',
    btnEasyBg: '#e8f0f8',

    badgeNew: '#2b6eab',
    badgeNewBg: '#e3edf7',
    badgeLearn: '#c0650f',
    badgeLearnBg: '#fcf1e3',
    badgeReview: '#1f8a52',
    badgeReviewBg: '#e4f3ea',

    streak: '#e8761a',
    streakBg: '#fdf0e4',
    // The Kronometre's study tools button and cards: an orange dark enough for white text.
    studyTool: '#d9661a',

    // Browser row states. Anki tints the row rather than fading it, so the text of a suspended
    // card stays as readable as any other — the row says "this one is not coming up", not
    // "this one is less important".
    rowSuspendedBg: '#fcf1cf',
    rowBuriedBg: '#e8ebed',

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

    // The reviewer's card panel: a white card on the grey page, as every other card is.
    reviewerCard: '#ffffff',
    reviewerCardBorder: '#e1e5e8',
    // Cloze deletions: the blue catalog cards use, which sits with the green palette, and the
    // tint that marks a deletion still hidden on the question side of any cloze card.
    clozeText: '#1d5fa6',
    clozeTint: 'rgba(29, 95, 166, 0.12)',

    // Roles for chrome that is not a grade or a card state. They keep the values screens used to
    // borrow from the answer buttons and badges, so a Delete stays red if Again ever changes.
    danger: '#c94139',
    dangerBg: '#fcecea',
    warning: '#b8680f',
    warningBg: '#fcf1e3',
    success: '#1f8a52',
    successBg: '#e6f4ec',
    info: '#2b6eab',
    infoBg: '#e3edf7',
    /** Text and icons drawn on an accent or danger fill. */
    onAccent: '#ffffff',
    /** The marked-note star. */
    marked: '#f59e0b',
    /** The chosen segment of a segmented control, raised above its track. */
    segmentSelected: '#ffffff',
    /** Dimming behind a dialog or bottom sheet. */
    scrim: 'rgba(0, 0, 0, 0.4)',
    /** Lighter dimming behind a popover or side menu that stays tied to the screen under it. */
    scrimLight: 'rgba(0, 0, 0, 0.22)',
    /** Dimming behind a speed-dial menu whose labels sit directly on it. */
    scrimStrong: 'rgba(0, 0, 0, 0.6)',

    white: '#ffffff',
    transparent: 'transparent',
};

const DarkColors: ColorScheme = {
    bgPrimary: '#000000',
    bgSecondary: '#0c0e0f',
    bgCard: '#161a1c',
    bgSidebar: '#0c0e0f',
    bgInput: '#1e2326',
    border: '#30373b',
    borderLight: '#262c2f',

    textPrimary: '#eef1f2',
    textSecondary: '#b3bbbf',
    textMuted: '#858e93',

    accent: '#2db3a3',
    accentLight: '#10302c',
    accentHover: '#45c5b6',

    btnAgain: '#e5574d',
    btnAgainBg: '#3a1d1b',
    btnHard: '#e3953a',
    btnHardBg: '#382916',
    btnGood: '#3cb874',
    btnGoodBg: '#163222',
    btnEasy: '#5aa2e0',
    btnEasyBg: '#172a3d',

    badgeNew: '#5aa2e0',
    badgeNewBg: '#1a2b3d',
    badgeLearn: '#e3953a',
    badgeLearnBg: '#382916',
    badgeReview: '#3cb874',
    badgeReviewBg: '#163222',

    streak: '#f0904a',
    streakBg: '#382617',
    studyTool: '#d9661a',

    rowSuspendedBg: '#3b3218',
    rowBuriedBg: '#24292c',

    chartNew: '#3a84ca',
    chartLearn: '#d08000',
    chartRelearn: '#af2934',
    chartYoung: '#54a863',
    chartMature: '#137738',
    chartFiltered: '#9470cd',
    chartGood: '#1d7d3e',

    reviewerCard: '#121618',
    reviewerCardBorder: '#262c30',
    clozeText: '#5aa9f0',
    clozeTint: 'rgba(90, 169, 240, 0.16)',

    danger: '#e5574d',
    dangerBg: '#3a1d1b',
    warning: '#e3953a',
    warningBg: '#382916',
    success: '#3cb874',
    successBg: '#163222',
    info: '#5aa2e0',
    infoBg: '#1a2b3d',
    onAccent: '#ffffff',
    marked: '#f59e0b',
    // On a dark track the card colour is darker than the track itself; the border tone lifts the
    // chosen segment instead of sinking it.
    segmentSelected: '#30373b',
    scrim: 'rgba(0, 0, 0, 0.4)',
    scrimLight: 'rgba(0, 0, 0, 0.22)',
    scrimStrong: 'rgba(0, 0, 0, 0.6)',

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
    md: 8,
    lg: 12,
    xl: 16,
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

// Shadows only lift what floats (menus, sheets, the FAB) or separate a white card from the
// grey page; they stay soft enough that a hairline border does most of the work.
export const Shadows = {
    sm: dropShadow({ y: 1, blur: 2, opacity: 0.05, elevation: 1 }),
    md: dropShadow({ y: 2, blur: 6, opacity: 0.06, elevation: 3 }),
    lg: dropShadow({ y: 6, blur: 18, opacity: 0.1, elevation: 6 }),
};
