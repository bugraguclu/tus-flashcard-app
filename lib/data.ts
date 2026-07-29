// ============================================================
// TUS Flashcard - Seed Data References
// ============================================================

import type { Subject, Card } from './types';

export const TUS_SUBJECTS: Subject[] = [
    { id: 'temeller', name: 'Temeller', icon: '🐍', topics: ['Yazdırma & Girdi', 'Veri Tipleri', 'f-string & Matematik'] },
    { id: 'mantik', name: 'Mantık & Döngüler', icon: '🔀', topics: ['Koşullar', 'Operatörler', 'for Döngüsü', 'while Döngüsü'] },
    { id: 'veri', name: 'Veri Yapıları', icon: '📦', topics: ['Listeler', 'Sözlükler', 'Tuple'] },
    { id: 'fonksiyon', name: 'Fonksiyonlar', icon: '🧩', topics: ['Tanımlama', 'Parametreler', 'return', 'Kapsam (Scope)'] },
    { id: 'oop', name: 'Nesne Yönelimli (OOP)', icon: '🏗️', topics: ['Sınıflar & Nesneler', 'Öznitelikler', 'Metotlar', '__init__'] },
    { id: 'araclar', name: 'Modüller & Hata Ayıklama', icon: '🧰', topics: ['Modüller', 'random', 'Hata Ayıklama'] },
];

// Seed cards moved out of code to reduce bundle size.
// Loaded from assets/seed/tus_cards.json during initial migration.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seedCards = require('../assets/seed/tus_cards.json') as Card[];

export const TUS_CARDS: Card[] = seedCards;
