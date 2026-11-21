// TusAnkiM website configuration switches — ported from belif boolean-switch architecture.

/** PUBLIC=false emits noindex on every page until custom domain go-live. */
export const PUBLIC = true;

/** Enable sponsor / partnership logos band once sponsorships are active. */
export const SHOW_SPONSORS = false;

/** Show launch-promo pricing cards & comparison highlight. */
export const SHOW_PRICING_PROMO = true;

/** Active pricing mode: 'launch-promo' (₺50/ay lansman teklifi + 200 kart/gün ücretsiz) | 'free-beta' */
export const PRICING_MODE: 'launch-promo' | 'free-beta' = 'launch-promo';

/** Publish /gizlilik/, /kullanim-kosullari/, /destek/ routes and footer links. */
export const LEGAL_PAGES = true;

export const SITE = {
  name: 'TusAnkiM',
  titleSuffix: 'TusAnkiM — TUS Aralıklı Tekrar ve Kart Sistemi',
  domain: 'tusankim.com',
  tagline: '9.575 TUS kartı · FSRS-6 · Anki uyumlu',
  description:
    'TUS için yerel öncelikli, Anki uyumlu (.apkg/.colpkg) FSRS-6 aralıklı tekrar uygulaması. 9.575 kart, son 6 TUS referans kaydı, Kronometre ve puan hesaplayıcı.',
  disclaimer:
    'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir.',
  webAppUrl: 'https://tusankim.vercel.app/',
  githubIssuesUrl: 'https://github.com/bugraguclu/tus-flashcard-app/issues',
  email: 'destek@tusankim.com',
} as const;

export const FOUNDER = {
  name: 'Uzm. Dr. Muhammet Kürşat Güçlü',
  title: 'Kulak Burun Boğaz (KBB) Uzman Doktoru',
  shortTitle: 'KBB Uzman Doktoru',
  location: 'İzmir Çiğli',
  city: 'İzmir',
  district: 'Çiğli',
  signature: 'Uzm. Dr. Muhammet Kürşat Güçlü (İzmir Çiğli, KBB Uzman Doktoru)',
  reviewDateIso: '2026-11-21',
  reviewDateLabel: '21 Kasım 2026',
} as const;

export interface SocialProfile {
  icon: 'instagram' | 'youtube';
  name: string;
  handle: string;
  url: string;
}

export const SOCIAL: readonly SocialProfile[] = [];
