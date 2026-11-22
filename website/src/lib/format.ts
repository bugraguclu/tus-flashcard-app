// Turkish number formatting shared by the home page sections (tr-TR: 9.575, %43,6).
const cache = new Map<string, Intl.NumberFormat>();

function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', options);
    cache.set(key, f);
  }
  return f;
}

/** 9575 → "9.575" */
export const num = (value: number): string => nf({ maximumFractionDigits: 0 }).format(value);

/** 43.6 → "%43,6" (value is already a percentage, not a fraction). */
export const pct = (value: number, digits = 1): string =>
  nf({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value / 100);

/** Share of a whole as a CSS width, clamped to 0–100. */
export const share = (part: number, whole: number): string =>
  `${Math.max(0, Math.min(100, (part / whole) * 100)).toFixed(2)}%`;
