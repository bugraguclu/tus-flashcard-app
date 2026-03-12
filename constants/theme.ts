// ============================================================
// TUS Flashcard - Theme Constants (Light + Dark)
// ============================================================

import { useColorScheme } from 'react-native';

export type ColorScheme = typeof LightColors;

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

    white: '#ffffff',
    transparent: 'transparent',
};

// Default export for backward compatibility — light theme
export const Colors = LightColors;

/** Hook that returns the correct color palette based on system theme */
export function useThemeColors(): ColorScheme {
    const scheme = useColorScheme();
    return scheme === 'dark' ? DarkColors : LightColors;
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
