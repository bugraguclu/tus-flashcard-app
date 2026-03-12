// ============================================================
// TUS Flashcard - Seed Data References
// ============================================================

import type { Subject, Card } from './types';

export const TUS_SUBJECTS: Subject[] = [
    { id: 'anatomi', name: 'Anatomi', icon: '🦴', topics: ['Üst Ekstremite', 'Alt Ekstremite', 'Baş-Boyun', 'Nöroanatomi'] },
    { id: 'fizyoloji', name: 'Fizyoloji', icon: '⚡', topics: ['Kardiyovasküler', 'Solunum', 'Endokrin', 'Nörofizyoloji'] },
    { id: 'biyokimya', name: 'Biyokimya', icon: '🧬', topics: ['Enzimler', 'Metabolizma', 'Vitaminler', 'Genetik'] },
    { id: 'mikrobiyoloji', name: 'Mikrobiyoloji', icon: '🦠', topics: ['Bakteriyoloji', 'Viroloji', 'Parazitoloji', 'Mikoloji'] },
    { id: 'patoloji', name: 'Patoloji', icon: '🔬', topics: ['Genel Patoloji', 'Sistemik Patoloji', 'Hematopatoloji'] },
    { id: 'farmakoloji', name: 'Farmakoloji', icon: '💊', topics: ['Otonom', 'Santral', 'Kardiyovasküler', 'Antimikrobiyal'] },
    { id: 'dahiliye', name: 'Dahiliye', icon: '🩺', topics: ['Kardiyoloji', 'Gastroenteroloji', 'Endokrinoloji', 'Hematoloji'] },
    { id: 'cerrahi', name: 'Cerrahi', icon: '🔪', topics: ['Genel Cerrahi', 'Ortopedi', 'Üroloji', 'KBB'] },
    { id: 'pediatri', name: 'Pediatri', icon: '👶', topics: ['Neonatoloji', 'Büyüme-Gelişme', 'Enfeksiyon', 'Beslenme'] },
    { id: 'kadin', name: 'Kadın Hastalıkları', icon: '🤰', topics: ['Obstetrik', 'Jinekoloji', 'Jinekolojik Onkoloji'] },
];

// Seed cards moved out of code to reduce bundle size.
// Loaded from assets/seed/tus_cards.json during initial migration.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedCards = require('../assets/seed/tus_cards.json') as Card[];

export const TUS_CARDS: Card[] = seedCards;
