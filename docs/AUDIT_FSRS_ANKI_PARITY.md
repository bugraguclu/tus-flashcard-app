# FSRS – Anki eşdeğerlik denetimi

**Tarih:** 4 Eylül 2026
**Dal:** `ui-revize`
**Kapsam:** `lib/fsrs.ts`, `lib/fsrsScheduler.ts`, `lib/fsrsCardData.ts`, `lib/fsrsMemory.ts`,
`lib/fsrsMaintenance.ts`, `lib/fsrsOptimizer.ts` ve bunların `lib/scheduler.ts` ile
`lib/reviewLogger.ts` ile temas noktaları.
**Yöntem:** Yayımlanmış FSRS-6 spesifikasyonu ve Anki'nin kendi kaynak sözleşmesi okunarak formül
formül karşılaştırma; bulunan her kural için elde hesaplanmış beklenen sayılarla odaklı test.
**Lisans notu:** Anki ve fsrs-rs GPL/BSD ailesindendir. Bu denetimde hiçbir satır kopyalanmadı veya
mekanik olarak çevrilmedi; yalnızca yayımlanmış denklemler ve gözlenebilir sözleşme referans alındı.
Kullanılan kaynaklar `docs/anki-reference-sources.json` içine işlendi.

## Kısa sonuç

Çekirdek FSRS-6 matematiği ve tekrar aralığı sözleşmesi **Anki ile eşleşiyor**; bu denetimde bunu
gösteren golden vektörler eklendi. Üç gerçek sapma bulundu ve düzeltildi, üç sapma bilinçli fark
olarak belgelendi, bir alan (`Son tarihi ayarla`) FSRS'ten habersiz olduğu için **sapıyor** ve bu
denetimin dosya kapsamı dışında kaldığından yalnızca öneri olarak yazıldı.

**Ürün hâlâ "Anki FSRS ile birebir aynı" diye sunulmamalıdır.** Optimizer kasıtlı olarak Anki'nin
eğiticisi değildir ve `Son tarihi ayarla` FSRS altında yanlış aralık yazar.

## Verdict tablosu

