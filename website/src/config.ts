// Shared website identity and publication settings.

/** PUBLIC=false emits noindex on every page until custom domain go-live. */
export const PUBLIC = true;

/** Show launch-promo pricing cards & comparison highlight. */
export const SHOW_PRICING_PROMO = true;

/** Active pricing mode: 'launch-promo' (₺50/ay lansman teklifi + 200 kart/gün ücretsiz) | 'free-beta' */
export const PRICING_MODE: 'launch-promo' | 'free-beta' = 'launch-promo';

/** Current access and future pricing are deliberately separate. */
export const ACCESS = {
  betaDescription: 'Güncel beta sürümünde TUS paketi ücretsiz açılır. Ödeme veya kart bilgisi gerekmez.',
  plannedLaunchDescription: 'Planlanan lansman: günde 200 kart ücretsiz, sınırsız erişim ₺50/ay. Ücretli planlar henüz devrede değil.',
} as const;

/** Publish /gizlilik/, /kullanim-kosullari/, /destek/ routes and footer links. */
export const LEGAL_PAGES = true;

const webAppUrl = 'https://tusankim.vercel.app' + (process.env.TUSANKIM_WEB_BASE ?? '') + '/';

export const SITE = {
  name: 'TusAnkiM',
  titleSuffix: 'TusAnkiM — TUS Aralıklı Tekrar ve Kart Sistemi',
  domain: 'tusankim.com',
  tagline: 'TUS için günlük kart tekrarı.',
  description:
    'TUS için 9.575 hazır kart, FSRS-6 aralıklı tekrar ve çalışma takibi. iPhone için geliştirilen TusAnkiM’i tarayıcıda ücretsiz dene.',
  disclaimer:
    'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir.',
  webAppUrl,
  githubIssuesUrl: 'https://github.com/bugraguclu/tus-flashcard-app/issues',
  // Replace with live App Store link once published; currently directs to iPhone/Web onboarding anchor.
  appStoreUrl: webAppUrl,
  email: 'destek@tusankim.com',
} as const;

export const SOCIAL = [
  {
    icon: 'instagram',
    name: 'Instagram',
    handle: '@tusankim',
    url: 'https://www.instagram.com/tusankim/',
  },
  {
    icon: 'youtube',
    name: 'YouTube',
    handle: '@tusankim',
    url: 'https://www.youtube.com/@tusankim',
  },
] as const;
