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

   > **Açık uç:** çağrı yeri olan `app/deck-options.tsx` bu denetimin dosya kapsamı dışındaydı, bu
   > yüzden seçenekler henüz optimize butonundan geçirilmiyor. Tek satırlık bağlama gerekiyor:
   > `optimizeFsrsParameters(items, { …, clamp: { numRelearningSteps: form.lapseSteps.length, enableShortTerm: fsrsShortTermWithSteps } })`.

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
