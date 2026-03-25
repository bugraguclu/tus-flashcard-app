# Optimization Audit Report

## Executive Summary

TUS Flashcard uygulamasi genel olarak iyi yapilandirilmis bir codebase. SQL sorgulari cogunlukla aggregate seviyesinde yapiliyor ve gereksiz full-table scan'lerden kacinilmis. Ancak **study queue olusturma** sirasinda 4-5 ayri COUNT + SELECT sorgusu arka arkaya atiliyor, `saveAnkiCard` her cagride SELECT+UPDATE/INSERT yapiyor (hot path'te review sirasinda 2x), ve `_layout.tsx` icindeki `getSearchIndexCards()` her `dataVersion` degisiminde tum kart verisini memory'ye yukluyor. Asagidaki bulgular, kullanicinin gunluk calisma akisinda hissedilecek iyilestirmeleri oncelik sirasina gore listeler.

---

## Performance Findings

### [P1] getStudyQueue icinde 4 ayri COUNT sorgusu + 4 ayri SELECT sorgusu

- **Location**: `lib/studyRepository.ts:535-610`
- **Impact**: High
- **Current**: `getStudyQueue` her cagrildiginda 4 `countRowsByQueue` (her biri ayri SQL COUNT) ve ardindan 4 `loadRowsByQueue` (her biri ayri SELECT + JOIN) calistiriyor. Toplamda 8 SQL round-trip yapiliyor. Bu fonksiyon her kart cevabinda, her 45 saniyede bir, ve her learning timer'da tetikleniyor.
- **Recommended**: Tek bir SQL sorgusuyla tum queue'lari sayip row'lari cekmek:
  ```sql
  SELECT c.queue, c.type, c.due, ...
  FROM anki_cards c JOIN notes n ON ... JOIN note_types nt ON ...
  WHERE c.queue IN (0, 1, 2, 3) AND (
    (c.queue = 1 AND c.due <= ?) OR
    (c.queue = 3 AND c.due <= ?) OR
    (c.queue = 2 AND c.due <= ?) OR
    c.queue = 0
  )
  ORDER BY c.queue, c.due
  ```
  Sonuclari JS tarafinda queue bucket'larina ayirmak 8 round-trip'i 1'e indirir.
- **Estimated Gain**: Queue build suresi ~60-75% azalir (8 SQL -> 1 SQL). Her review sonrasi ~30-50ms tasarruf (1000+ kart koleksiyonunda).

---

### [P1] saveAnkiCard icinde gereksiz SELECT + parse + serialize dongusu

