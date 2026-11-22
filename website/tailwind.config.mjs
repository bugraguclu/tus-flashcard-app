/** @type {import('tailwindcss').Config} */
// Fluid heading scale ported from belif architecture: linear from 375px to 1280px,
// WCAG 1.4.4 safe (max/min ratio < 2.5, rem endpoints scale with browser zoom).
const fluid = (minPx, maxPx, fromPx = 375, toPx = 1280) => {
  const slope = (maxPx - minPx) / (toPx - fromPx);
  const base = minPx - slope * fromPx;
  const rem = (px) => `${+(px / 16).toFixed(4)}rem`;
  return `clamp(${rem(minPx)}, ${rem(base)} + ${+(slope * 100).toFixed(4)}vw, ${rem(maxPx)})`;
};

export default {
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
  ],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // WCAG 2.2 AA verified palette synced with TusAnkiM constants/theme.ts
        ink: '#24292c',         // 14.7:1 on white
        inkMuted: '#596166',    // 6.31:1 on white (replaces low-contrast text-ink/45)
        paper: '#ffffff',
        surface: '#f3f5f6',
        surfaceSoft: '#f8f9fa',
        tint: '#e4f4f1',
        line: '#dde1e4',
        lineLight: '#e9ecee',

        teal: '#0e7469',        // 5.64:1 on #fff, 5.16:1 on #f3f5f6, 4.97:1 on #e4f4f1
        tealDark: '#0b5e55',    // hover
        tealGraphic: '#14998a', // non-text graphic/icons/borders (>= 3:1)

        warm: '#a3430a',        // 6.24:1 on #fff, 5.58:1 on #fdf0e4 warmTint (Kronometre/accent text & badges)
        warmGraphic: '#d9661a', // non-text icon accent
        warmTint: '#fdf0e4',

        // Grade pills (all >= 5.2:1 AA)
        gradeAgain: '#b02c25',
        gradeAgainBg: '#fcecea',
        gradeHard: '#8c4c07',
        gradeHardBg: '#fcf1e3',
        gradeGood: '#156d3e',
        gradeGoodBg: '#e6f4ec',
        gradeEasy: '#205b94',
        gradeEasyBg: '#e8f0f8',

        cloze: '#1d5fa6',
      },
      fontSize: {
        'hero-title': [fluid(34, 54), { lineHeight: fluid(40, 60) }],
        'page-title': [fluid(30, 46), { lineHeight: fluid(36, 52) }],
        'section-xl': [fluid(28, 42), { lineHeight: fluid(34, 48) }],
        section: [fluid(26, 36), { lineHeight: fluid(32, 42) }],
        subsection: [fluid(22, 28), { lineHeight: fluid(28, 34) }],
      },
      letterSpacing: { tightest: '-0.02em' },
      maxWidth: { content: '1168px' },
    },
  },
  plugins: [],
};
