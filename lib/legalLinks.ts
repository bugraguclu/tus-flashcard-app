/**
 * The legal pages on the live website, the same addresses `docs/app-store/metadata-tr.md` gives
 * App Store Connect. The old GitHub Pages copies (`docs/*.html`) are no longer served.
 * Live check: `node scripts/verify-app-store-pages.mjs`.
 */
const SITE_ROOT = 'https://tusankim.vercel.app';

export const PRIVACY_URL = `${SITE_ROOT}/gizlilik/`;
export const TERMS_URL = `${SITE_ROOT}/kullanim-kosullari/`;
export const SUPPORT_URL = `${SITE_ROOT}/destek/`;
