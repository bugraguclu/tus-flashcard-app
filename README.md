# 🧠 TusAnkiM — Spaced Repetition Flashcard App

TUS (Tıpta Uzmanlık Sınavı) için Anki V3 uyumlu, performans odaklı flashcard uygulaması.

## ✨ Özellikler

- **4 Zamanlama Motoru:** ANKI_V3 (varsayılan), FSRS-5, SM-2, Experimental
- **Anki V3 Birebir Uyumlu:** Learning, Relearning, Review fazları, SM-2 ease formülleri, deterministik fuzz
- **SQLite Veritabanı:** expo-sqlite, WAL mode, indexed queries, FTS5 full-text search
- **MinHeap Priority Queue:** O(log N) kart zamanlama (O(N) scan yerine)
- **Otomatik Bakım:** Günlük auto-unbury, day rollover
- **Per-Card Persistence:** Her cevapta sadece 1 kart kaydedilir (O(1) yazma)
- **100 TUS Kartı:** 10 ders, 50+ konu başlığı
- **Responsive Tasarım:** Web'de sidebar, mobilde hamburger menü
- **Import/Export:** Versiyonlu JSON yedekleme (v4, validated)
- **30 Otomatik Test:** Vitest ile doğrulanmış

## 🚀 Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Testleri çalıştır
npm test

# Web'de çalıştır
npx expo start --web

# iOS / Android
npx expo start --ios
npx expo start --android
```

## 📁 Proje Yapısı

```
tus-flashcard-app/
├── app/
│   ├── _layout.tsx               # Root layout
│   └── (tabs)/
│       ├── _layout.tsx           # Sidebar + Context Provider + DB Init
│       ├── index.tsx             # Ana çalışma ekranı
│       ├── browser.tsx           # Kart tarayıcısı (FTS5 search)
│       ├── stats.tsx             # İstatistikler
│       ├── settings.tsx          # Ayarlar
│       └── editor.tsx            # Kart editörü
│
├── lib/
│   ├── types.ts                  # TypeScript tip tanımları
│   ├── scheduler.ts              # 4 zamanlama motoru
│   ├── scheduler.anki.test.ts    # 30 test senaryosu
│   ├── storage.ts                # AsyncStorage + SQLite hibrit CRUD
│   ├── db.ts                     # SQLite: şema, indexler, FTS5, migrations
│   ├── cardQueue.ts              # MinHeap priority queue
│   ├── maintenance.ts            # Günlük bakım (auto-unbury)
│   └── data.ts                   # 100 TUS kartı
│
├── constants/
│   └── theme.ts                  # Tema: renkler, spacing, typography
│
├── package.json
├── tsconfig.json
└── app.json
```

## 🏗️ Mimari

```
Strategy Pattern (4 Motor)
┌──────────────────────────────────────┐
│           SchedulerEngine            │
│  ┌────────┬────────┬────────┬──────┐ │
│  │ ANKI_V3│ FSRS-5 │  SM-2  │ EXP  │ │
│  └────────┴────────┴────────┴──────┘ │
└──────────────────────────────────────┘

Storage Layer
┌──────────────────────────────────────┐
│   SQLite (db.ts)     AsyncStorage    │
│   ├── card_states    (legacy compat) │
│   ├── cards_fts                      │
│   ├── settings                       │
│   └── session_stats                  │
└──────────────────────────────────────┘

Scheduling
┌──────────────────────────────────────┐
│   CardQueue (MinHeap)                │
│   ├── learningHeap (by dueTime)      │
│   ├── reviewHeap  (by dueDate)       │
│   └── newCardIds                     │
└──────────────────────────────────────┘
```

## ⚡ Performans Optimizasyonları

| Optimizasyon | Öncesi | Sonrası |
|-------------|--------|---------|
| Kart kaydetme | O(N) blob yazma | O(1) tek kart |
| Kuyruk oluşturma | O(N) full scan | O(log N) heap |
| Sort | O(N log N) × getCardState() | Precomputed dueDate |
| Arama | O(N × textLen) her tuşta | FTS5 + 200ms debounce |
| Stats | Her render'da rescan | useMemo memoization |
| Tarih hesabı | UTC (bug!) | Local day |

## 🧪 Testler

```bash
npm test
# ✓ lib/scheduler.anki.test.ts (30 tests)
#   ✓ Learning Phase (6)
#   ✓ Review Phase (4)
#   ✓ Relearning Phase (3)
#   ✓ Clamp Chain (1)
#   ✓ Preview Intervals (3)
#   ✓ Helper Functions (2)
#   ✓ Edge Cases (3)
```

## 📝 Teknoloji Yığını

- **Framework:** React Native (Expo SDK 54)
- **Dil:** TypeScript
- **Router:** expo-router (dosya tabanlı)
- **Veritabanı:** expo-sqlite + AsyncStorage (hibrit)
- **Test:** Vitest
- **Platform:** Web, iOS, Android

## 📄 Lisans

MIT License — Kürşad Güçlü