- **Location**: `lib/noteManager.ts:207-300`
- **Impact**: High
- **Current**: `saveAnkiCard` her cagrildiginda once SELECT ile mevcut karti okuyup JSON.parse yapiyor, ardindan `{ ...existingParsed, ...card }` merge edip JSON.stringify ile karsilastirma yapiyor. Review akisinda bu fonksiyon `answerStudyCard` icinde 1 kez, `applySiblingBuryPolicy` icinde N kez (kardes kart sayisi kadar), ve `handleLeech` icinde potansiyel 1 kez daha cagriliyor.
- **Recommended**: `saveAnkiCard` fonksiyonuna `skipMerge: boolean` parametresi ekleyerek review hot path'inde merge'u atlamak. `answerStudyCard` zaten tam AnkiCard nesnesi uretiyor, merge gereksiz. Alternatif: Sadece denormalize kolonlari UPDATE eden bir `updateAnkiCardColumns` fonksiyonu yazmak (data blob'u guncellenmeden).
- **Estimated Gain**: Review basina 1-3 gereksiz SELECT + JSON.parse/stringify cikartilir. ~5-15ms tasarruf per review.

---

### [P1] getSearchIndexCards tum kartlari memory'ye yukluyor (layout her dataVersion'da)

- **Location**: `app/(tabs)/_layout.tsx:51-58`, `lib/noteManager.ts:502-525`
- **Impact**: High
- **Current**: `_layout.tsx` icinde `useMemo(() => getSearchIndexCards(), [dataVersion])` ile her `dataVersion` degisiminde tum kart+note tablosu JOIN edilip tum JSON parse ediliyor. `bumpDataVersion` her review'da cagriliyor. 5000 kartlik bir koleksiyonda bu ~100ms+ ve onemli memory allocation demek.
- **Recommended**: Sidebar sayaclari icin SQL-based bir `getSubjectTopicCounts()` fonksiyonu yazmak:
  ```sql
  SELECT n.tags, COUNT(*) as cnt FROM anki_cards c
  JOIN notes n ON n.id = c.noteId GROUP BY n.tags
  ```
  Bu, tum JSON blob'larini parse etmeden ayni sonucu verir. `getSearchIndexCards` sadece FTS index rebuild'de kullanilmali, her render'da degil.
- **Estimated Gain**: Layout render suresi ~80-90% azalir. Memory allocation onemli olcude duser. 5000 kartta ~80-150ms tasarruf per dataVersion bump.

---

### [P2] Periodic 45-saniye full queue rebuild

- **Location**: `app/(tabs)/index.tsx:132-140`
- **Impact**: Medium
- **Current**: `setInterval(() => buildQueue(), 45000)` ile her 45 saniyede bir tam queue rebuild yapiliyor. Bu, yukaridaki P1'deki 8 SQL sorgusunu periyodik olarak tetikliyor.
- **Recommended**: Periodic rebuild yerine `nextLearningDue` timer'ina guvenip, ancak tab visibility degistiginde (veya 2+ dakika inaktivitede) rebuild yapmak. `document.visibilitychange` event'i ile entegre edilebilir.
- **Estimated Gain**: Pasif kullanim sirasinda gereksiz DB erisimi ~90% azalir.

---

### [P2] unburyAllCards N+1 pattern: SELECT all + saveAnkiCard per row

- **Location**: `lib/noteManager.ts:349-363`
- **Impact**: Medium
- **Current**: Tum buried kartlari SELECT ile cekip her biri icin ayri ayri `saveAnkiCard` (ki icinde tekrar SELECT + UPDATE var) cagriliyor. 50 buried kartta 50 SELECT + 50 UPDATE.
- **Recommended**: Tek bir batch UPDATE sorgusu:
  ```sql
  UPDATE anki_cards SET queue = <restored>, data = ... WHERE queue = -3
  ```
  Ancak `data` blob'undaki `queue` degerini de guncellemek gerektiginden, pragmatik yaklasim: transaction icinde `UPDATE anki_cards SET queue = CASE WHEN type = 0 THEN 0 WHEN type = 2 THEN 2 ELSE 1 END WHERE queue = -3` ve ardindan data blob'u icin ayri bir bulk guncelleme.
- **Estimated Gain**: Maintenance suresi O(N) SQL round-trip yerine O(1). 50 kartta ~200ms -> ~5ms.

---

### [P2] Composite index eksikligi: queue+due

- **Location**: `lib/db.ts:140-141`
- **Impact**: Medium
- **Current**: `idx_ac_queue` ve `idx_ac_due` ayri indexler. Ancak en sik kullanilan query pattern'i `WHERE queue = 2 AND due <= ?` (ve queue=1, queue=3 varyantlari). SQLite bu durumda sadece bir index kullanabiliyor.
- **Recommended**: Composite index eklemek:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_ac_queue_due ON anki_cards(queue, due);
  ```
  Mevcut tekil indexler korunabilir (diger sorgular icin) ama bu composite index queue-based filtreleme + due range scan'i kapsar.
- **Estimated Gain**: Queue sorgularinda ~30-50% hizlanma (index-only scan yerine index scan + table lookup). Daha buyuk koleksiyonlarda (10K+ kart) fark belirginlesir.

---

### [P2] perSubjectStatsSql GROUP BY tags ile tam eslesme yerine ilk tag parsing

- **Location**: `lib/statsHelpers.ts:81-130`
- **Impact**: Medium
- **Current**: `GROUP BY n.tags` ile gruplama yapiliyor ama JS tarafinda `(row.tags || '').split(' ')[0]` ile ilk tag'i aliyor. Farkli tag kombinasyonlari ayni subject icin ayri gruplar olusturuyor, bu da JS'te gereksiz iterasyon yapiyor.
- **Recommended**: SQL tarafinda ilk tag'i extract etmek:
  ```sql
  SELECT SUBSTR(n.tags, 1, INSTR(n.tags || ' ', ' ') - 1) AS subject, ...
  GROUP BY subject, c.queue, ...
  ```
  Bu, gruplama kalitesini artirip JS tarafindaki islemi azaltir.
- **Estimated Gain**: Stats hesaplama suresi ~20-30% azalir, ozellikle cok tag'li notlarda.

---

### [P2] resolveSettingsForDeck cache'i session-scoped degil, request-scoped

- **Location**: `lib/studyRepository.ts:368-378`
- **Impact**: Medium
- **Current**: `settingsCache` Map'i her `getStudyQueue` cagrisi icinde olusturuluyor. Ayni deck config'i her queue rebuild'de tekrar okunuyor (SELECT + JSON.parse per deck).
- **Recommended**: Module-level cache ile `getDeckConfig` sonuclarini kisa sureli (ornegin 5 saniye TTL) cache'lemek. Settings degistiginde invalidate etmek.
- **Estimated Gain**: Queue build'de deck config okumalari ~80% azalir (tipik 10 deck icin 10 SELECT -> 0-1 SELECT).

---

### [P3] toStudyCards icinde her row icin JSON.parse x3

- **Location**: `lib/studyRepository.ts:414-451`
- **Impact**: Low-Medium
- **Current**: Her row icin `JSON.parse(row.noteData)`, `JSON.parse(row.noteTypeData)`, ve (learning kartlar icin) `JSON.parse(row.cardData)` yapiliyor. 200 review kartta 400+ JSON.parse operasyonu.
- **Recommended**: NoteType parse sonuclarini Map ile cache'lemek (genelde 1-4 farkli noteType var). Note parse kacinilmaz ama noteType tekrari onlenebilir.
- **Estimated Gain**: ~15-25% daha az JSON.parse isleminde toStudyCards icinde.

---

### [P3] buildQueue dependency array'inde queue.length

- **Location**: `app/(tabs)/index.tsx:278-286`
- **Impact**: Low
- **Current**: `answerCard` useCallback dependency array'inde `queue.length` var. Her queue degisiminde (her cevaptan sonra) `answerCard` yeniden olusturuluyor, bu da bagli tum useEffect'leri (keyboard handler dahil) yeniden register ettiriyor.
- **Recommended**: `queue.length` kontrolunu ref ile yapmak:
  ```ts
  const queueLengthRef = useRef(queue.length);
  useEffect(() => { queueLengthRef.current = queue.length; }, [queue.length]);
  ```
  ve answerCard icinde `queueLengthRef.current` kullanmak.
- **Estimated Gain**: Her review sonrasi gereksiz useCallback + useEffect re-registration onlenir. UX etkisi minmal ama temiz.

---

### [P3] settings.tsx icinde JSON.stringify ile array karsilastirma

- **Location**: `app/(tabs)/settings.tsx:216-224`
- **Impact**: Low
- **Current**: Learning steps ve lapse steps secenekleri icin `JSON.stringify(settings.learningSteps) === JSON.stringify(steps)` kullaniliyor. Her render'da 8 `JSON.stringify` calisiyor.
- **Recommended**: Basit bir array equality helper fonksiyonu:
  ```ts
  function arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  ```
- **Estimated Gain**: Ihmal edilebilir performans, ama kod temizligi icin degerli.

---

### [P3] exportAllData tum tablolari SELECT * ile cekiyor

- **Location**: `lib/storage.ts:448-456`
- **Impact**: Low
- **Current**: Export sirasinda `SELECT * FROM revlog ORDER BY id` gibi sorgular calistirilip tum veriler memory'ye yukleniyor. Buyuk koleksiyonlarda (50K+ revlog) bu onemli memory spike'a neden olabilir.
- **Recommended**: Streaming/chunked export veya web worker'da calistirma. Ancak bu bir flashcard uygulamasi icin edge case -- su an icin buyuk bir sorun degil.
- **Estimated Gain**: Sadece buyuk koleksiyonlarda (50K+ review log) anlamli.

---

## Quick Wins

1. **Composite index `(queue, due)` ekle** -- Tek bir migration SQL'i. Tum queue sorgularini hizlandirir. (`lib/db.ts` migration v7)

2. **`getSearchIndexCards` yerine SQL-based sidebar sayaclari** -- `_layout.tsx`'deki en buyuk bottleneck. `GROUP BY n.tags` ile basit bir aggregate sorgusu yeterli.

3. **`saveAnkiCard`'a `skipMerge` flagi ekle** -- Review hot path'inde gereksiz SELECT + JSON merge'u atla. Tek parametreli degisiklik.

4. **`answerCard` dependency'sinden `queue.length` cikar** -- useRef ile degistir, gereksiz re-render zincirini kir.

5. **`perSubjectStatsSql` icinde SQL'de ilk tag extract et** -- JS-side split yerine SQL SUBSTR kullan.

6. **JSON.stringify array karsilastirmalarini helper fonksiyonla degistir** -- settings.tsx'de 8 gereksiz stringify kaldiriliyor.

## Deeper Optimizations

1. **`getStudyQueue` icindeki 8 SQL sorgusunu tek unified sorguya birlestir** -- En buyuk performans kazanimi ama refactor gerektiriyor. Queue building logic'ini tek SQL + JS-side bucketing olarak yeniden yapilandir.

2. **Module-level deck config cache** -- `resolveSettingsForDeck` icin TTL-based cache. Settings degistiginde invalidate hook'u gerekiyor.

3. **`unburyAllCards` batch UPDATE** -- N+1 pattern'i kaldirmak icin SQL-only restore logic'i. `data` blob senkronizasyonu icin ek mantik gerekiyor.

4. **Periodic refresh'i visibility-aware yap** -- 45sn interval yerine `document.visibilitychange` + `nextLearningDue` timer'ina dayali akilli refresh. Mobile'da `AppState` event'i.

5. **NoteType parse cache** -- toStudyCards icinde ayni noteType'in tekrar tekrar parse edilmesini onlemek icin `Map<number, NoteType>` cache. Genelde 1-4 farkli noteType oldugu icin etkili.

6. **FTS index'i incremental tut** -- Su an `dbIndexAllCards` her reset/import'ta tum indexi yeniden yapiyor. Review sirasinda zaten `dbUpsertFtsCard` var ama bazi path'lerde (migration, import) bulk rebuild yerine incremental upsert kullanilabilir.

## Validation Plan

1. **Before/After olcumu icin**: Her `getStudyQueue` cagrisi etrafina `console.time('buildQueue')` / `console.timeEnd('buildQueue')` ekle. Ayni sekilde `toStudyCards`, `saveAnkiCard` ve `getSearchIndexCards` icin.

2. **Kart sayisi bazli test**: 1K, 5K ve 10K kartlik test koleksiyonlari olustur. Her seviyede queue build suresi, review suresi ve stats hesaplama suresini olc.

3. **React DevTools Profiler**: `_layout.tsx` ve `index.tsx` re-render sayisini profiler ile izle. `dataVersion` bump sonrasi gereksiz render zincirlerini tespit et.

4. **SQLite EXPLAIN QUERY PLAN**: Composite index eklenmeden once ve sonra `EXPLAIN QUERY PLAN SELECT ... WHERE queue = 2 AND due <= ?` ile query plan'i karsilastir.

5. **Memory profiling**: `getSearchIndexCards` oncesi ve sonrasi heap snapshot al. SQL-based sayac implementasyonu sonrasi ayni olcumu tekrarla.

6. **Pratik kullanim testi**: 5K kartlik koleksiyonda 20 ardisik review yaparken kullanici hissedilebilir gecikme (>100ms) olup olmadigini olc. Hedef: review basina <50ms toplam islem suresi.