| # | Konu | Verdict | Dosya / satır | Anki'de beklenen | Burada gözlenen | Kaynak |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FSRS sürümü ve parametre sayısı | **matches** | `lib/fsrs.ts:43-52` | FSRS-6, 21 parametre | FSRS-6, `FSRS_PARAMETER_COUNT = 21` | [algorithm wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) |
| 2 | Varsayılan parametre vektörü | **matches** | `lib/fsrs.ts:50-54` | `0.212 … 0.1542` (21 değer) | Aynı vektör, eleman eleman | [fsrs-rs model.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs) |
| 3 | Parametre sınırları (zamanlama) | **matches** | `lib/fsrs.ts:80-102` | `FSRS::new` kırpması: w17/w18 `(0, 2]`, w19 `[0, 0.8]`, w20 `[0.1, 0.8]` | Aynı tablo | [parameter_clipper.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/parameter_clipper.rs) |
| 4 | Parametre sınırları (eğitim) | **diverges → düzeltildi** | `lib/fsrs.ts:131-176`, `lib/fsrsOptimizer.ts` | Eğitimde w17/w18 tavanı yeniden öğrenme adımı sayısıyla düşer; kısa vadeli açıkken w19 tabanı `0.01` | Önce sabit `(0, 2]` / `[0, 0.8]` idi. Artık `clampFsrsParameters(params, { numRelearningSteps, enableShortTerm })` upstream'in eşitsizliğini uyguluyor | [parameter_clipper.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/parameter_clipper.rs) |
| 5 | 17 → 21 ve 19 → 21 parametre dönüşümü | **matches** | `lib/fsrs.ts:113-130` | `w4 += 2·w5`, `w5 = ln(3·w5+1)/3`, `w6 += 0.5`, sonra `[0,0,0,0.5]`; 19'luk için `[0, 0.5]` | Aynı | [model.rs `check_and_fill_parameters`](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs) |
| 6 | Unutma eğrisi (power forgetting curve) | **matches** | `lib/fsrs.ts:200-211` | `R = (1 + FACTOR·t/S)^(−w20)`, `FACTOR = 0.9^(−1/w20) − 1` | Aynı; `FACTOR` sabit yazılmamış, `decay`'den türetiliyor | [algorithm wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) |
| 7 | `nextInterval` | **matches** | `lib/fsrs.ts:213-218` | `I = S/FACTOR · (r^(−1/w20) − 1)` | Aynı | [inference.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/inference.rs) |
| 8 | İlk stability / ilk difficulty | **matches** | `lib/fsrs.ts:220-227` | `S0 = w[G−1]`, `D0 = w4 − e^(w5·(G−1)) + 1` | Aynı; golden vektörle sabitlendi | `lib/fsrs.test.ts` "reproduces upstream's published first-review next-states" |
| 9 | Difficulty güncellemesi (linear damping + mean reversion) | **matches** | `lib/fsrs.ts:229-241` | `ΔD = −w6·(G−3)`, `D' = D + ΔD·(10−D)/9`, sonra `w7·(D0(4) − D') + D'` | Aynı (FSRS-6 biçimi; FSRS-4 mean reversion'ı değil) | [model.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs) |
| 10 | Başarılı tekrar sonrası stability (SInc) | **matches** | `lib/fsrs.ts:243-261` | `S·(e^w8·(11−D)·S^(−w9)·(e^((1−R)·w10) − 1)·hard·easy + 1)` | Aynı, w15/w16 doğru derecelere bağlı | [model.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs) |
| 11 | Unutma sonrası stability (post-lapse) | **matches** | `lib/fsrs.ts:263-276` | `min(w11·D^(−w12)·((S+1)^w13 − 1)·e^((1−R)·w14), S/e^(w17·w18))` | Aynı; FSRS-6'nın kısa vadeli tavanı dâhil | `lib/fsrs.test.ts` "never lets a lapse raise stability above the short-term ceiling" |
| 12 | Aynı gün tekrar (short-term) stability | **matches** | `lib/fsrs.ts:278-281` | `S·e^(w17·(G−3+w18))·S^(−w19)`, çarpan `G ≥ 2` için 1'e tabanlanır | Aynı — `rating >= 2` üst kaynakla birebir | `lib/fsrs.test.ts` "floors the same-day multiplier at 1 for Hard, Good and Easy but not Again" |
| 13 | İlk tekrar dalı (`nth == 0 && S == 0`) | **matches** | `lib/fsrs.ts:289-330` | İlk tekrar durum güncellemesi değil, başlangıç parametrelerinden gelir | `isFirstReview` bayrağı aynı ayrımı yapıyor | [model.rs `step`](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs) |
| 14 | Fuzz aralıkları | **matches** | `lib/schedulingIntervals.ts:72-124` | 2.5 günün altı fuzzsuz; üstünde 1 gün + 2.5–7 %15, 7–20 %10, 20+ %5; `constrained_fuzz_bounds` kırpması | Anki'nin kendi test tablosunun 15 satırı birebir üretiliyor | `lib/fsrsScheduler.test.ts` "matches Anki's fuzz windows exactly" |
| 15 | Fuzz determinizmi | **diverges (bilinçli)** | `lib/schedulingIntervals.ts:128-149` | Tohum `card.id + card.reps`; `StdRng`'den `[0,1)` çarpan | Tohum `çalışma günü + cardId` DJB2 hash'i. Pencere aynı, seçilen değer aynı değil | [fuzz.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/fuzz.rs) |
| 16 | `minimumReviewFuzzInterval` | **matches** | `lib/schedulingIntervals.ts:151-165` | Büyüyen aralıkta `previous + 1`, pencere içindeyse `previous`, gerçekten küçüldüyse `0` | Aynı; upstream'in üç iddiası test edildi | `lib/fsrsScheduler.test.ts` "keeps fuzz from clawing back a grown interval" |
| 17 | `maximumInterval` kırpması ve yuvarlama | **matches** | `lib/fsrsScheduler.ts` (tüm çıkışlar) | Geçen dereceler `round().max(1)` sonra `[minimum, maximum]` | Aynı | [review.rs `constrain_passing_interval`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |
| 18 | Tekrar kartında Hard/Good/Easy zincirlemesi | **matches** | `lib/fsrsScheduler.ts:313-329` | `hard ≥ 1`, `good ≥ hard+1`, `easy ≥ good+1`; her biri ayrıca `minimum_review_fuzz_interval` tabanına saygı duyar | Aynı | [review.rs `passing_fsrs_review_intervals`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |
| 19 | `easyBonus` / `intervalModifier` / `hardFactor` FSRS altında | **matches** | `lib/fsrsScheduler.ts` (hiç okunmuyor) | FSRS açıkken bu üç ayar uygulanmaz; deste seçeneklerinde gizlenir | FSRS motoru bu alanlara hiç dokunmuyor | [deck options manual](https://docs.ankiweb.net/deck-options.html), [review.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |
| 20 | `graduatingInterval` / `easyInterval` FSRS altında | **matches** | `lib/fsrsScheduler.ts:158-215` | FSRS açıkken mezuniyet aralığı FSRS'ten gelir, sabit değerlerden değil | Aynı | [learning.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/learning.rs) |
| 21 | Öğrenme/yeniden öğrenme adımları | **matches** | `lib/fsrsScheduler.ts:158-277` | Adım varsa adım süresi; adım bittiğinde FSRS aralığı; adım yokken/`short term with steps` açıkken 0.5 günün altındaki FSRS aralığı kartı öğrenmede tutar | Aynı üçlü koşul (`fsrsAllowsShortTerm && (shortTermWithSteps || steps.length === 0) && interval < 0.5`) | [learning.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/learning.rs), [relearning.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/relearning.rs) |
| 22 | `fsrsAllowsShortTerm` | **matches** | `lib/fsrsScheduler.ts:72-74` | `params.len() >= 19 && w17 > 0 && w18 > 0`, boş parametrede `true` | Aynı (parametreler her zaman 21'e normalize edildiği için boş dal doğal olarak `true`) | [answering/mod.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/answering/mod.rs) |
| 23 | Tekrar kartında `Again` | **matches** | `lib/fsrsScheduler.ts:279-311` | FSRS aralığı fuzz'suz saklanır; fuzz kart yeniden öğrenmeden çıkarken uygulanır | Aynı; kodda da bu gerekçe yazılı | [review.rs `failing_review_interval`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |
| 24 | `newInterval` (lapse çarpanı) FSRS altında | **matches** | `lib/fsrsScheduler.ts:279-311` | FSRS açıkken lapse çarpanı ve minimum lapse aralığı kullanılmaz | Kullanılmıyor | [review.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |
| 25 | Leech eşiği | **diverges → düzeltildi** | `lib/noteManager.ts:455-461` | `let half_threshold = (threshold as f32 / 2.0).ceil().max(1.0) as u32;` — **f32 bölme ve `.ceil()`**, tamsayı bölmesi değil; fonksiyonun kendi yorumu "Non-even thresholds round up the half threshold" diyor | Önce `Math.max(1, Math.floor(threshold / 2))` idi — aşağı yuvarlıyordu ve tek sayılı eşiklerde her lapse'te tetikleniyordu. Artık `Math.ceil`; `lib/noteManager.leech.test.ts` upstream'in eşik 3 ve 7 dizilerini sabitliyor | [review.rs L292-L302 @8127fd2](https://github.com/ankitects/anki/blob/8127fd24884607d7c62bdd28675d9ab9cc53e005/rslib/src/scheduler/states/review.rs#L292-L302) |
| 26 | Hafıza durumunun kalıcılığı (`cards.data`) | **matches** | `lib/fsrsCardData.ts` | `s`/`d`/`dr`/`decay`/`lrt`/`pos`/`cd` anahtarları; bilinmeyen anahtarlar korunur | Aynı anahtarlar, bilinmeyenler korunuyor | [Anki `card/data.rs`](https://github.com/ankitects/anki/tree/main/rslib/src/storage/card) |
| 27 | `desiredRetention` kaynağı | **matches** | `lib/settingsResolver.ts:69` | Preset başına; kart üzerine ayrıca yazılır ama zamanlayıcı preset'ten okur | Preset (deck config) başına çözülüyor, karta `dr` olarak yazılıyor | [memory_state.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 28 | `desiredRetention` sınırlaması | **diverges (bilinçli, savunmacı)** | `lib/fsrs.ts:213-218` | `next_interval` sınırlamaz; sınır deste seçenekleri formunda | `fsrsNextInterval` `[0.70, 0.99]` aralığına kırpıyor. Form aynı sınırı uyguladığı için gözlenebilir fark yok | [deck options manual](https://docs.ankiweb.net/deck-options.html) |
| 29 | Revlog kaydı seçimi (hangi satırlar FSRS'e girer) | **matches** | `lib/fsrsMemory.ts:122-202` | Cramming (`type=3, factor=0`) atlanır; manual/rescheduled derecesiz olduğu için elenir; geçmiş son öğrenme koşusuna kadar geri okunur; reset öncesi atılır | Kural kural aynı; `affectsScheduling = hasRating && !isCramming` | [params.rs `reviews_for_fsrs`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/params.rs) |
| 30 | Tekrarlar arası gün farkı (`delta_t`) | **matches** | `lib/fsrsMemory.ts:79-81, 194-202` | `days_elapsed(prev) − days_elapsed(cur)`, gün sayısı bir sonraki rollover'a göre taban alınır | Aynı; ilk kayıt için `0` | [params.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/params.rs) |
| 31 | Aynı gün tekrarlarının birleştirilmesi | **matches** | `lib/fsrsMemory.ts:194-202` | Birleştirilmez; `delta_t = 0` olarak modele girer ve short-term formülünü tetikler | Aynı | [params.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/params.rs) |
| 32 | Geçmişi kesilmiş kartın SM-2 tohumu | **matches** | `lib/fsrsMemory.ts:204-225` | İlk sağlam derecenin SM-2 değerlerinden başlangıç durumu, kalan tekrarlar üstüne oynatılır | Aynı; FSRS'in kendi yazdığı `factor ≤ 1100` satırında "ease" sütununun difficulty taşıdığı özel durum da ele alınmış | [memory_state.rs `fsrs_item_for_memory_state`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 33 | Hiç kullanılabilir geçmişi olmayan kart | **diverges (bilinçli, zamanlama farkı)** | `lib/fsrsMemory.ts:226-228` | Toplu `update_memory_state` bu kartlara `memory_state = None` yazar; SM-2 tahmini kart ilk kez cevaplanırken (`set_memory_state`) üretilir | Toplu yeniden kurulumda SM-2 tahmini hemen yazılıyor | [memory_state.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 34 | SM-2 → hafıza durumu formülü | **matches** | `lib/fsrs.ts:353-386` | `S = ivl·FACTOR/(R^(1/DECAY) − 1)`, `D = 11 − (EF−1)/(e^w8·S^(−w9)·(e^((1−R)·w10) − 1))` | Aynı | [inference.rs `memory_state_from_sm2`](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/inference.rs) |
| 35 | Deste seçeneği değişiminde yeniden zamanlama — fuzz tabanı | **diverges → düzeltildi** | `lib/fsrsMaintenance.ts:212-224` | Taban, kartın **son cevaptan önceki** aralığıdır (`get_last_revlog_info.previous_interval`); Again ise taban yoktur | Önce kartın **şu anki** `ivl`'i kullanılıyordu; artık revlog'daki `lastIvl` okunuyor | [memory_state.rs `get_last_revlog_info`](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 36 | Yeniden zamanlamada yeni `due` | **matches** | `lib/fsrsMaintenance.ts:231-240` | `bugün − sonTekrardanBeriGeçenGün + yeniAralık` | Aynı; artık sonTekrar zamanı da revlog'dan (kart alanı yalnızca yedek) | [memory_state.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 37 | Yeniden zamanlama kapsamı | **matches** | `lib/fsrsMaintenance.ts:164-175` | Yalnızca `type = Review` ve askıya alınmamış kartlar | Aynı (`card.type === 2 && card.queue >= 0`) | [memory_state.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 38 | Hatırlanabilirlik okuması (`decay` kırpması) | **diverges → düzeltildi** | `lib/fsrs.ts:405-416` | Zamanlayıcı her zaman kırpılmış parametrelerden çalışır | `fsrsCurrentRetrievability` kırpılmamış `decay` kullanıyordu; artık kırpıyor | [parameter_clipper.rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/parameter_clipper.rs) |
| 39 | Kart bilgisi ekranında zorluk gösterimi | **matches** | `app/card-info.tsx:239` | `(D − 1)/9` yüzde olarak | Aynı | [Anki card info](https://docs.ankiweb.net/stats.html) |
| 40 | Kart bilgisinde hatırlanabilirlik ve hedef hatırlama | **matches** | `app/card-info.tsx:85-90, 250-258` | Kartın kendi `decay`/`dr` değerlerinden okunur | Aynı (`cardData.decay`, `cardData.desiredRetention`) | [memory_state.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/fsrs/memory_state.rs) |
| 41 | Optimizer sözleşmesi | **diverges (bilinçli ve belgelenmiş)** | `lib/fsrsOptimizer.ts:1-22` | Anki tensör çerçevesinde tam geri yayılım, recency ağırlıklandırma ve ayrı bir başlangıç-stability ön eğitimi çalıştırır | Burada mini-batch Adam + sayısal gradyan. Parametre sırası, sayısı, kırpma kutusu ve "daha iyiyse kabul et" kuralı aynı; **üretilen sayılar aynı değildir** | [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) |
| 42 | Optimizasyon için minimum tekrar sayısı | **unverifiable** | `lib/fsrsOptimizer.ts:63-66` | Manual sayısal bir eşik vermiyor; "birkaç yüzün altında optimize edilemez" diyor | Yerelde `8` sert alt sınır, `400` uyarı eşiği | [deck options manual](https://docs.ankiweb.net/deck-options.html) |
| 43 | Filtreli / önizleme kartları FSRS altında | **kısmen: FSRS matches, revlog diverges** | `lib/studyRepository.ts:1860-1871` | Önizleme FSRS'i hiç çağırmaz ve kalıcı zamanlamayı değiştirmez — bu doğru. Buna karşılık `apply_preview_state` bir `RevlogEntryPartial::new(current, next, 0.0, …)` döndürür (ease factor `0.0`, `is_cramming()`'i tam olarak bu sağlar) ve bu satır `add_partial_revlog` ile koşulsuz yazılır; ayrıca kart `PreviewRepeat` kuyruğuna alınıp `due` bulanıklaştırılmış zaman damgasına çekilir | Zamanlama tarafı aynı: önizleme yanıtı hiçbir kalıcı kart alanını değiştirmiyor (oturum içi tekrar kuyruk katmanında ele alınıyor). Ancak cramming revlog satırı hiç yazılmıyor. FSRS bu satırları zaten elediği için hafıza durumunu etkilemez; istatistikleri ve içe/dışa aktarımı etkiler | [preview.rs @0e31efa](https://github.com/ankitects/anki/blob/0e31efac08cddf0a43ad0b44f05f2a8e6ef0d91a/rslib/src/scheduler/answering/preview.rs#L12-L36), [answering/mod.rs L335-336 @fd65f20](https://github.com/ankitects/anki/blob/fd65f20fcd277da9ed156ed72b534a549742096d/rslib/src/scheduler/answering/mod.rs#L335-L336) |
| 44 | `Son tarihi ayarla` FSRS altında | **diverges (düzeltilmedi — kapsam dışı)** | `lib/studyRepository.ts:2022-2037` | FSRS açıkken yeni/`ivl = 0` kart için aralık `0` kalır; aksi hâlde `geçenGün + istenenGün`. Ayrıca `!` (aralığı da değiştir) biçimi vardır | Her durumda `ivl = max(1, gün)` yazılıyor; `!` biçimi yok; hafıza durumu güncellenmiyor | [reviews.rs `Card::set_due_date` L28-L67 @1d12b11](https://github.com/ankitects/anki/blob/1d12b11cddc06699f47296476b939143a86970a7/rslib/src/scheduler/reviews.rs#L28-L67) |
| 45 | Manuel yeniden zamanlamanın revlog'a yazılması | **not implemented** | `lib/reviewLogger.ts` | Anki `set due date` ve `forget` için `type = 4/5` manual satır yazar; FSRS bunları derecesiz olduğu için eler ama "reset" tespiti buna dayanır | Manual satır yazılmıyor; dolayısıyla `isReset` yolu yerel veride hiç tetiklenmiyor (içe aktarılan koleksiyonlarda tetikleniyor) | [revlog/mod.rs](https://github.com/ankitects/anki/tree/main/rslib/src/revlog) |
| 46 | "Kolay günler" (easy days) FSRS aralığını kaydırıyor | **diverges (ürün özelliği)** | `lib/studyRepository.ts:1877-1886` | Anki'de easy days yük dengeleyicinin bir parçasıdır ve aralığı fuzz penceresi içinde kaydırır | Burada FSRS aralığı fuzz'dan *sonra* haftanın gününe göre ayrıca kaydırılıyor; kayma fuzz penceresiyle sınırlı değil | [deck options manual](https://docs.ankiweb.net/deck-options.html) |
| 47 | Ease factor'ün FSRS altında da yürütülmesi | **diverges (bilinçli fark)** | `lib/fsrsScheduler.ts:341-350` | Anki FSRS'te ease factor'ü yalnızca mezuniyet anında yazar; sonraki cevaplarda `EASE_FACTOR_*_DELTA` uygular (SM-2 ile aynı kod yolu) | Aynı deltalar uygulanıyor — bu yüzden fark yok; ancak burada mezuniyet dışındaki her cevapta da uygulanması Anki'nin `answer_hard/good/easy` davranışıyla örtüşüyor | [review.rs](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs) |

## Düzeltilenler

1. **Eğitim zamanı parametre kutusu** (`lib/fsrs.ts`, `lib/fsrsOptimizer.ts`)
   `clampFsrsParameters` artık isteğe bağlı `{ numRelearningSteps, enableShortTerm }` alıyor.
   Birden fazla yeniden öğrenme adımı olan bir preset'te w17/w18 tavanı upstream'in eşitsizliğinden
   türetiliyor (`steps · w17 · w18 ≤ −[ln w11 + ln(2^w13 − 1) + 0.3·w14]`), kısa vadeli zamanlama
   açıkken w19'a `0.01` tabanı konuyor. **Seçenek verilmediğinde davranış birebir eskisi gibidir**,
   yani mevcut zamanlama hiç değişmedi.
   Test: `lib/fsrs.test.ts` → "training-time parameter bounds".

   > **Kapandı (7 Eylül 2026):** çağrı yeri artık seçenekleri geçiriyor —
   > `app/deck-options.tsx` içinde `optimizeFsrsParameters(items, { …, clamp: { numRelearningSteps,
   > enableShortTerm: form.fsrsShortTermWithSteps } })`. Yeniden öğrenme adımı sayısı düzenlenen
   > preset'in kendi alanından okunuyor; ayrıştırılamayan bir adım metni tek adımlı tavana düşüyor.

2. **Yeniden zamanlamada fuzz tabanı ve son tekrar zamanı** (`lib/fsrsMemory.ts`,
   `lib/fsrsMaintenance.ts`)
   Yeni `fsrsLastReviewInfo`, Anki'nin `get_last_revlog_info` fonksiyonunu karşılıyor: revlog ileri
   yönde taranıyor, zamanlamayı etkileyen son cevap ve o cevaptan **önceki** aralık saklanıyor,
   reset satırı ikisini de sıfırlıyor. `rescheduledFields` artık kartın güncel `ivl`'i yerine bu
   değeri fuzz tabanı olarak kullanıyor ve yeni `due`'yu revlog'daki son tekrar zamanına
   çapalıyor. Revlog sorgusuna `lastIvl` sütunu eklendi.
   Test: `lib/fsrsMemory.test.ts` → "last-review info for rescheduling".

3. **Hatırlanabilirlik kırpılmış `decay` ile okunuyor** (`lib/fsrs.ts`)
   `fsrsCurrentRetrievability` artık `decay`'i kırpılmış parametrelerden alıyor; aralık dışı bir
   `w20` ile zamanlayıcının asla kabul etmeyeceği bir yüzde gösterilemiyor.
   Test: `lib/fsrs.test.ts` → "reads retrievability through the clamped decay".

## Eklenen kanıt testleri

| Test | Ne sabitliyor |
| --- | --- |
| `lib/fsrs.test.ts` "reproduces upstream's published first-review next-states" | fsrs-rs'in `next_states` doc-test vektörü: dört dereceye ait ilk stability, ilk difficulty (Easy'nin `1.0`'a kırpılması dâhil) ve %90 hedefte aralık = stability |
| `lib/fsrs.test.ts` "never lets a lapse raise stability above the short-term ceiling" | FSRS-6'nın post-lapse tavanı `S / e^(w17·w18)` |
| `lib/fsrs.test.ts` "floors the same-day multiplier at 1 for Hard, Good and Easy but not Again" | Short-term çarpanının `G ≥ 2` tabanı |
| `lib/fsrs.test.ts` "reads retrievability through the clamped decay" | `decay` kırpmasının gösterim yoluna da uygulanması |
| `lib/fsrs.test.ts` "training-time parameter bounds" (3 test) | Zamanlama kutusunun değişmediği + eğitim kutusunun upstream formülü |
| `lib/fsrsMemory.test.ts` "last-review info for rescheduling" (3 test) | Geçen cevabın önceki aralığı, Again'in taban bırakmaması, reset ve cramming davranışı |
| `lib/fsrsScheduler.test.ts` "review interval fuzz" (3 test) | Anki'nin kendi fuzz test tablosundaki 15 pencerenin birebir üretilmesi, seçimin pencere içinde ve deterministik olması, `minimumReviewFuzzInterval`'in upstream iddiaları |

## Düzeltilmeyenler ve gerekçeleri

- **Fuzz tohumu (madde 15).** Anki `card.id + card.reps` tohumundan `[0,1)` bir çarpan üretir; burada
  çalışma günü + kart kimliği hash'lenir. Pencere ve determinizm garantisi aynı, seçilen gün
  farklıdır. Bunu değiştirmek her kullanıcının gelecekteki bütün aralıklarını yeniden çeker;
  düzeltilecek bir hata değil, uyumlu bir uygulama tercihi. Değiştirilmedi.
- **Toplu yeniden kurulumda SM-2 tahmini (madde 33).** Anki bu tahmini kart ilk cevaplanana kadar
  ertelerken burada hemen yazılıyor. Kart cevaplandığında iki taraf da aynı hafıza durumuna varır;
  fark yalnızca kart bilgisi ekranının ne zaman dolduğudur. Değiştirilmedi.
- **`desiredRetention` kırpması (madde 28).** Form zaten `[0.70, 0.99]` uyguluyor; ikinci kırpma
  savunmacı ve gözlenebilir bir fark üretmiyor.
- **Optimizer (madde 41).** Anki'nin eğiticisiyle aynı sayıları üretmiyor ve üretemez. Dosyanın
  başındaki açıklama bunu zaten açıkça söylüyor; bu denetim onu üstünü örtmek yerine tabloya
  "diverges" olarak yazar.
- **`Son tarihi ayarla` (madde 44).** Gerçek bir sapma ve düzeltilmeye değer, fakat kod
  `lib/studyRepository.ts` içinde ve bu denetimin dokunma kapsamı dışında. Önerilen davranış:
  FSRS açıkken yeni veya `ivl = 0` kart için `ivl = 0` bırakmak, aksi hâlde
  `ivl = sonTekrardanBeriGeçenGün + istenenGün` yazmak, hafıza durumuna dokunmamak ve `!` biçimini
  (aralığı da sıfırla) desteklemek.
- **Leech yarım eşiği (madde 25) — bu denetimden sonra düzeltildi.** Bu bulgu itiraz üzerine
  ikinci kez doğrulandı ve ardından `lib/noteManager.ts` içinde `Math.floor` → `Math.ceil`
  olarak giderildi; `lib/noteManager.leech.test.ts` upstream'in eşik 3 (3/5/7) ve eşik 7
  (7/11/15) dizilerini sabitliyor. Varsayılan eşik 8 çift olduğu için mevcut kullanıcıların
  çoğu etkilenmiyordu; sapma yalnızca tek sayılı eşiklerde görünüyordu. Doğrulama kaydı: Upstream'in
  aritmetiği tamsayı bölmesi **değildir**; `threshold` önce `f32`'ye çevrilir, bölünür ve `.ceil()`
  uygulanır:

  ```rust
  // rslib/src/scheduler/states/review.rs:292-302
  /// True when lapses is at threshold, or every half threshold after that.
  /// Non-even thresholds round up the half threshold.
  fn leech_threshold_met(lapses: u32, threshold: u32) -> bool {
      if threshold > 0 {
          let half_threshold = (threshold as f32 / 2.0).ceil().max(1.0) as u32;
          // at threshold, and every half threshold after that, rounding up
          lapses >= threshold && (lapses - threshold) % half_threshold == 0
      } else {
          false
      }
  }
  ```

  Upstream'in kendi testi eşik 3 için `3, 5, 7`'de tetiklenip `4` ve `6`'da tetiklenmemesini şart
  koşuyor (`assert!(!leech_threshold_met(4, 3))`, `assert!(!leech_threshold_met(6, 3))`). Bizim
  `Math.floor(3 / 2) = 1` sonucuyla `(lapses - 3) % 1 === 0` her zaman doğru olur, yani 4 ve 6'da da
  tetikleniriz — upstream'in iki iddiasını birden ihlal eden somut fark budur. Eşik 7 için upstream
  `ceil(3.5) = 4` ile `7, 11, 15`; biz `floor(3.5) = 3` ile `7, 10, 13`. Çift eşiklerde (varsayılan
  8 dâhil) iki taraf aynıdır, sapma yalnızca tek eşiklerde görünür.

  "Eski Python `threshold // 2` kullanıyordu, dolayısıyla aşağı yuvarlama doğrudur" itirazı bugünkü
  kaynak için geçerli değil: `pylib/anki/scheduler/v3.py` artık aritmetiği içermiyor, yalnızca
  `state_is_leech` ile Rust arka ucuna devrediyor. Güncel Anki'de tek doğruluk kaynağı yukarıdaki
  fonksiyondur.

- **Manuel yeniden zamanlama revlog satırı (madde 45).** `set due date` / `forget` için `type = 4/5`
  satırı yazılmadığı sürece yerel olarak üretilen bir koleksiyonda "reset" tespiti hiç
  tetiklenmez. İçe aktarılan koleksiyonlarda kural doğru çalışıyor.

## Doğrulanamayanlar

- **Optimizasyon için minimum tekrar sayısı (madde 42).** Anki manuali sayısal bir eşik vermiyor,
  yalnızca sağlık kontrolünün "birkaç yüzün altında" uyardığını söylüyor. Yerel `8` / `400`
  değerleri makul ama upstream'den doğrulanabilir değil.
- **Yük dengeleyici (load balancer).** Anki'nin `find_interval`'i fuzz penceresi içinde günlük yükü
  düzleştirir. Burada karşılığı yok; bu denetimde ayrı bir eksik olarak sayıldı, ama FSRS
  matematiğinin bir parçası olmadığı için tabloya alınmadı.
- **Gerçek cihazda uçtan uca FSRS turu.** Bu denetim tamamen deterministik birim testleriyle
  yürütüldü; iPhone üzerinde FSRS açıkken tam bir öğrenme→mezuniyet→lapse turu koşulmadı.

## Çalıştırılan doğrulama

```
npx vitest run lib/fsrs lib/scheduler   → 7 dosya, 111 test, tamamı geçti
npx tsc --noEmit                        → bu denetimin dosyalarında hata yok
```

`npm run quality` bilinçli olarak çalıştırılmadı: denetim sırasında çalışma ağacında eşzamanlı
başka değişiklikler vardı. `npx tsc --noEmit` yalnızca `lib/richTextCommands.ts` içinde, bu
denetimin dokunmadığı ve eşzamanlı olarak düzenlenen bir dosyada hata bildirdi.

---

# İkinci geçiş — 6 Eylül 2026

Birinci geçişte "düzeltilmedi" ya da "not implemented" olarak bırakılan maddeler yeniden ele
alındı. Aşağıdakiler bu geçişte kapatıldı.

## Kapatılan maddeler

### Madde 44 — `Son tarihi ayarla` FSRS altında → **düzeltildi**

Kural artık tek bir saf fonksiyonda: `setDueDateInterval` (`lib/schedulingIntervals.ts`).

- SM-2'de aralık yalnızca kullanıcı sondaki `!` ile istediğinde değişir; tekrar kartı kazandığı
  aralığı korur.
- FSRS'te yeni kart veya `ivl = 0` olan kart **`0`'da kalır**. Gün sayısı yazmak, kartın hiç
  yaşamadığı bir tekrar geçmişi uydurmak olurdu.
- FSRS'te diğer her kart `sonTekrardanBeriGeçenGün + istenenGün` alır, böylece saklanan aralık
  kartın gerçekten görülmeden geçireceği aralığın tamamını anlatır.
- `!` her iki motorda da kuralın önüne geçer.

Sapmanın **iki** çağrı yeri olduğu görüldü; birinci geçiş yalnızca birini saymıştı:
`setSelectedDueDate` (tarayıcı, aralık ve `!` destekli) ve `setCardDueInDays` (okuyucu, tek kart).
İkisi de artık aynı fonksiyondan geçiyor — aynı komut, hangi ekrandan çağrıldığına göre farklı
anlama gelmiyor. `!` biçimi zaten `parseDueRange` içinde vardı; birinci geçişin "`!` biçimi yok"
tespiti güncelliğini yitirmişti.

> **Davranış değişikliği:** `setCardDueInDays` eskiden her tekrar kartının aralığını
> `max(1, gün)` yapıyordu — 6 günlük bir kartı "bugün" diye işaretlemek aralığını 1'e düşürüyordu.
> Artık aralığa dokunmuyor. `lib/studyRepository.answer.test.ts` içindeki ilgili test eski
> davranışı sabitlediği için yeni kurala göre güncellendi.

Test: `lib/browserSelection.test.ts` → "setDueDateInterval" (7 test).

### Madde 45 — Manuel yeniden zamanlamanın revlog'a yazılması → **uygulandı**

`logManualEntry` (`lib/reviewLogger.ts`) Anki'nin derecesiz satırlarını yazıyor. İki tür
**birbirinin yerine geçmez**:

- `reset` → `type = 4`, `factor = 0`. `fsrsMemory`'deki `isReset()` tam olarak bu çifti arıyor.
  `forgetCard` artık bu satırı bırakıyor; böylece "reset" tespiti **ilk kez** yerel olarak
  üretilen koleksiyonlarda da çalışıyor. Bu, birinci geçişin açıkta bıraktığı gerçek eksikti.
- `rescheduled` → `type = 5`. `Son tarihi ayarla` bunu bırakıyor. FSRS için etkisiz (derecesiz),
  ama değişiklik kart bilgisinde görünüyor ve dışa aktarımda korunuyor. Reset olarak
  okunmadığı için bir kartı ileri atmak hafıza durumunu **silmiyor**.

`lib/models.ts` içindeki `ReviewLog` buna göre genişletildi: `ease: 0 | 1 | 2 | 3 | 4`,
`type: 0 | … | 5`. `ease = 0`, Anki'de olduğu gibi "bu satır bir cevap değil" işaretidir.

**Tüketicilerin denetimi (bu maddenin asıl işi).** Revlog'a yeni satır türü eklemek, o satırları
saymayan her sorguyu bozar. Deposundaki bütün revlog sorguları tarandı ve sayım yapan
**18 sorguya** `ease != 0` koşulu eklendi: `lib/reviewLogger.ts` (15), `lib/ankiStats.ts` (2,
eski `type != 4` koşulu `ease != 0` ile değiştirildi — bu, type 5'i de eliyor) ve
`lib/studyCalendar.ts` (1). Koşullar satırlar yazılmaya başlamadan **önce** eklendi, böylece ağaç
hiçbir anda korumasız satır barındırmadı.

`getReviewsForCard` bilinçli olarak korumasız bırakıldı: kart bilgisi ekranı manuel satırları
göstermeli, Anki de gösteriyor.

Testler:
- `lib/studyRepository.answer.test.ts` → "leaves the reset marker FSRS looks for when a card is
  forgotten", "records a reschedule rather than a reset when the due date is set"
- `lib/studyCalendar.test.ts` → "ignores the rating-less rows a reschedule leaves behind",
  "keeps a real answer that sits between two bookkeeping rows"

### Madde 46 — "Kolay günler" fuzz penceresinin dışına taşıyor → **düzeltildi ve teste bağlandı**

Kaydırma artık `constrainedFuzzBounds` penceresiyle sınırlı. Pencerede uygun gün yoksa aralık
olduğu yerde bırakılıyor; 2.5 günün altındaki aralıkların penceresi kendi üzerine çöktüğü için
hiç oynatılmıyor.

Bu düzeltme kod olarak birinci geçişten sonra girmişti ama **testi yoktu**. Eklenen iki test,
sınırsız eski davranışta başarısız olacak biçimde kuruldu: 10 günlük bir aralığın penceresi
`[8, 12]`; pencerenin bütün günleri bloklandığında eski kod 13. güne uzanıp yeni kod aralığı
10'da bırakıyor.

Test: `lib/studyRepository.scope.test.ts` → "never moves a card outside its own fuzz window",
"does not move an interval too short to have a fuzz window".

### Birinci geçişin açık ucu — optimizer kırpma bağlaması → **bağlandı**

`app/deck-options.tsx` artık `optimizeFsrsParameters`'a `clamp: { numRelearningSteps,
enableShortTerm }` geçiyor, yani eğitim zamanı parametre kutusu gerçekten uygulanıyor.

## Bu geçişte de kapatılmayanlar

- **Madde 43 — önizleme/cramming revlog satırı.** Bilinçli olarak ertelendi. Cramming satırının
  `ease` değeri gerçektir (basılan düğme), yalnızca `factor = 0`'dır; dolayısıyla yukarıdaki
  `ease != 0` koruması onu **elemez**. Satırları yazmaya başlamak, önizleme cevaplarını çalışma
  istatistiklerine ve az önce eklenen Çalışma Takvimi'ne çalışma süresi olarak sokardı. Bu,
  ayrı bir tasarım kararıdır (önizleme çalışma sayılır mı?) ve FSRS'i hiçbir şekilde
  etkilemediği için bu geçişin kapsamına alınmadı.
- **Madde 15 (fuzz tohumu), 28, 33, 41 (optimizer).** Birinci geçişteki gerekçeler aynen geçerli.
- **Yük dengeleyici (load balancer).** Hâlâ yok.

## Çalıştırılan doğrulama

```
npx tsc --noEmit   → temiz
npx vitest run     → 126 dosya, 1327 test, tamamı geçti
```

---

# Üçüncü geçiş — 27 Eylül 2026: Anki 26.05'in kendisine karşı ölçüm

İlk iki geçiş kaynak okuyarak ve elle hesaplanmış beklenen değerlerle yapılmıştı. Bu geçişte
bilgisayarda kurulu **Anki 26.05** (derleme `e64c6b1a`, fsrs-rs 5.2.0, rand 0.9.4) doğrudan
referans olarak çalıştırıldı: Anki.app'in içindeki Python ve Rust arka ucu `scripts/anki-oracle/`
betikleriyle sürüldü, binlerce rastgele ama tekrarlanabilir durum için Anki'nin yazdığı her değer
kaydedildi ve uygulamanın aynı girdilerle ürettiği değerle karşılaştırıldı. Anki kodu kopyalanmadı;
yalnızca çıktıları (sayılar) `test/fixtures/anki-26.05-fsrs.json` içinde test verisi olarak tutuluyor.

## Kısa sonuç

Önceki geçişlerin "matches" dediği birkaç madde Anki 26.05'e göre **yanlıştı**. Hepsi düzeltildi.
Son ölçümde:

| Karşılaştırma | Vaka | Sonuç |
| --- | --- | --- |
| Dört düğmenin sonucu (tür, gün, saniye, S, D) | 12 000 | Gün/saniye/tür %100 aynı; S/D %99 bit düzeyinde aynı, kalan ~%1 son bitlerde (≤ 5·10⁻⁶) |
| Revlog'dan hafıza durumu | 3 000 | 2 894 bit düzeyinde aynı, 106 son bitlerde |
| Uçtan uca cevap (kart + `cards.data` + revlog satırı) | 2 000 | Tüm alanlar aynı; 5 kartta saklanan S'nin 4. ondalığı |
| `fuzz_delta` (kimlik 2⁵²'ye, tekrar 5 000'e kadar) | 400 | %100 aynı |
| Yük dengeleyicili aralık | 2 991 | %100 aynı (%47'sinde dengeleyici günü düz fuzz'dan farklı güne taşıdı) |
| Değişince yeniden planla (dengeleyici kapalı) | 168 | %100 aynı |
| Değişince yeniden planla (dengeleyici açık) | 546 | %96 aynı |

Son bit farkları algoritmadan değil platformdan geliyor: fsrs-rs 32-bit float çalışıyor, macOS'un
`expf`/`powf`'u her girdide doğru yuvarlanmıyor. İncelenen her vaka, bir exp/pow sonucunu 1 ulp
kaydırınca Anki'nin değerine birebir dönüşüyor. Anki'nin kendisi de Windows/Android'de bu düzeyde
farklı sayı üretir.

## Bulunan ve düzeltilen sapmalar

1. **Aynı gün "Zor" (short-term) tabanı** — `lib/fsrs.ts`. fsrs-rs 5.2.0 çarpanı yalnızca
   `rating >= 3` (Good/Easy) için 1'e tabanlıyor; uygulama Hard'ı da tabanlıyordu. İlk geçişin
   12. maddesi ("`rating >= 2` üst kaynakla birebir") yanlıştı. S = 20'lik kart aynı gün Hard →
   Anki ≈ 10, uygulama 20 veriyordu.
2. **f32 aritmetiği ve işlem sırası** — `lib/fsrs.ts` fsrs-rs'in her işlemini aynı sırayla f32'de
   yapıyor (linear damping `(10−D)·(ΔD/9)`, `memory_state_from_sm2`'de `exp_m1`, tabansız S).
3. **Saklanan değerlerin yuvarlanması** — `lib/fsrsCardData.ts`. Anki `cards.data`'ya S'yi 4,
   D'yi 3, DR'yi 2, decay'i 3 ondalıkla yazar ve bir sonraki cevap yuvarlanmış değerden başlar
   (FSRS-6'nın 0.1542'si kartta 0.154 olur). Uygulama tam hassasiyet saklıyordu.
4. **Geçen gün sayısı** — `lib/fsrsScheduler.ts`. Anki: son tekrardan *sonraki gün sınırına*
   kadar tam 24 saatlik bloklar; son tekrar `lrt`'den, yoksa revlog'daki son sayılan cevaptan.
5. **Hafıza durumu olmayan eski kart** — cevaplanmış ama durumu olmayan kart (SM-2'den gelen,
   desteye taşınan) Anki'de revlog'dan/SM-2 değerlerinden türetiliyor; uygulama onu "ilk kez
   görülen kart" sayıp ilk parametrelerden başlatıyordu (`lib/fsrsCardInputs.ts`).
6. **Fuzz tohumu** — `lib/ankiRandom.ts`. Anki'nin `StdRng`'si (PCG32 ile genişletilen tohum,
   ChaCha12, `random_range`, `WeightedIndex`) birebir yazıldı; tohum `kart kimliği + reps`.
   İlk geçişin 15. maddesi "bilinçli fark" olarak bırakılmıştı; artık aynı gün seçiliyor.
7. **Fuzz penceresi f32'de** ve **büyüyen aralık tabanı** — Anki 26.05'te taban yalnızca
   `round(aralık) > eski ? eski+1 : 0`; uygulamadaki "pencere içindeyse eskisi" dalı eski bir
   sürümden kalmaydı.
8. **Yük dengeleyici ve Kolay günler** — Anki 26.05'te varsayılan açık, arayüzde anahtarı yok;
   90 güne kadarki her aralığı gün başına kart sayısı, kardeş kartlar ve kolay günlere göre
   ağırlıklı seçiyor (`lib/loadBalancer.ts`). Uygulamadaki ayrı "kolay günler kaydırması"
   kaldırıldı, dengeleyici kuyruğun kurulduğu anda okunuyor ve her cevapla güncelleniyor.
9. **Öğrenme adımları** — "Zor" gecikmesi saniye ve tamsayı bölmeyle (1m/10m → 5m30s, 6m değil);
   gün içi adıma Anki'nin %25 / en çok 5 dakikalık öğrenme fuzz'u; FSRS kısa vadeli aralıklar
   saniye hassasiyetinde; gün sınırını aşan adım gün cinsinden.
10. **Tekrar sayısı (`reps`)** — Anki her cevapta artırır; uygulama yalnızca tekrara geçişte
    artırıyordu. Fuzz tohumu buna bağlı.
11. **Yeniden öğrenmedeki kartın aralığı ve ease'i** — Hard/Good adımlarında Anki aralığı sabit
    tutar; yeniden öğrenmeden çıkışta ease değişmez, öğrenme adımlarında ease'e dokunulmaz.
    Uygulama her adımda aralığı ve ease'i değiştiriyordu.
12. **Revlog sütunları** — tür (erken cevaplanan tekrar = filtreli tekrar, 3), `ivl`/`lastIvl`
    gün ya da negatif saniye (gün sınırını aşan adım pozitif gün), ease sütununda FSRS altında
    kaydırılmış zorluk (`round(((D−1)/9+0.1)·1000)`), öğrenmede SM-2 ease'i 0.
13. **Kart alanları** — öğrenme kartının `ivl`'i değişmez, `left` yalnızca kalan adım sayısı
    (Anki 26.05 "bugün" kısmını yazmıyor), yeni kart ilk cevapta `pos`, her cevapta `lrt`.
14. **Boş adım listeleri** — Anki öğrenme/yeniden öğrenme adımlarının boş kalmasına izin veriyor;
    uygulamanın formu boş öğrenme adımını reddediyor, çözümleyici boş listeyi varsayılana
    çeviriyordu. İkisi de düzeltildi, SM-2 motoru boş adımı Anki gibi ele alıyor.
15. **Ön ayar doğrulaması** — Anki DR'yi [0.70, 0.99], geçmiş hatırlamayı [0.70, 0.97] dışında
    bulursa kırpmıyor, 0.9'a döndürüyor.
16. **Desteye özel hedef hatırlama** — Anki 26.05'in "Bu deste" sekmesi eklendi (model,
    çözümleyici, .apkg alanı 10 ve eski JSON'daki yüzde).
17. **Deste seçenekleri kaydı** — Anki yalnızca parametresi ya da etkin DR'si değişen (yeniden
    planla seçiliyse kolay günleri de değişen) desteleri yeniden hesaplar ve yeniden planlar;
    FSRS açılınca hepsini, kapatılınca FSRS verisini siler. Uygulama her kayıtta bütün koleksiyonu
    işliyordu; "yeniden planla" işaretliyken değişiklik olmadan da tüm tarihleri değiştiriyordu.
18. **Toplu yeniden hesaplama** — revlog'u olmayan kart hiç ziyaret edilmez; kullanılabilir cevabı
    olmayanın durumu boşaltılır ama DR/decay yazılır; yeniden planlama yalnızca sayılan cevabı olan,
    askıda olmayan tekrar kartına, `reps−1` tohumlu fuzz ve `Rescheduled` (tür 5) satırıyla.
19. **Son tarihi ayarla** — 26.05 kuralı: hafıza durumu olan kartta `lrt`'den geçen gün + istenen
    gün (`!` etkisiz), `lrt` yoksa aralık tarih kadar kaydırılır; satır türü 4 ve ease sütunu dolu.
20. **Unut** — FSRS hafıza durumu siliniyor (uygulamada unutulan kart eski hafızayla devam
    ediyordu). **Deste değiştirme** de Anki gibi FSRS verisini siliyor (geri alınabilir).
21. **Hatırlanabilirlik gösterimi/arama/sıralama** — `lrt`'den saniye, kartın kendi decay'i
    (yoksa 0.5), "şimdi"ye göre; göreli gecikme Anki formülüyle.
22. **Yok say tarihi** — Anki "şu tarihten önce" değerini UTC gece yarısı olarak okuyor.
23. **Düğme etiketleri** — kuyruktaki tekrar kartları kart verisi olmadan yükleniyordu; FSRS
    altında etiketler hafıza durumunu görmüyordu. Artık tam kart ve aynı dengeleyici kullanılıyor.

## Kalan farklar

- Dengeleyici açıkken "değişince yeniden planla": Anki kartları Rust'ın kararsız sıralamasıyla
  işliyor; eşit tekrar sayılı kartların sırası sayaçları değiştirdiği için günlerin ~%4'ü farklı.
- S/D'nin son bitleri (~%1), yukarıda açıklandığı gibi platform kaynaklı.
- Optimizer Anki'nin eğiticisi değil; önizleme cevabı cramming satırı yazmıyor; "Unut" tekrar ve
  hata sayılarını her zaman sıfırlıyor (Anki'de varsayılan kapalı bir seçenek).
- Tarayıcının hatırlanabilirlik sıralaması ve filtreli destenin SQL `prop:r`'si, farklı decay'li
  ön ayarlar karıştığında yaklaşık (SQLite'ta üs alma garanti değil).

## Çalıştırılan doğrulama

```
npx vitest run lib/fsrsAnkiParity.test.ts   → 6 test (UTC, New York ve Tokyo saat dilimlerinde de)
npm run quality                             → bkz. değişiklik kaydı
```

---

# Dördüncü geçiş — 27 Eylül 2026: kalan farkların kapatılması

Üçüncü geçişin "Kalan farklar" listesi bu geçişte tek tek ele alındı. Ölçüm yine Anki 26.05'in
kendisine karşı yapıldı (`scripts/anki-oracle/`).

## 1. Dengeleyici açıkken toplu yeniden planlama sırası — kapatıldı

Anki bir ön ayarı yeniden hesaplarken kartları `permutation::sort_unstable_by_key` ile FSRS
öğesinin uzunluğuna göre sıralıyor (`memory_state.rs`). Kararsız sıralama, eşit uzunluktaki kartları
Rust'ın kendi algoritmasının bıraktığı sırada bırakıyor. Dengeleyicinin gün sayaçları her kartla
değiştiği için bu sıra, kartların hangi güne düşeceğini de belirliyor. Uygulama önceden eşitleri kart
sırasında tutuyordu ve günlerin ~%4'ü farklıydı.

- `lib/rustSortUnstable.ts`: Rust 1.92.0'ın (Anki 26.05'in derlendiği sürüm) `ipnsort`'u `usize`
  için aynen taşındı. Kaynak MIT/Apache-2.0, dosyada atıfla.
- `lib/fsrsMaintenance.ts`: kartlar ön ayar ön ayar, önce öğesi olmayanlar, sonra bu sırayla
  ziyaret ediliyor. Tamamlanmamış geçmişte ilk tekrar başlangıç durumuna dönüştüğü için öğe bir
  eksik sayılıyor. Kapsam, Anki'nin `DeckIdsWithoutChildren`'ı gibi, filtreli destedeki kartı
  ana destesinden de buluyor.
- Ölçüm: dengeleyici açık 1 563 kart (en büyük ön ayar 549 kart) ve kapalı 168 kart. Hepsinde
  aralık, gün ve revlog satırı Anki ile aynı. Anki'nin revlog kimliklerinden okunan ziyaret sırası
  da her turda birebir aynı. `test/fixtures/anki-26.05-fsrs.json` artık 87 kartlık dengeli bir tur
  içeriyor ve test sırayı da doğruluyor.

## 2. "Unut" her zaman sayaçları sıfırlıyordu — kapatıldı

Anki 26.05'te işlemin adı "Reset Card" ve iki seçeneği var: "Restore original position where
possible" (varsayılan açık) ve "Reset repetition and lapse counts" (varsayılan kapalı). Son seçim
gözden geçirici ve tarayıcı için ayrı ayrı hatırlanıyor (`BoolKey::RestorePosition*`,
`ResetCounts*`).

- `lib/resetCards.ts`: `Card::schedule_as_new` gibi çalışıyor. Kart filtreli desteden çıkıyor,
  aralığı, ease'i, hafıza durumu ve `pos`'u siliniyor. `lrt`, `left`, `dr` ve `decay` kalıyor.
  Pozisyon, mümkünse eski yerine geri konuyor. Tür 4, ease sütunu 0 olan revlog satırı yazılıyor.
- Gözden geçiricinin menüsünde ve tarayıcıda, iki seçenekli "Kartı sıfırla" penceresi açılıyor.
- Ölçüm: Anki'nin `schedule_cards_as_new`'undan 60 durum, 123 kart (her kart türü, 33'ü filtreli
  destede, dört seçenek bileşimi). Kart alanları, `cards.data` ve revlog satırı birebir aynı.
- Bilinen fark: geri konacak pozisyonu olmayan kart, en yüksek yeni kart pozisyonunun bir fazlasını
  alıyor. Anki ayrı bir `nextPos` sayacı tutuyor. Yeni kartlar arasındaki sıra aynı.

## 3. Hatırlanabilirliğe göre sıralama ve filtreli deste sıraları — kapatıldı

Tarayıcı, hatırlanabilirliğe göre sıralarken `(due − ivl − şimdi) / S` oranını kullanıyordu. Bu
oran `lrt`'yi ve kartın kendi decay'ini görmüyordu. Filtreli deste de iki hatırlanabilirlik
sırasını ve göreli gecikmeyi aralığa göre gecikmeyle yaklaşık alıyordu. Eşitlikleri `c.id` ile
bozuyordu, Anki ise `fnvhash(c.id, c.mod)` kullanıyor.

- `lib/ankiSortKeys.ts`: Anki'nin SQLite'a kaydettiği `extract_fsrs_retrievability`,
  `extract_fsrs_relative_retrievability` ve `fnvhash` (64-bit FNV-1a) fonksiyonları JS'de, f32
  aritmetiğiyle ve Anki'nin u32/i64 taşma kurallarıyla yazıldı.
- Tarayıcı (kart ve not modu) bu değerle JS'de sıralıyor. Değeri olmayan kart artan sırada başta,
  azalan sırada sonda, SQLite'ın NULL'u koyduğu yerde.
- Filtreli destenin tüm sıraları (rastgele hariç) JS'de Anki'nin anahtarları ve `fnvhash` ile
  kuruluyor. Deste listesi sayaçları da aynı toplama yolunu kullanıyor.
- Ölçüm: Anki'nin kendi SQL fonksiyonlarından 121 kart (karışık decay, `lrt`'li ve `lrt`'siz,
  öğrenme, gün içi, yeni, askıda). `fnvhash` 121'de birebir. Hatırlanabilirlik 3 dışında bit
  düzeyinde aynı, kalanlar son bitte. Tarayıcı sırası iki yönde de Anki ile aynı. Filtreli deste,
  rastgele dışındaki 10 sıranın hepsinde Anki'nin topladığı kartları aynı sırayla topluyor.
- Kalan fark: yeni kartın pozisyonu, "vade" ve "göreli gecikme" sıralarında gün sayısı gibi
  okunuyor. Anki günleri koleksiyonun kuruluşundan, uygulama 1970'ten sayıyor. Pozisyonu
  koleksiyon yaşından büyük yeni kart burada başa, Anki'de sona düşer. Filtreli destenin SQL
  `prop:r`'si 64-bit karşılaştırıyor. Bu yalnızca eşiğe bir saniye kadar yakın kartta Anki'nin
  32-bit değerinden ayrılabilir.

## 4. Önizleme cevapları revlog'a yazılmıyordu — kapatıldı

Yeniden planlaması kapalı filtreli destede (önizleme) verilen cevap hiçbir şey yazmıyordu.
Bekleme süresi yalnızca oturumun belleğinde tutuluyordu ve cevap geri alınamıyordu. Anki 26.05
`apply_preview_state` ile şunları yapıyor:

- Tür 3 (filtreli) revlog satırı yazıyor. Ease sütunu 0, `ivl` önizleme gecikmesi, `lastIvl` "Tekrar"
  gecikmesi. İkisi de negatif saniye, gün sınırını aşıyorsa gün. FSRS ve optimizer bu satırı
  "cramming" diye atlıyor. Satır "bugün çalışılan"a sayılıyor ama ana destenin yeni kart hakkından
  düşmüyor (Anki bunu filtreli desteye yazar).
- Kartın planı, `reps`'i ve `lrt`'si değişmiyor. Kardeşler gömülüyor. FSRS açıksa kart güncelleyici
  ön ayarın decay'ini karta yazıyor, eksik hafıza durumunu türetiyor.
- Gecikmeli cevapta kart, öğrenme adımı fuzz'ıyla birlikte önizleme-tekrar kuyruğunda bekliyor.
  Süre dolunca diğerlerinden önce geliyor. Kolay ya da sıfır gecikme kartı desteden çıkarıyor.

Uygulamada bekleme süresi destede (`filteredPreviewDue`) saklanıyor, uygulama yeniden açılsa da
korunuyor. Önizleme cevabı geri alınabiliyor. Ölçüm: Anki'den 6 tur, 72 cevap (FSRS açık ve kapalı,
gün sınırını aşan gecikmeler dahil). Revlog satırları ve kart verisi birebir aynı, geri dönüş
zamanı saniye içinde aynı.

## 5. "Optimize et" Anki'nin eğitimi değildi — kapatıldı

Uygulamanın optimizer'ı sayısal türevli, 2 000 öğeyle ve 15 turla sınırlı bir Adam'dı. Bütün
koleksiyonu kullanıyordu, askıdaki kartları da alıyordu. Anki'nin parametrelerinden tamamen farklı
sonuç veriyordu. Artık Anki'nin `compute_params` + fsrs-rs 5.2.0 `compute_parameters` yolu adım
adım uygulanıyor:

- Öğeler Anki'nin varsayılan aramasıyla (`preset:"ad" -is:suspended`) toplanıyor.
  `fsrs_items_for_training` kurallarıyla kuruluyor, son tekrarın revlog kimliğine göre sıralanıyor.
- Aykırı (ilk puan, ilk aralık) çiftleri atılıyor. İlk kararlılıklar f64 üçlü aramayla ön
  eğitiliyor ve `smooth_and_fill` ile düzeltiliyor.
- Öğeler yakınlığa göre ağırlıklanıyor, 64 tekrardan uzunları atılıyor. Uzunluğa göre sıralanıp
  512'lik gruplara bölünüyor. Beş tur boyunca gruplar rand 0.9'un `shuffle`'ı (StdRng tohum 2023)
  ile karıştırılıyor.
- Her grup Burn 0.17.1'in Adam'ının (eps 1e-8) bir adımı: kosinüs öğrenme hızı, ağırlıklı log
  loss + başlangıca L2 çekimi. Her adımdan sonra parametreler kırpılıyor. En düşük kayıplı tur
  seçiliyor.
- Türevler modelin f32 hesabının ters modda türevi (`lib/fsrsTraining.ts`).
- Sonuç, log loss'u mevcut parametrelerden iyi değilse benimsenmiyor. Birden çok günlük yeniden
  öğrenme adımında Anki'nin kısa vade kontrolü uygulanıyor. "Zaten uygun" kontrolü 4 ondalıkla.
  Eğitim ekranı dondurmadan gruplar arasında nefes alıyor, düğmeye yeniden basınca duruyor.

Ölçüm: Anki'nin `compute_fsrs_params_from_items`'ı ve bir koleksiyon üzerinde
`compute_fsrs_params`'ı, simüle edilmiş öğrencilerle 9 veri kümesinde çalıştırıldı (123 – 6 875
öğe). Her parametre Anki'ninkinden en çok 5·10⁻⁷ uzakta. 4 ondalıkta 21 parametrenin 21'i her
kümede aynı. Koleksiyon yolunda öğe sayısı ve Anki'nin log loss'u birebir. Web sürümünde Anki'den
dışa aktarılmış 400 kartlık bir paket içe aktarılıp "Optimize et"e basıldı. Çıkan 21 parametre
Anki'nin sonucuyla gösterilen 6 ondalıkta aynı.

---

# Beşinci geçiş — 22 Ekim 2026: güncel Anki 26.09.3'e karşı

İlk dört geçiş Anki 26.05'e (fsrs-rs 5.2.0) karşı ölçüldü. Uygulama o sürümle hâlâ birebir:
`lib/fsrs*`, `lib/scheduler*`, `lib/loadBalancer*` ve `lib/ankiRandom*` altındaki 9 dosyanın 124
testi bu dalda geçiyor. Ancak güncel Anki **26.09.3** (23 Eylül 2026). Arada 26.08 (1 Ağustos) ve
26.09 (14 Eylül) çıktı. Anki önce fsrs-rs 6.6.1'e, sonra 6.6.2'ye geçti ve FSRS davranışını birkaç
yerde değiştirdi. Bu geçiş o farkı çıkarıyor.

**Yöntem.** `ankitects/anki` deposunda `26.05..26.09.3`, `open-spaced-repetition/fsrs-rs`
deposunda `v5.2.0..v6.6.2` farkı satır satır okundu: zamanlama, depolama, içe/dışa aktarma ve kart
bilgisi kodu. Ardından uygulamanın kendi fonksiyonları iki referansla çalıştırıldı: fsrs-rs
6.6.2'nin birim testlerindeki değerler ve Anki 26.09.3'ün yeni testlerindeki iddialar. Bunun için
repoya eklenmeyen geçici bir prob testi kullanıldı. Anki kodu kopyalanmadı.

**Eksik kalan:** bilgisayardaki Anki.app hâlâ 26.05. Bu yüzden `scripts/anki-oracle/` 26.09.3'e
karşı çalıştırılmadı. Aşağıdaki sayılar okunan kaynaktan ve upstream'in kendi test değerlerinden
geliyor, Anki 26.09.3'ün çalışan kopyasından değil.

## Kısa sonuç

**Uygulama güncel Anki ile birebir aynı çalışmıyor.** Çekirdek FSRS-6 formülleri fsrs-rs 6.6.2'nin
yedi test vektörünün altısında f32 düzeyinde aynı. Ayrılan tek formül aynı gün verilen "Zor"
cevabı. Bunun dışında Anki 26.08–26.09.3'te gelen davranış değişikliklerinin hiçbiri uygulamada
yok. Önem sırasıyla 11 fark:

| # | Önem | Konu | Anki 26.09.3 | Uygulama | Dosya |
| --- | --- | --- | --- | --- | --- |
| 1 | **Yüksek** | Aynı gün "Zor" — kapatıldı (A zamanlama; eğitim B) | Stabiliteyi düşürmez (`rating >= 2` tabanı) | Düşürür: S × 0.43–0.74 | `lib/fsrs.ts:378-387`, `lib/fsrsTraining.ts:189` |
| 2 | **Orta** | Fuzz tabanı — kapatıldı | Büyümeyen aralıkta önceki aralık pencere içindeyse korunur | Korunmaz; yeniden planlamada aralık ayrıca kesiliyor | `lib/fsrsScheduler.ts:268-272`, `lib/fsrsMaintenance.ts:339-340` |
| 3 | **Orta** | Son tarihi ayarla | Koleksiyonun FSRS anahtarına bakar; yeni ve `ivl = 0` kart 0'da kalır | Kartın hafıza durumuna bakar; yeni karta gün sayısı yazar | `lib/browserSelection.ts:130`, `lib/schedulingIntervals.ts:273-296` |
| 4 | **Orta** | Optimize et — kapatıldı (FSRS-B; collector bağlantısı FSRS-A) | fsrs-rs 6.6.2 eğitimi, 8 tur, kart bazlı gruplar | 26.09.3 referansı, en büyük fark 4.77·10⁻⁷ | `lib/fsrsTraining.ts:37-41` |
| 5 | Düşük–orta | Desteyi değiştir | Hafıza durumu hemen yeniden hesaplanır | Silinir, ilk cevapta türetilir | `lib/noteStore.ts:407-450` |
| 6 | Düşük–orta | Veritabanı kontrolü | Bozuk `lrt`'yi revlog'dan onarır | `lrt`'ye bakmaz | `lib/maintenance.ts` |
| 7 | Düşük | "Şu tarihten önceki tekrarları yok say" | Gelecek tarih bugüne çekilir | Gelecek tarih kabul edilir | `app/deck-options.tsx:504-507, 551, 699` |
| 8 | Düşük | Zamanlamasız dışa aktarma | Yalnızca parametre listeleri silinir | DR, geçmiş hatırlama ve tarih de silinir | `lib/exportAnkiPackage.ts:372-378` |
| 9 | Düşük | Kart bilgisi — kısmen (kod/test tamam; iPhone smoke bekliyor) | Eksik durumu hesaplar; FSRS'te Kolaylık gizli | Yalnızca saklı durum; Kolaylık hep görünür | `app/card-info.tsx:86-95, 241, 258` |
| 10 | Düşük | Filtreli deste sıraları | FSRS kapalıyken hatırlanabilirlik sıraları gizli | Hep 11 sıra | `lib/filteredDeckOptions.ts:25` |
| 11 | Çok düşük | f32 işlem sırası — kapatıldı | 6.6.2'nin skaler sırası | 5.2.0'ın Burn sırası | `lib/fsrs.ts:248-250, 389-393` |

## 1. Aynı gün "Zor" stabiliteyi düşürüyor — yüksek — kapatıldı (FSRS-A zamanlama)

- **Anki 26.09.3:** fsrs-rs 6.6.2'nin `stability_short_term`'ü aynı gün çarpanını `rating >= 2` için
  1'e tabanlıyor. Zor, İyi ve Kolay stabiliteyi düşüremez, yalnızca Tekrar düşürür. Kural fsrs-rs
  [#376](https://github.com/open-spaced-repetition/fsrs-rs/pull/376) ile Kasım 2025'te geldi.
  26.05'in kullandığı 5.2.0'da yoktu, Anki'ye 26.08 ile girdi
  ([#4956](https://github.com/ankitects/anki/pull/4956)).
- **Uygulama:** `lib/fsrs.ts:378-387` tabanı `rating >= 3` için uyguluyor. Bu, üçüncü geçişin
  1. maddesinde 26.05'e uymak için yapılmıştı. Optimizer'ın ileri hesabında da aynı kural var:
  `lib/fsrsTraining.ts:189`.
- **Ölçüm:** fsrs-rs 6.6.2'nin `test_next_stability` vektörü `stability_short_term(S = 5)` için
  `[1.596818, 5.0, 5.0, 8.12961]` istiyor. Uygulama Zor için `2.7470093` veriyor. Varsayılan
  parametrelerle 20 000 rastgele durumda (S 0.05–200) aynı gün Zor sonrası S her durumda Anki'den
  düşük. Oran en az 0.431, ortanca 0.567, en çok 0.744. %90 hedefte tam gün aralık 11 800 durumda
  farklı.
- **Kullanıcıya yansıyan örnekler** (1m 10m öğrenme adımı, 10m yeniden öğrenme adımı, varsayılan
  parametreler, %90 hedef):
  - Yeni kart, aynı gün İyi → Zor → İyi. Uygulamada S 2.3065 → 1.3334 → 1.3747 olur ve kart
    **1 günde** mezun olur. Anki 26.09.3'te S 2.3065'te kalır ve kart **2 günde** mezun olur.
  - Unutulmuş kart (S = 3), yeniden öğrenmede Zor → İyi. Uygulamada S 3 → 1.705 → 1.729 olur ve
    kart 2 güne gider. Anki'de S 3'te kalır ve aralık fuzz'dan önce 3 gündür (pencere 2–4).
- **Etki alanı:** her aynı gün Zor cevabı (öğrenme ve yeniden öğrenme adımları, aynı gün
  tekrarlar). Ayrıca revlog'dan yeniden hesaplanan hafıza durumları (ön ayar kaydı, deste
  değişimi) ve "Optimize et".

## 2. Fuzz, büyümeyen bir aralığı geri çekebiliyor — orta — kapatıldı

- **Anki 26.09.3:** `minimum_review_fuzz_interval` 26.08 ile geldi
  ([#4826](https://github.com/ankitects/anki/pull/4826)). Taban üç durumda belirleniyor. Yeni
  aralık yuvarlanınca öncekinden büyükse taban `önceki + 1` olur. Büyümemişse ama önceki aralık
  yeni aralığın fuzz penceresinin üst sınırını aşmıyorsa taban `önceki` olur; fuzz aralığı geri
  çekemez. Aralık gerçekten küçüldüyse taban 0'dır. Kural hem cevapta (Zor, İyi, Kolay) hem de
  "değişince yeniden planla"da kullanılıyor.
- **Uygulama:** cevapta `lib/fsrsScheduler.ts:268-272` yalnızca "büyüdüyse önceki + 1, değilse
  0" diyor. Yeniden planlamada `lib/fsrsMaintenance.ts:339-340` aynı kuralı aralığı yuvarlamadan
  **keserek** uyguluyor.
- **Ölçüm:** Anki'nin kendi testi `(2.7269483, önceki 4) → 4`, `(2.7269483, 5) → 0` ve
  `(4.591988, 4) → 5` istiyor. Uygulama cevapta 0, 0, 5; yeniden planlamada 0, 0, 0 veriyor. Uçtan
  uca deneme: aralığı 4 gün olan ve Zor için FSRS aralığı 3.36 gün çıkan bir tekrar kartı 2 000
  farklı kart kimliğiyle cevaplandı. Uygulama 2, 3 ve 4 günü yaklaşık eşit sıklıkla verdi. Anki
  4 ya da 5 gün verir. Uygulama 1 329 kartta aralığı öncekinin altına çekti.
- **Ne zaman görülür:** Zor'un (bazen İyi'nin) aralığı pek büyümediğinde. Örneğin önceki aralık
  yukarı fuzz'lanmışsa, kart erken tekrarlanmışsa ya da hedef hatırlama veya parametreler
  değiştiyse.

## 3. Son tarihi ayarla FSRS altında 26.05 kuralıyla çalışıyor — orta

- **Anki 26.09.3:** kural artık kartın hafıza durumuna değil, koleksiyonun FSRS anahtarına bakıyor
  ([#4792](https://github.com/ankitects/anki/pull/4792), 26.08). FSRS açıkken yeni kart ve
  aralığı 0 olan kart (öğrenmedeki kart dâhil) `ivl = 0`'da kalır. Diğer kartlar `lrt`'den geçen
  gün + istenen gün alır; `lrt` yoksa aralık tarih farkı kadar kayar. FSRS kapalıyken SM-2 kuralı
  geçerlidir.
- **Uygulama:** `lib/browserSelection.ts:130` kararı `memory !== null` ile veriyor, bu 26.05'in
  kuralı. "Yeni kart veya `ivl = 0` → 0" dalı yok (`lib/schedulingIntervals.ts:273-296`). Okuyucu
  menüsü (`app/(tabs)/index.tsx:1358`) ve tarayıcı (`components/browser/BrowserDialogs.tsx:266`)
  aynı yoldan geçiyor.
- **Ölçüm** ("3" girildiğinde):
  - FSRS açık, yeni kart: uygulama `ivl` 3, Anki 0.
  - Hafızası olan öğrenme kartı (`ivl` 0, `lrt` 1 gün önce): uygulama 4, Anki 0.
  - Hafızası olmayan tekrar kartı (`ivl` 7, `lrt` 10 gün önce, FSRS açık): uygulama 7, Anki 13.
  - Ters durum da var: FSRS kapalıyken kartta hafıza durumu kalmışsa uygulama FSRS kuralını
    uyguluyor.
- **Sonraki cevaba etkisi:** Anki'de `ivl = 0`'da kalan yeni kartın ilk gerçek cevabı başlangıç
  parametrelerinden başlar. Kullanılabilir revlog yoksa ve aralık 0 ise `set_memory_state` hafıza
  durumu üretmez. Uygulamada ise `ivl = 3` yazılan kart cevaplanırken hiç kazanmadığı bu 3 günlük
  aralıktan SM-2 tahminiyle (S ≈ 3) başlatılıyor (`lib/fsrsScheduler.ts:118-128`).

## 4. "Optimize et" 26.05'in eğitimini çalıştırıyor — kapatıldı (FSRS-B)

23 Ekim 2026: Anki 26.09.3 (29bb700b) kuruldu; üretim `compute_fsrs_params` yolu
`gen_optimize.py` ile çalıştırıldı. Öğelerden hesaplayan test yardımcısı hâlâ beş tur ve kart
kimliği olmadan çalıştığı için yeni fixture yalnız üretim koleksiyonlarını kullanıyor.

- `lib/fsrsTraining.ts` artık fsrs-rs 6.6.2'nin sekiz turlu son-tur eğitimini, kart bazlı
  pencerelerini, 256 tekrar sınırını, f64 HostAdam'ı ve f64 analitik gradyanlarını kullanıyor.
  İleri model `lib/fsrsTrainingModel.ts` içinde f32; aynı gün Zor tabanı `rating >= 2`.
  Öğe ağırlıkları ve L2 çekimi korunuyor. Gruplar rand 0.10'un seed 2023 sırasıyla karışıyor.
- `evaluate`/log loss, yeni skaler ileri model ve sıralı f32 toplamla güncellendi. Eğitimde
  olasılık tabanı var, değerlendirmede yok. Parametre benimseme, iptal, arayüz ve kayıt akışı
  korunuyor. Her iki modülün başlığında BSD-3-Clause lisansının tam bildirimi var.
- Önce yeni fixture'a bağlı testler eklendi: eski kodda 3 test kaldı; örneğin 150 kartta w0
  farkı 0.0029258281, 400 kartta 0.0239510611 ve küçük örnekte log loss farkı 0.0011608601.
- Kaydedilen fixture: 40, 150, 400 kart ve uzun geçmişli 150 kart; sırasıyla 112, 731, 1668,
  664 öğe. Uzun geçmiş 64/65 ve 255/256/257 sınırlarını gerçek Anki çıktısıyla sabitliyor.
  Ek tohum 7 ölçümü: 40/150/400/900/1500 kart, 107–6440 öğe. Dokuz koleksiyondaki 21
  parametrenin en büyük mutlak farkı **4.76837158203125·10⁻⁷**; hedef 5·10⁻⁷ sağlandı.
  Varsayılan ve optimize parametrelerin log loss'u 1·10⁻⁶ içinde. 26.05 optimizer kayıtları
  tarihsel fixture'da kalıyor; güncel optimizer testi onlara karşı çalışmıyor.
- **FSRS-A bağlantısı:** `collectFsrsTrainingItems` her öğeye gerçek `cardId` taşımalı. Aynı
  uzunluktaki kartların kimlik sırası, grupların sınırını belirliyor. A'nın `aa7cf78` commit'indeki
  collector değişikliği B dalına `f579c83` olarak alındı. Özgün kimliği ve
  revlog sırasını koruyan SQLite testi var. B oracle testi artık kart kimliğini kendisi
  eklemiyor; üretim collector'ının çıktısını doğrudan eğitiyor ve her kimliği doğruluyor.
- Saf hesap değişikliği; iPhone arayüzü ve parametre kayıt yolu değişmediği için yeni cihaz
  smoke testi gerekmiyor. `npm run quality` (tsc, tüm deterministik testler, iOS/kaynak kaydı)
  160 dosyada 1 681 testle geçti; `lib/fsrsTraining.test.ts` kayıtlı oracle'a karşı 8,
  ek büyük oracle'a karşı 9 testle geçti. Collector'ın gerçek çıktısıyla iki koşu da temiz.

Yeniden üretme (Anki 26.09.3 ile, depo kökünde):

```sh
./scripts/anki-oracle/build-host.sh
./scripts/anki-oracle/run.sh scripts/anki-oracle/gen_optimize.py 1 test/fixtures/anki-26.09-optimize.json small
./scripts/anki-oracle/run.sh scripts/anki-oracle/gen_optimize.py 7 /private/tmp/fsrs-b-large-optimize.json
FSRS_OPTIMIZE_FIXTURE=/private/tmp/fsrs-b-large-optimize.json npm test -- --run lib/fsrsTraining.test.ts
```

## 5. Desteyi değiştirmek hafıza durumunu yeniden hesaplamıyor — düşük–orta

- **Anki 26.09.3:** FSRS açıkken "Desteyi değiştir" kartların FSRS verisini siliyor. Hemen ardından
  hedef destedeki (alt desteler hariç) hafızasız kartların durumunu hedef ön ayarın parametreleri,
  DR'si ve decay'iyle revlog'dan yeniden hesaplıyor, kartları yeniden planlamadan
  ([#5339](https://github.com/ankitects/anki/pull/5339),
  [#5500](https://github.com/ankitects/anki/pull/5500)).
- **Uygulama:** `lib/noteStore.ts:407-450` veriyi siliyor ama yeniden hesaplamıyor. Durum, kart bir
  sonraki kez cevaplanınca türetiliyor.
- **Etki:** cevabın sonucu iki tarafta da aynı, çünkü ikisi de durumu revlog'dan türetiyor. Ama
  taşımayla sonraki cevap arasında fark var. Kart bilgisi FSRS durumunu göstermiyor. `prop:s`,
  `prop:d` ve `prop:r` aramaları, hatırlanabilirlik sıralaması ve filtreli deste sıraları kartı
  durumsuz sayıyor.

## 6. Veritabanı kontrolü `lrt`'yi onarmıyor — düşük–orta

- **Anki 26.09.3:** "Veritabanını kontrol et" her yeni olmayan kartın `lrt`'sini revlog'daki son
  zamanlamayı etkileyen cevabın zamanına eşitliyor. Yanlış değeri düzeltiyor; son sıfırlamadan sonra
  cevap yoksa değeri siliyor ([#4648](https://github.com/ankitects/anki/pull/4648), 26.08).
- **Uygulama:** `lib/maintenance.ts` içindeki `checkDatabase` ve `repairDatabase` `lrt`'ye bakmıyor.
- **Etki:** FSRS geçen gün sayısını `lrt`'den okur. Bozuk bir `lrt` (eski sürüm, içe aktarma, elle
  düzenleme) yanlış aralık ve hatırlanabilirlik verir. Anki bunu artık onarabiliyor, uygulama
  onaramıyor.

## 7. Gelecek tarihli "şu tarihten önceki tekrarları yok say" — düşük

- **Anki 26.09.3:** kaydederken gelecekteki tarih bugüne çekiliyor, tarih seçicinin üst sınırı da
  bugün ([#5294](https://github.com/ankitects/anki/pull/5294), 26.09).
- **Uygulama:** `app/deck-options.tsx:504-507` yalnızca biçimi denetliyor. Prob testinde
  `parseFsrsCutoffDate('2099-01-01')` kabul edildi; `:551` ve `:699` değeri olduğu gibi kaydediyor.
- **Etki:** gelecekteki bir tarih bütün geçmişi yok sayar. "Optimize et" ve yeniden hesaplama boş
  geçmişle çalışır.

## 8. Zamanlamasız dışa aktarma fazlasını siliyor — düşük

- **Anki 26.09.3:** zamanlamasız dışa aktarmada ön ayarlardan yalnızca FSRS parametre listeleri
  (4, 5 ve 6) siliniyor. Hedef hatırlama, geçmiş hatırlama ve yok sayma tarihi kalıyor
  ([#4721](https://github.com/ankitects/anki/pull/4721), 26.08).
- **Uygulama:** `lib/exportAnkiPackage.ts:372-378` bunları da siliyor. Paketi açan taraf %90
  varsayılanını alıyor. Koddaki "Anki removes them" yorumu Anki'nin davranışını olduğundan geniş
  anlatıyor.

## 9. Kart bilgisi — düşük — kapatıldı (kod ve otomatik test; iPhone smoke bekliyor)

- **Anki 26.09.3:** FSRS açıksa ve kart cevaplanmış ama hafıza durumu yoksa, kart bilgisi durumu
  revlog'dan hesaplayıp gösteriyor; karta yazmıyor
  ([#5326](https://github.com/ankitects/anki/pull/5326),
  [#5648](https://github.com/ankitects/anki/pull/5648)). Hafıza durumu varsa Kolaylık yerine
  Stabilite, Zorluk ve Hatırlanabilirlik gösteriliyor. Kolaylık yalnızca FSRS kapalıyken görünüyor
  ([#5277](https://github.com/ankitects/anki/pull/5277)). Hatırlanabilirlik tam yüzde.
- **Uygulama:** `app/card-info.tsx:86-95` yalnızca kartta saklı durumu gösteriyor. `:241`
  Kolaylık'ı her zaman gösteriyor. `:258` hatırlanabilirliği bir ondalıkla yazıyor.

## 10. Filtreli deste sıraları FSRS kapalıyken — düşük

- **Anki 26.09.3:** FSRS kapalıyken "Hatırlanabilirlik artan" ve "Hatırlanabilirlik azalan"
  sıraları filtreli deste penceresinde gizli
  ([#5407](https://github.com/ankitects/anki/pull/5407), 26.09).
- **Uygulama:** `lib/filteredDeckOptions.ts:25` (`FILTERED_DECK_ORDER_UI`) 11 sıranın hepsini her
  zaman listeliyor (`components/FilteredDeckOptionsModal.tsx:518`).

## 11. f32 işlem sırası — çok düşük — kapatıldı

- **Anki 26.09.3:** fsrs-rs 6.6.2'nin skaler modeli doğrusal sönümlemeyi `((10 − D) · ΔD) / 9`,
  eğri katsayısını `exp(ln 0.9 / −w20) − 1` olarak hesaplıyor.
- **Uygulama:** 5.2.0'ın sırasını izliyor: `(10 − D) · (ΔD / 9)` ve `exp((1 / −w20) · ln 0.9) − 1`
  (`lib/fsrs.ts:248-250`, `:389-393`).
- **Ölçüm:** varsayılan parametrelerle 400 000 rastgele cevapta D'nin son biti %7.88 oranında
  farklı. S ve tam gün aralık hiçbirinde farklı değil. Kart verisi D'yi 3 ondalığa yuvarladığı için
  fark pratikte görünmez.

## Değişmediği doğrulananlar

- 26.05 ile 26.09.3 arasında şu davranışlar değişmedi: öğrenme ve yeniden öğrenme durum makinesi,
  `with_review_fuzz` ve `constrained_fuzz_bounds`, yük dengeleyici (yalnızca yeniden düzenleme),
  `reviews_for_fsrs` seçimi, `get_last_revlog_info`, `memory_state_from_sm2`,
  `current_retrievability` ve parametre kırpma tablosu.
- fsrs-rs 6.6.2'nin `test_memory_state` (iki değişken), `test_next_states`, `test_next_interval`,
  `test_memory_from_sm2` ve `test_next_difficulty` vektörlerini uygulama f32 düzeyinde aynen
  üretiyor.
- Anki 26.08'den beri Rust 1.97.1 ile derleniyor (26.05: 1.92). Arada `library/core/src/slice/sort`
  altındaki değişiklikler yalnızca yeniden düzenleme. `lib/rustSortUnstable.ts`'in taşıdığı ipnsort
  aynı kaldı.

## Hâlâ açık olan eski farklar

Dördüncü geçişte belgelendi, değişmedi:

- Platformun exp/pow'u yüzünden S/D'nin son bitleri (~%1).
- Filtreli destenin "vade" ve "göreli gecikme" sıralarında yeni kartın pozisyonu 1970'ten gün
  olarak okunuyor; Anki koleksiyonun kuruluşundan sayıyor.
- "Kartı sıfırla"da geri konacak pozisyonu olmayan kart en yüksek yeni pozisyonun bir fazlasını
  alıyor; Anki ayrı bir `nextPos` sayacı tutuyor.
- Filtreli destenin SQL `prop:r`'si 64-bit karşılaştırıyor.

## Bilinçli ürün farkı

- **Günlük yeni kart sınırı yok** (21 Ekim 2026, `04f55a0`). Anki "Yeni kart/gün" sınırını uygular.
  Bu FSRS aralıklarını etkilemez, ama günlük iş yükü ve kuyruk Anki'den farklı olur. "Birebir
  aynı" iddiasının dışında tutulmalı.

## Anki'de olup uygulamada olmayan FSRS özellikleri

- Değerlendir (log loss ve RMSE), sağlık kontrolü, FSRS simülatörü ve iş yükü grafiği, en düşük
  önerilen hedef hatırlama hesabı.
- İstatistiklerde True Retention tablosu ile stabilite, zorluk ve hatırlanabilirlik dağılımları.

## Önerilen sıra

1. Bilgisayardaki Anki'yi 26.09.3'e yükseltip `scripts/anki-oracle/` ile yeni fixture üretmek
   (`test/fixtures/anki-26.09-fsrs.json`). 1. ve 2. maddeyi düzeltmek 26.05 fixture'larının bir
   kısmını bozacak, bu yüzden önce yeni referans gerekiyor.
2. Madde 1: `lib/fsrs.ts` ve `lib/fsrsTraining.ts` içinde tabanı `rating >= 2` yapmak.
3. Madde 2: cevap ve yeniden planlama için ortak bir `minimumReviewFuzzInterval` yardımcı
   fonksiyonu.
4. Madde 3: `setDueDateInterval`'a hafıza durumu yerine `settings.fsrsEnabled` vermek ve
   "yeni kart veya `ivl = 0` → 0" dalını eklemek.
5. Madde 4: optimizer'ı fsrs-rs 6.6.2'nin eğitimine taşımak ve yeni fixture ile ölçmek.
6. Madde 5–10, ardından madde 11.

## Çalıştırılan doğrulama

```
npx vitest run lib/fsrs lib/scheduler lib/loadBalancer lib/ankiRandom
  → 9 dosya, 124 test geçti (26.05 fixture'larına karşı)
geçici prob testi (repoya eklenmedi)
  → fsrs-rs 6.6.2 vektörleri: 7'nin 6'sı f32 düzeyinde aynı; aynı gün Zor farklı
  → Anki 26.09.3 iddiaları: fuzz tabanında 3'ün 2'si, Son tarihi ayarla'da 3'ün 3'ü,
    gelecek tarih kırpmasında 1'in 1'i farklı
npm run quality
  → tsc temiz; 158 dosya, 1 659 test geçti; iOS yapılandırması ve kaynak kaydı doğrulandı
```

Çalıştırılmayan: Anki 26.09.3'ün kendisi (yerelde 26.05 kurulu).


## FSRS-A yeni referans — 23 Ekim 2026

`ready` tabanından `codex/fsrs-a-26-09` dalı. Resmî Apple Silicon paketi kuruldu; Hakkında
penceresinde **26.09.3 (29bb700b)** ve Python 3.13.15 doğrulandı, uygulama açılıp normal çıkışla
kapatıldı. `build-host.sh` yeni uygulamaya karşı derlendi. On üretici, geçici koleksiyonlarla ve
Europe/Istanbul saat diliminde çalıştı; API uyarlaması gerekmedi. `build_fixture.py` 26.09.3
sürümünü denetler ve optimizer bölümünü dışarıda bırakır. Yeni çıktı:
`test/fixtures/anki-26.09-fsrs.json` (fsrs-rs 6.6.2; Anki zamanlayıcısının rand'ı 0.9.4;
optimizer'ın ayrı rand'ı 0.10.1). 26.05 paketleri ve optimizer fixture'ı korunuyor.

Ürün kodunu değiştirmeden yeni referansa bağlanan dört dosya: **10 test geçti, 4 test kaldı**.
Geçenler: Reset Card, önizleme, sıralama anahtarları, fuzz RNG, yük dengeleyici seçimleri ve
dengesiz yeniden planlama. Kalanlar: cevap düğmeleri (bir Zor aralığı 12 yerine 24), hafıza
geçmişi, tam cevap (17 yerine 20 gün) ve dengeli yeniden planlama (18 yerine 20 gün). Madde 1 ve
2 düzeltildikten sonra aynı veriler tekrar koşulacak; açıklanmayan fark yeni madde olarak
kaydedilecek, kapsam dışı kod değiştirilmeyecek.

### Madde 1 sonucu — 23 Ekim 2026

`lib/fsrs.ts` aynı gün tabanı `rating >= 2` oldu. Eski 26.05 iddiasını taşıyan
`lib/fsrs.test.ts` testi de yeni referansa çevrildi: düzeltme öncesinde kaldı, sonrasında altı
stabilite değerinde Hard/Good/Easy tabanı ve Again düşüşü geçti. Yeni oracle'da hafıza geçmişi
ve tam cevap testi geçti; 14 testin 12'si geçiyor. İki kalan test madde 2'nin cevap ve dengeli
yeniden planlama fuzz tabanında. `fsrsTraining.ts` içindeki karşılık FSRS-B'ye bırakıldı.

### Madde 2 sonucu — 23 Ekim 2026

Cevap ve yeniden planlama aynı `minimumReviewFuzzInterval` hesabını kullanıyor. Üç dal ve azami
aralığa göre pencere kontrolü uygulandı; kesme yerine f32 aralığın yuvarlanması esas alınıyor.
Anki'nin (2.7269483, 4) → 4, (2.7269483, 5) → 0 ve (4.591988, 4) → 5 vektörleri ve azami
aralık testi önce kaldı, düzeltmeden sonra geçti (`lib/fsrsScheduler.test.ts`). Altı odaklı
dosyada 46 test ve 26.09.3 oracle'ının 14 testinin tamamı geçti. Başlangıçtaki dört fark
madde 1 ve 2 ile açıklanıp kapandı; rapor dışında yeni davranış farkı çıkmadı.

### Madde 9 sonucu — 23 Ekim 2026

Eksik durum mevcut `withFsrsInputs` salt okunur yoluyla, kartın asıl deste ön ayarı kullanılarak
gösterim için hesaplanıyor. Hesaplanan durum saklanmıyor. FSRS açıkken yeni kartta bile Kolaylık
gizli; hatırlanabilirlik tam yüzde. `lib/fsrsCardInfo.test.ts`: önce dört beklenen hata görüldü,
düzeltmeden sonra beş ekran testi geçti. SQLite yazma casusu ve kartın önce/sonra eşitliği
açılışın kayıt yapmadığını doğruluyor; 26.09.3 hafıza vektörü, saklı decay ve filtreli kartın
asıl ön ayarı kullanması da kapsanıyor.

**Koşulmayan hedefli iPhone smoke:** yeni kart ve hafızası silinmiş cevaplı kartta Kart bilgisi
aç/kapat; FSRS açık/kapalı Kolaylık görünümü; tam yüzde; geri kaydırma ve VoiceOver. Bu eksik
canlı doğrulama nedeniyle iPhone yayın kapısı açık kalır.

### Madde 11 sonucu — 23 Ekim 2026

Yeni Anki'nin 3.000 durum çıktısı üzerinde eski ve önerilen skaler sıra karşılaştırıldı. Yeni
sıranın Anki ile tam eşleştiği, eskisinin ayrıldığı 415 difficulty ve 24 stability çıktısı
bulundu. Sabit üretici indekslerinden altı vektör (8, 28, 564; üç difficulty ve üç stability)
`scalarOrderProbes` olarak yeni fixture'a eklendi; beklenen değerler yalnız Anki çıktısından
alınıyor. Tam f32 eşitliği isteyen test eski kodda kaldı, iki işlem sırası düzeltildikten sonra
geçti. Eğri faktöründe `ln 0.9 / -w20`; difficulty'de önce çarpım sonra 9'a bölme uygulanıyor.
Odaklı iki dosyada 35 test geçti. Platform exp/pow'undan gelen genel son-bit farkı hâlâ
belgelenmiş toleransla ölçülüyor; seçilen altı vektör genel tam parite iddiası değildir.

### FSRS-B entegrasyon notu — kart kimliği

B'nin yeni eğiticisi için `collectFsrsTrainingItems` her öğeye kalıcı olmayan `cardId` alanı
ekliyor. `fsrsMemory.ts`, eğitim algoritması ve kart verisi değişmiyor. İki kartın iç içe geçmiş
revlog zamanlarında kimlik, uzunluk ve kronolojik sıra test edildi; önce kimlikler undefined
olarak kaldı, bağlantıdan sonra geçti. Toplam cevap sayısı ve askıdaki kartların dışlanması
korundu. Bu küçük bağlantı A'nın sahip olduğu `fsrsMaintenance.ts` dosyasında ayrı commit'tir.

## FSRS-A sonuç kaydı — 23 Ekim 2026

Dal: `codex/fsrs-a-26-09`, taban: `ready` / `3821196`. Ana checkout'taki kullanıcı değişikliklerine
dokunulmadı; commit'ler yerel, push ve PR yok.

| Madde | Sonuç | Otomatik kanıt | Kalan |
| --- | --- | --- | --- |
| 1 | A zamanlama kapatıldı | `fsrs.test.ts` aynı gün tabanı ve 26.09.3 hafıza/tam cevap oracle'ı | Optimizer ileri hesabı B'nin |
| 2 | Kapatıldı | `fsrsScheduler.test.ts` üç referans değer + üst sınır; `fsrsAnkiParity.test.ts` cevap ve dengeli/dengesiz yeniden planlama | Yok (kayıtlı vektörlerde) |
| 9 | Kısmen: kod ve otomatik test tamam | `fsrsCardInfo.test.ts` 5 ekran/SQLite testi; yazma yok | Hedefli iPhone/VoiceOver smoke koşulmadı |
| 11 | Kapatıldı | `fsrsAnkiParity.test.ts` 6 tam f32 probe | Genel exp/pow son-bit toleransı sürüyor |

| Adım | `npm run quality` |
| --- | --- |
| Yeni fixture, ürün kodu öncesi | TypeScript geçti; 160 dosyada 1.674 geçti / 4 kaldı |
| Madde 1 sonrası | TypeScript geçti; 1.676 geçti / 2 fuzz testi kaldı |
| Madde 2 sonrası | 160 dosya, 1.679 test; TypeScript ve iOS/kaynak kaydı geçti |
| Madde 9 sonrası | 161 dosya, 1.684 test; TypeScript ve iOS/kaynak kaydı geçti |
| Madde 11 sonrası | 161 dosya, 1.685 test; TypeScript ve iOS/kaynak kaydı geçti |
| cardId bağlantısı sonrası | 161 dosya, 1.686 test; TypeScript ve iOS/kaynak kaydı geçti |

`npm run build:web` üretim paketini ve 22 rotayı, `/card-info` dâhil, başarıyla üretti. Bu
web derlemesi iPhone smoke yerine sayılmadı. Yeni referansın 15 testi (altı f32 vektörünü
içeren bir testle birlikte) geçti; raporda olmayan ek davranış farkı kalmadı.

FSRS-B'ye Anki kurulumu ve `aa7cf78` kimlik bağlantısı iletildi. B, bu bağlantıyı alıp gerçek
collector çıktısını artık elle kimlik eklemeden eğittiğini ve kendi testlerinin geçtiğini
bildirdi. A dalı optimizer uygulamasını veya `gen_optimize.py` dosyasını içermiyor.
Birleştirme sırasında A zamanlama kanıtları ile B optimizer kanıtları aynı FSRS belge
bölümünde korunmalı; metadata bağlantısının B'deki karşılığı tekrar uygulanmamalı.

Diğer AI'lara ait 3, 5, 6, 7, 8 ve 10. maddelere dokunulmadı. Günlük yeni kart sınırı
geri getirilmedi. Tam Anki paritesi iddia edilmiyor.
