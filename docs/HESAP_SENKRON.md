# Hesap ve senkron: veri altyapısı

> **Durum (23 Kasım 2026):** Faz 1a, 1b ve 2 uygulandı (§15). Kod `lib/sync/`, `lib/syncContract.ts`, `contexts/SyncContext.tsx`, `components/account/AccountSyncSection.tsx` ve sunucuda `server/account/sync*.ts`. Eşitleme isteğe bağlıdır (Ayarlar › Hesap › Eşitlemeyi aç) ve yalnızca `/v1/session` yanıtında `sync: true` diyen bir sunucuyla görünür. Faz 3 (medya) ve 4 (erişim hakları) yapılmadı. Tasarımın ilk doğrulama araçları `scripts/sync-verification/` klasöründe; asıl doğrulama artık gerçek uygulama koduyla çalışan testler (§15.3).

## 1. Hedef

iPhone uygulaması ve web aynı koleksiyonun iki eşit istemcisi olacak. Öğrenci hangisini açarsa açsın birkaç saniye içinde aynı kuyruğu, istatistiği ve Kronometre'yi görecek. Ağ yokken ikisi de çalışmaya devam edecek; bağlantı gelince değişiklikler kendiliğinden birleşecek. Bu birleşme hiçbir zaman "hangi cihazdaki veriyi tutayım?" diye sormayacak.

## 2. İlkeler

1. **Önce cihaz.** Çalışma ağı hiç beklemez. Senkron arka planda yürür ve ağ hatası çalışmayı durdurmaz (AGENTS: "Keep the app usable offline").
2. **Her yazma yakalanır.** Bir değişikliğin senkrona girmesi, onu yazan kod yolunun hatırlamasına bağlı olmaz; veritabanı tetikleyicileri yakalar.
3. **Birleştirme sıraya bağımsızdır.** Değişiklikler hangi sırada, kaç kez ve hangi gecikmeyle gelirse gelsin her kopya aynı sonuca varır. Tekrarlanan veya kaybolan istek veri bozmaz.
4. **Sonra yapılan değişiklik, dayandığı eski hâle yenilmez.** Cihaz saati yanlış olsa bile.
5. **Varsayılan hiçbir zaman kazanmaz.** Yeni kurulan ya da önbelleği silinen bir cihazın varsayılanları öğrencinin ayarlarını ezmez.
6. **Hiçbir cevap kaybolmaz.** Cevap kaydı yalnızca büyür; geri alınan cevap silinmiş olarak işaretlenir.
7. **Her verinin bir gerekçesi vardır.** Bir özelliğin gerektirmediği veri toplanmaz (KVKK'daki ölçülülük ilkesi).

## 3. Doğrulama ilk tasarımda neyi değiştirdi

İlk tasarım satır bazında karar veriyordu: cihaz saatine (saniye) göre değişiklik zamanı yeni olan satır kazanıyor, eşitlikte sunucunun verdiği sıra numarası (`usn`) belirliyordu. Değişiklikleri işaretlemek için bugünkü `usn = -1` alışkanlığına güveniyordu.

Bu tasarımı uygulamanın kodu ve rastgele senkron simülasyonu (bkz. bölüm 9) ile sınadım. Aşağıdaki açıklar çıktı; hepsi bu belgede kapatıldı.

| # | Açık | Kanıt | Bu belgedeki çözüm |
|---|---|---|---|
| 1 | Değişiklik işaretleme güvenilmez. `saveAnkiCard` / `saveNote` / `saveDeck`, çağıranın getirdiği `usn`'yi yazıyor. Askıya alma, gömme ve bayrak (`noteStore.ts`), cevabı geri alma (`studyAnswer.undoAnswer`) ve yeniden sıralamayı geri alma (`browserReposition.ts`) senkronlanmış bir kartta değişikliği işaretlemiyor. Bugün çalışıyor görünmesinin tek nedeni hiçbir satırın henüz "temiz" sayılmaması. | Kod; simülasyon `V1-code` | §7.1: tetikleyicilerle yakalama |
| 2 | Cevabı geri alma kartı eski `mod` değeriyle yazıyor. Senkronda geri alma, geri aldığı cevaba yenilir. | `undoAnswer`: `restored = { ...current }` | Her yakalanan yazma o anın saatini alır |
| 3 | Satır bazında karar, aynı karttaki farklı alanlara yapılan eşzamanlı değişikliklerden birini siliyor (iPhone'da cevap, webde bayrak). | Simülasyon: stres testinde koşuların %85+'ında kayıp bayrak, askı ve deste | §6.2: alan grubu bazında karar |
| 4 | Cihaz saati yanlışsa sonra yapılan değişiklik kaybediyor. Saniye çözünürlüğü de eşitlikleri sıklaştırıyor. | Simülasyon | §6.1: kalıcı karma mantıksal saat (HLC) |
| 5 | Uygulama ayarları tek bir JSON bloğunda (`tus_app_settings_meta_v1`) ve cihaza özel tercihlerle karışık. Planlar da tek blok (`tus_study_plans_v1`). Blok bazında karar, iki cihazdaki farklı ayar değişikliklerinden birini siliyor. | Kod; simülasyon (%20+ kayıp ayar) | §4.3 ve §6.2: ayar bazında alan, plan başına nesne |
| 6 | Günlük limitlere giren bilgi `settings` tablosunda duruyor: `interday_review_usage:<revlogId>` ve `filtered_membership_v1:<deckId>`. | `queueBookkeeping.ts` | §7.3: cevap satırının bayrağı ve filtreli destenin alanı olarak taşınır |
| 7 | İlk açılış varsayılanları "şimdi" damgasıyla yazılıyor (`ensureBuiltinNoteTypesSeeded`: `Date.now()`, `usn = -1`). Önbelleği silinen bir tarayıcı, öğrencinin not tipi ve ayarlarını varsayılanlarla ezer. | Kod; simülasyon | §7.4: varsayılanlar saat 0'da |
| 8 | Bazı silmeler iz bırakmıyor: not tipi, ayar grubu, Kronometre oturumu, geri alınan cevap, ayar anahtarı. | `noteTypeDeletion.ts`, `deckPresets.ts`, `stopwatchStore.ts`, `reviewLogger.deleteReviewById` | Tetikleyici + `del` alanı |
| 9 | Kimlik çakışması mümkün. Oturum numarası `max(şimdi, en büyük + 1)`: iki cihaz aynı numarayı alabilir. Aynı milisaniyede üretilen kimlikler de çakışabilir. | `stopwatchStore.nextSessionId`; simülasyon (%12 kayıp oturum) | §6.5: kimlik denetimi ve yeniden numaralama |
| 10 | Katalog satırlarının yerel kimliği cihazdan cihaza değişebiliyor. Öğrencinin AnKing not tipi paket kimliğini tutuyorsa, diğer cihazdaki katalog satırıyla çakışır. | `catalogIds.ts` | §6.4: çekmede katalog satırı taşınır |
| 11 | Aynı adlı desteleri birleştirmek kart taşıyor ve satır bazında bu taşıma cevapları silebiliyordu. Silinmiş desteye bakan kart da kalabiliyordu. | Simülasyon (%14–16 kopuk kart) | §6.4: türetilmiş yazma ve kart onarımı |
| 12 | Gönderim yanıtı kaybeden alanları bildirmiyordu; tutarsız bir cihaz kendini düzeltemiyordu. | Simülasyonda saat hatası durumunda kalıcı ayrışma | §8.3: yanıtta "kazananlar" |
| 13 | İlk bağlanmada ve geri yüklemede "yükle mi, indir mi?" seçimi vardı (`epoch`). Yanlış seçim veriyi silerdi. | Tasarım | §7.6: ilk bağlanma ve geri yükleme sıradan senkron |
| 14 | Gönderim yoldayken yapılan düzenleme, saniye çözünürlüğü yüzünden "gönderildi" sayılabiliyordu. | Simülasyon (`ack-all`: koşuların %54'ünde bozulma) | §7.1: sıra numarasıyla temizleme |
| 15 | Canlı SQLite dosyasını kopyalayan yedek bozuk olabilir. Günlük yedek, bir günlük veri kaybı demek. | Tasarım | §8.5: `VACUUM INTO`, değişen kullanıcılar için saatlik yedek |
| 16 | Tarayıcıda önbellekte kalmış eski bir sürüm tetikleyicisiz yazabilir. | Tasarım | §8.4: günlük sağlama turu |
| 17 | Hetzner 15 Haziran 2026'da fiyatları artırdı ve 26 Haziran'dan beri yeni bulut sunucu açmayı kısıtlıyor. | Sağlayıcı sayfaları | §11: sağlayıcıdan bağımsız gereksinim ve seçenekler |
| 18 | "Türkiye'de barındırmak KVKK yükünü kaldırır" eksik bir ifadeydi: RevenueCat ve yurt dışındaki bir e-posta servisi yine yurt dışına aktarım sayılır. | KVKK md. 9 | §12 |

İkinci turda alan gruplarını (§6.2) tek tek yerel veri modeline (`lib/models.ts`) ve o alanları yazan koda karşı denetledim. Bu turda simülatör çalıştırılmadı; her açık kodla gösterildi. Aşağıdaki açıklar çıktı ve §6'da kapatıldı.

| # | Açık | Kanıt | Bu belgedeki çözüm |
|---|---|---|---|
| 19 | Not etiketleri tek grup. Cevap sırasında sülük kuralı nota kendiliğinden `leech` ekliyor (varsayılan `leechAction: 'tag'`). Webde konan bir etiketle çevrimdışı telefondaki `leech` yarışır, biri kaybolur. | `noteStore.handleLeech` | §6.2: etiket başına grup |
| 20 | Not alanları tek grup ve sıra numarasıyla tutuluyor. İki cihazda farklı alanlara yapılan düzenlemelerden biri kaybolur. Not tipine alan eklemek, silmek ya da sırasını değiştirmek bütün notların alan dizisini yeniden yazıyor; eşzamanlı eski düzendeki bir düzenleme kazanırsa değerler yanlış alanlara düşer. Alanların değişmeyen bir kimliği yok (`NoteTypeField`: yalnızca `name`, `ord`). | `noteTypeEditor.applyFieldEdit` (`migrate`) | §6.2: değişmeyen alan kimliği, alan başına grup |
| 21 | Deste adı tam yol. Yeniden adlandırma bütün alt destelerin adını yeniden yazıyor. Bir cihazda üst deste yeniden adlandırılırken diğerinde alt deste açılır ya da adlandırılırsa ağaç ikiye bölünür. | `deckStore.renameDeck` (`instr(name, ?) = 1`) | §6.2: `parent` + `leaf` |
| 22 | Destenin bazı alanları hiçbir gruba girmiyordu: `sortOrder`, `newLimit`, `reviewLimit`, desteye özel `desiredRetention`, `descriptionMarkdown`, `isFiltered`. "Yalnızca bugün" limitleri (`deck_today_limits:<id>`, `deck_today_boost:<id>`) ne §4.3'te ne §7.3'teydi. | `models.Deck`, `deckLimits.ts` | §6.2 ve §7.3 |
| 23 | Filtreli destenin `filter` grubu kullanıcının arama ayarlarıyla her cevapta değişen ilerlemeyi (`filteredDoneCardIds`, `filteredPreviewDue`, `filteredBuildAt`, `filteredDeckEmpty`) birlikte taşıyordu. Telefonda filtreli deste çalışılırken webde arama değiştirilirse biri kaybolur. | `models.Deck` | §6.2: `filterOpts` ve `filterBuild` |
| 24 | Askı ve gömme aynı grup. Kardeş gömme yalnızca yerelde askıdaki kartı atlıyor; webde askıya alınan kartı çevrimdışı telefon gömerse gömme kazanır, ertesi gün `unburyCards` kartı askıdan da çıkarır. | `studyAnswer.ts` (`sibling.queue < 0`), `noteStore.unburyCards` | §6.2: `susp` ve `bury` ayrı |
| 25 | Kartın kimlik izi `noteId:ord` değişebiliyor: "Not tipini değiştir" aynı kart kimliğini yeni bir `ord` ile kaydediyor. Sunucu kartı reddederdi. Tersi de var: iki cihaz aynı notta aynı yeni cloze'u üretirse aynı ize iki kimlik düşer. | `noteTypeStore.ts` (`saveAnkiCard({ ...card, ord })`) | §6.5: iz `noteId:ord` değil, kart kimliği; `ord` grupta; aynı ize düşen kartlar birleşir |
| 26 | Kart ve not satırlarında `del` grubu tabloda yazmıyordu; Boş Kartlar tek tek kart siliyor. | `noteDeletion.deleteCardRows` | §6.2 |
| 27 | Not tipinde `sortFieldIdx` ve `kind` hiçbir grupta değildi; `schema` tek parça olduğu için şablon düzenlemesi ile eşzamanlı alan adı değişikliği birbirini ezerdi. Katalog notunun `catalogFieldsEdited` bayrağı `overlay`'den ayrı kalıyordu. | `models.NoteType`, `models.Note` | §6.2 |
| 28 | Aynı kart iki cihazda çevrimdışı cevaplanınca `reps`, `lapses` ve FSRS belleği yalnızca bir cihazın hesabından geliyor; iki cevap da kayıtta olduğu hâlde sayılar birini kaçırıyor. | Tasarım; `sched` tek grup | §6.4: birleşmiş cevap kaydından yeniden hesaplama |

## 4. Hangi veriler

### 4.1 Sunucuda tutulanlar

| Grup | Veri | Neden |
|---|---|---|
| Kimlik (var) | ad, e-posta, scrypt parola özeti, doğrulama zamanı, oturum belirtecinin özeti, kabul edilen koşul sürümü, hesap olayları (tür ve saat) | giriş, güvenlik, KVKK kanıtı |
| Cihazlar | rastgele cihaz kimliği, sunucunun verdiği kısa cihaz numarası, ad ("iPhone", "Chrome · Mac"), platform, uygulama ve biçim sürümü, son görülme, son senkron | "Cihazlarım", uzaktan çıkış, sürüm kapısı, çakışmada eşitlik bozma |
| Katalog ilerlemesi | kart başına zamanlama, FSRS belleği, bayrak, askı/gömme; not başına etiketler ve öğrencinin alan farkları; katalog destesinin açık/kapalı hâli | öğrencinin aylarca emeği. `catalogProtection.ts`'teki öğrenci alanlarının tamamı. |
| Kendi içeriği | notlar (alanlar, etiketler, GUID), kartlar, not tipleri, desteler, ayar grupları, filtreli desteler | kullanıcının ürettiği içerik |
| Cevap kaydı | zaman (ms), kart, buton, aralık, önceki aralık, faktör, süre, tür, silindi, limit bayrağı | istatistik, seri, günlük limit, FSRS; en büyük tablo |
| Kronometre | oturumlar, konular (`user_subjects_v1`), tercihler (sınav tarihi dahil), planlar, çalışan sayaç | takvim, analiz, cihazlar arası akan sayaç |
| Koleksiyon ayarları | §4.3'teki "senkronlanır" alanları, `anki_collection_v1` | iki cihazda aynı öğrenme davranışı |
| Medya | öğrencinin fotoğraf ve ses kayıtları, içe aktarılan destelerin dosyaları (SHA-256 ile, kotayla) | |
| Erişim hakları | hak, ürün, kaynak, durum, tarih | BKA'nın iPhone'da da webde de açılması |
| İşletim | sunucu yedekleri; en fazla 14 gün erişim logu (IP'siz) | geri dönüş, güvenlik |

### 4.2 Cihazda kalanlar

- Ekranla, elle ve bildirimle ilgili tercihler (§4.3).
- O an açık deste (`tus_current_deck_v1`), editör taslakları ve sabit alanlar, tarayıcı görünümü, bul-değiştir tercihleri, beyaz tahta.
- Katalog kurulum durumu (`bka_tus_catalog_*`), ilk açılış ve geçiş bayrakları, son bakım ve son yedek zamanı.
- Arama dizini (`cards_fts`) ve cihazdaki yedek dosyaları.

### 4.3 Ayarların sınıflandırması

Kural: **Öğrenmeyi değiştiren ayar senkronlanır. Ekran, el hareketi, klavye, bildirim ve yedekleme ayarları cihazda kalır.** Emin olunamayan bir ayar cihazda kalır. Liste, ayarın tanımının yanında `syncScope: 'collection' | 'device'` olarak tutulur ve bir testle korunur: listede olmayan yeni bir ayar testi düşürür.

| Senkronlanır | Cihazda kalır |
|---|---|
| `language`, `dayRolloverHour`, `learnAheadMinutes`, `queueOrder`, `newCardsIgnoreReviewLimit`, `limitsStartFromTop`, `algorithm`, `fsrsEnabled`, `fsrsShortTermWithSteps`, `newCardDeckMode`, `timeboxMinutes`, `autoAdvance`, `showNextReviewTimes`, `showRemainingCount`, `hideHardAndEasy`, `neverTypeAnswer`, `typeAnswerInCard`, `interruptAudioOnAnswer`, `audioPlaybackRate` | `themeMode`, `textSizeLevel`, `keyBindings`, yakınlaştırma ve yazı ölçekleri, düğme yerleşimi ve araç çubukları, dokunma ve kaydırma hareketleri, `keepScreenOn`, `studyNotification*`, `autoBackup*` ve yedek kopya sayıları |

Ayar grupları (deste seçenekleri) her zaman senkronlanır. Bugün Ayarlar ekranından yazılan `autoPlayAudio` gibi alanlar varsayılan ayar grubunda zaten bulunuyor.

### 4.4 Hiç toplanmayanlar

- Katalog içeriği (alanlar, şablonlar ve katalogun medyası), lisans ve boyut nedeniyle.
- Telefon numarası, doğum tarihi, konum, rehber, reklam kimliği, cihaz parmak izi.
- Kart ve ödeme bilgisi: bunlar Apple'da ve RevenueCat'te kalır.
- Kalıcı IP kaydı: hız sınırı için yalnızca bellekte tutulur.

## 5. Mimari

```
 iPhone (expo-sqlite)                  Web (sql.js + IndexedDB, tek yazar sekme)
  yerel kopya = asıl                    yerel kopya = önbellek
  tetikleyici → sync_dirty              tetikleyici → sync_dirty
        │ HTTPS, taşıyıcı belirteç            │ HTTPS, HttpOnly çerez
        └──────────────────┬──────────────────┘
                           ▼
            Caddy (HTTPS, ters vekil, 25 sn uzun yoklamaya izin)
                           ▼
            Node 24 hesap + senkron sunucusu (tek süreç, node:sqlite)
              ├─ accounts.sqlite               kimlik, cihazlar, senkron durumu, haklar
              ├─ collections/<userId>.sqlite   öğrenme verisi (kişi başı bir dosya)
              ├─ bellekte: bekleyen uzun yoklamalar, hız sınırları
              └─ imzalı URL ─► nesne deposu   media/<userId>/<sha256>, backups/
            RevenueCat webhook ─► entitlements
```

Kişi başı ayrı SQLite dosyası seçildi; sebepleri ilk tasarımdakiyle aynı:
- yeni bağımlılık yok,
- bir sorguda `WHERE user_id` unutulsa bile başkasının verisi sızmaz,
- KVKK silme ve dışa aktarma işi tek dosyaya iner,
- Anki'nin sunucusu da kullanıcı başına koleksiyon tutar.

Birden fazla sunucu örneği veya kullanıcılar arası sorgu gerektiğinde Postgres'e geçilir. Sözleşme senkron API'si olduğu için depolama katmanı değişebilir.

## 6. Birleştirme modeli

Her senkron nesnesi bir **alan grupları sözlüğüdür**: `{ grup: [değer, saat, cihazNo] }`. Sunucu da cihaz da her grup için aynı kuralı uygular: saati büyük olan kazanır, eşitlikte cihaz numarası büyük olan. Bu kural değişme, birleşme ve tekrar özelliklerini taşır; gecikme, tekrar ve sıra ne olursa olsun bütün kopyalar aynı sonuca varır. Sunucu değerlerin içini anlamak zorunda değildir; yalnızca grupların saatlerini karşılaştırır.

### 6.1 Saat: kalıcı karma mantıksal saat (HLC)

- **Biçim:** `ms × 1000 + sayaç`. JavaScript'in güvenli tamsayı aralığına ve SQLite `INTEGER`'a sığar.
- **Yerel yazma:** `saat = max(saat + 1, (cihazSaati + sunucuFarkı) × 1000)`.
- **Gelen değer:** `saat = max(saat, gelen)`. Bu "gözlem" kuralı, cihaz saati geri olsa bile sonra yapılan değişikliğin daha büyük bir saat almasını sağlar. Simülasyonda bu kural kaldırılınca hata oranı %0,2'ye, sunucu farkıyla birlikte kaldırılınca %1,6'ya çıkıyor.
- **Sunucu farkı:** Her yanıtta sunucu saati gelir. Cihaz `sunucuFarkı`nı gidiş-dönüş süresinin yarısıyla düzeltir. Bu fark doğruluk için şart değildir (simülasyonda tek başına kaldırıldığında hata yok). İşe yaradığı yer, eşzamanlı değişikliklerin gerçek zamana yakın sıralanması.
- **Kalıcılık:** Saatin son değeri `sync_meta`'da tutulur ve yazmayla aynı işlemde güncellenir. Uygulama yeniden açıldığında saat geri giderse "gözlem" kuralının sağladığı güvence bozulur.
- **Saat sınırı:** Sunucu, kendi saatinden 5 dakikadan fazla ileride damgalanmış bir değişikliği `clock_ahead` hatasıyla reddeder ve kendi saatini döner. Cihaz, henüz kimsenin görmediği bekleyen değişikliklerini düzeltilmiş saatle yeniden damgalar ve tekrar gönderir. Böylece ileri saatli tek bir cihaz herkesin saatini ileri çekemez.

### 6.2 Alan grupları

| Nesne | Gruplar |
|---|---|
| Kart (kendi ve katalog) | `sched`: type, queue'nun zamanlama kısmı, due, ivl, factor, reps, lapses, left, lastReview, FSRS belleği. `place`: deckId, odid, odue (birlikte hareket ederler). `flag`. `susp`: askı (evet/hayır). `bury`: gömme türü ve günü (`[kullanıcı \| kardeş, gün]` ya da boş). `ord` (not tipi değişince değişir). `del`. `queue` saklanmaz: `susp` → −1, bugüne ait `bury` → −3/−2, yoksa `sched`'den hesaplanır. |
| Not | `f:<alanKimliği>` her alan ayrı, `tag:<küçük harfli ad>` her etiket ayrı (var/yok), `notetype`, `del` (kimlik: GUID) |
| Katalog notu | `tag:<ad>` her etiket ayrı, `o:<alanKimliği>` öğrencinin her alan farkı ayrı (yoksa paketteki değer; `catalogFieldsEdited` bundan türetilir) |
| Deste | `parent` (üst destenin kimliği, kökte 0), `leaf` (yalnızca kendi adı), `order` (`sortOrder`), `preset`, `limits` (`newLimit`, `reviewLimit`), `retention` (desteye özel `desiredRetention`), `desc` (açıklama ve `descriptionMarkdown`), `collapsed`, `filterOpts` (arama, limit, sıra, ikinci filtre, `reschedule`, önizleme gecikmeleri, `filteredAllowEmpty`), `filterBuild` (sabit üyelik, `filteredDeckEmpty`, `filteredBuildAt`, önizleme zamanları), `done:<kartId>` (oluşturmadan beri biten her kart ayrı), `today` (yalnızca bugün limiti ve artırma, `[gün, değer]`), `del`, `mergedInto`. `isFiltered` oluşturulurken yazılır, değişmez. |
| Ayar grubu | üst düzeydeki her seçenek ayrı bir alan (dizi değerli `learningSteps`, `fsrsParams`, `easyDays` tek parça), `del` |
| Not tipi | `name`, `css`, `fields` (alan listesi: kimlik, ad, sıra, sticky, rtl, yazı tipi), `sortField` (alan kimliğiyle), `t:<şablonKimliği>` her şablon ayrı, `del`. `kind` oluşturulurken yazılır, değişmez. |
| Uygulama ayarları | senkronlanan her ayar ayrı bir alan (§4.3) |
| Kronometre | oturum başına `session` ve `cleared` (Çalışmaları Temizle geri alınabilsin diye), `del`; tercihler alan başına; çalışan sayaç tek bir `running` alanı (son başlatan kazanır); plan başına `plan` ve `del` |
| Cevap kaydı | ayrı tablo. Satır yalnızca eklenir; `del` yapışkandır, yani bir kez silinen geri gelmez. `flags` bit 0: günlük limitten yer harcadı. |
| Medya | ad → SHA-256, `del` |

Grup seçiminin sonuçları:
- Bir cihazda cevap verilirken diğerinde bayrak konan kartta ikisi de korunur.
- Aynı kart iki cihazda çevrimdışı cevaplanırsa iki cevap da kayıtta kalır; kartın zamanlaması sonraki cevaptan gelir, sayılar birleşmiş kayıttan düzeltilir (§6.4).
- Notun farklı alanlarını iki cihazda düzenlemek, ya da birinde etiket koyarken diğerinde sülük etiketi eklemek çakışma sayılmaz.
- Askıdaki bir kartı başka cihazın gömmesi askıyı kaldırmaz; gömme gün geçince kendiliğinden düşer.
- Üst deste yeniden adlandırılırken başka cihazda açılan alt deste, yeni adın altına düşer.
- Filtreli deste çalışılırken başka cihazda aramasını değiştirmek ilerlemeyi silmez.

Gruplamanın getirdiği kurallar:
- **Alan kimliği.** Her not tipi alanına oluşturulurken değişmeyen bir kimlik verilir (Anki paketinde alanın kimliği varsa o, yoksa rastgele). Notun değerleri alan kimliğiyle saklanır. Alan eklemek, silmek ya da sırasını değiştirmek yalnızca not tipinin `fields` grubunu değiştirir; notlara dokunmaz. Yerel `notes.data` bugünkü gibi sıra numaralı dizi kalır; kodlayıcı (§7.3) iki biçim arasında not tipinin alan listesiyle çevirir. Silinen bir alanın değeri notta durur ama gösterilmez; alan geri gelirse değer de gelir.
- **Deste yolu cihazda hesaplanır.** Yerel `decks.name` (tam yol, `UNIQUE`) `parent` zincirinden ve `leaf`'lerden türetilir. Yeniden adlandırma yalnızca o destenin `leaf`'ini, taşıma yalnızca `parent`'ını yazar; alt desteler hiç değişmez. `parent` döngü oluşturursa (iki cihaz iki desteyi birbirinin altına taşımış), döngüdeki en küçük kimlikli deste köke alınır (§6.4).
- **Etiket adı küçük harfle anahtarlanır.** Anki'de etiketler büyük-küçük harfe duyarsız; değer, son yazılan yazımı taşır.

### 6.3 Silme

Silme, `del` alanına `true` yazmaktır; silmeyi geri almak `false` yazar. Düzenlemeler bu alana dokunmadığı için eşzamanlı bir düzenleme silinmiş nesneyi geri getirmez. Anki'deki "mezar kazanır" davranışıyla aynıdır. Silinen nesnenin içeriği sunucuda 30 gün saklanır, böylece geri getirilebilir. Silindi işareti ise 180 gün kalır, böylece uzun süre bağlanmamış cihazlar da silmeyi öğrenir.

### 6.4 Türetilmiş yazmalar ve onarımlar

Bazı durumları her cihaz kendisi aynı biçimde düzeltir. Böyle bir **türetilmiş yazma**, dayandığı sürümün bir adım üstüne damgalanır (`taban + 1`). Böylece eski hâli geçer, ama kendisinden sonra yapılmış gerçek bir düzenlemeyi hiçbir zaman ezmez. Aynı onarımı birden fazla cihaz yaparsa sonuç aynıdır.

| Durum | Onarım |
|---|---|
| Senkrondan sonra aynı adlı iki canlı deste (iki cihazda çevrimdışı açılmış "Anatomi") | En küçük kimlikli deste kalır. Diğerine `mergedInto` ve `del` yazılır, kartları kalan desteye geçer. Ad yolları ayrı ayrı birleştiği için alt desteler de doğru birleşir. |
| Kart silinmiş bir desteyi gösteriyor | `mergedInto` zinciri izlenir, o da yoksa kart Varsayılan desteye (kimlik 1) geçer. |
| Notun alan sayısı not tipiyle uyuşmuyor | Okurken eksik alan boş sayılır, fazlası korunur; türetilmiş yazma notu hizalar. |
| Çekilen bir öğrenci satırı, yerelde bir katalog satırının kimliğine düşüyor | Yerel katalog satırı `catalogIds.ts`'in bugünkü kuralıyla yeni kimliğe taşınır, ardından öğrenci satırı yazılır. |
| Gün dönümünde gömülü kartlar açılıyor | Türetilmiş yazma: aynı gün başka cihazda verilen cevabı ezmez. |
| Filtreli destenin sabit üyeliği, kartın bulunduğu desteyle çelişiyor (iki cihaz aynı kartı farklı filtreli destelere almış) | Kartın `place` grubu esas alınır; üyelik türetilmiş yazmayla düzeltilir. |
| Deste `parent`'ları döngü oluşturuyor | Döngüdeki en küçük kimlikli destenin `parent`'ı 0 yapılır. |
| İki ayrı deste aynı tam yola düşüyor (aynı `parent`, aynı `leaf`) | Aynı adlı deste kuralı uygulanır: en küçük kimlikli kalır, diğerine `mergedInto` ve `del` yazılır. |
| Aynı kart iki cihazda çevrimdışı cevaplanmış | `reps`, `lapses` ve FSRS belleği birleşmiş cevap kaydından yeniden hesaplanır. Yalnızca kayıtta, kartın `sched` saatinden sonra eklenmiş başka bir cihazın cevabı varsa çalışır. |
| Aynı notta aynı şablon sırası için iki kart (iki cihaz aynı yeni cloze'u üretmiş) | En küçük kimlikli kart kalır, diğerine `del` yazılır; cevap kayıtları kalan karta bağlanır. |
| Aynı çalışan Kronometre iki cihazda durduruluyor (biri çevrimdışıyken) | Çalışan sayaçtan doğan oturumun kimliği ve kimlik izi sayacın başlangıcından türetilir (`run:<başlangıçMs>`). İki cihaz aynı oturumu yazar ve alanlar birleşir; çift oturum oluşmaz. |

### 6.5 Kimlik denetimi

Kimlik alanı tek bir id uzayı paylaşır (Anki gibi zaman damgası). Her nesne, değişmeyen bir **kimlik izi** taşır:

| Nesne | Kimlik izi |
|---|---|
| Not | GUID |
| Kart | oluşturulurken yazılan `noteGuid:kartKimliği`. `ord` izde yoktur, çünkü "Not tipini değiştir" aynı kartın `ord`'unu değiştirir. Aynı nota aynı `ord` için iki kart düşerse §6.4'teki onarım birleştirir. |
| Cevap | kart |
| Deste, ayar grubu, not tipi, plan | oluşturulurken JSON'a yazılan rastgele `syncIdent` |
| Kronometre oturumu | yeni `sync_ident` sütunu (`ensureAdditiveTables` yoluyla) |

Sunucu aynı kimlikte farklı iz görürse o nesneyi reddeder. Cihaz kendi nesnesini yeni bir kimliğe taşır, ona bakan referansları türetilmiş yazmayla günceller ve yeniden gönderir. Çekmede aynı durum görülürse yine yerel nesne taşınır.

Katalog satırları ayrı türlerle ve paket kimliğiyle anahtarlanır. Öğrencinin satırlarıyla hiçbir zaman çakışmaz.

## 7. Cihaz tarafı

### 7.1 Değişiklik yakalama

- Senkronlanan her tablo için kalıcı olmayan (`TEMP`) tetikleyiciler kurulur. Bunlar veritabanı her açıldığında yeniden kurulur ve dosyaya yazılmaz. Böylece dışa aktarılan `.colpkg` ve `.apkg` dosyalarına sızmaz, eski sürümler de koleksiyonu açabilir.
- Tetikleyiciler `INSERT`, `UPDATE` ve `DELETE` olaylarında hangi grupların değiştiğini bulur. Kart için bunu yansıtılan sütunlardan ve `data` içinden yapar (`json_extract`). Sonucu `sync_dirty(kind, id, grp, hlc, seq)` tablosuna yazar; saat tetikleyicinin içinde ilerletilir.
- Senkronun kendi uyguladığı değişiklikler yakalanmaz. Bunun için uygulama sırasında `sync_guard.applying = 1` yapılır.
- Gönderim, `seq ≤ S` olan kayıtları yollar. Yanıt gelince yalnızca o kayıtlar silinir; yoldayken yeniden değişen bir grup bekleyen olarak kalır.
- Katalog kurulumu ve güncellemesi içerik yazar, öğrenci verisi değil. Bu yüzden koruma açıkken çalışır.
- Yeni tablolar ve sütunlar (`sync_dirty`, `sync_meta`, `sync_shadow`, `study_sessions.sync_ident`) `ensureAdditiveTables` yoluyla eklenir, numaralı migration ile değil. Böylece eski sürümler koleksiyonu açmaya devam eder (`lib/db.ts`).

### 7.2 Gölge

`sync_shadow(kind, id, groups)` her nesnenin her grubu için son bilinen sürümü (saat ve cihaz) tutar. Çekilen bir değer yalnızca gölgedekinden yeniyse uygulanır; yerelde bekleyen bir grup ile gelen değer aynı kuralla yarışır.

### 7.3 Kodlayıcı: yerel satır ile tel biçimi arasında

- **Satırları gruplara ayırır.** Katalog satırlarından yalnızca öğrenci alanlarını alır (`catalogProtection.ts`'teki `LEARNER_*` kümeleri).
- **Referansları çevirir.** Bir katalog destesi, not tipi ya da ayar grubuna verilen her referans paket kimliğiyle yazılır.
- **Kuyruk defterini taşır.**
  - `interday_review_usage:<id>` anahtarı, cevap satırındaki `flags` alanının 0. biti olur.
  - `filtered_membership_v1:<deckId>`, filtreli destenin `filterBuild` grubuna girer.
  - `deck_today_limits:<deckId>` ve `deck_today_boost:<deckId>`, destenin `today` grubuna günüyle girer; gün geçince değer yok sayılır.
- **Not alanlarını çevirir.** Yerelde sıra numaralı dizi, telde alan kimliğiyle `f:<alanKimliği>` grupları (§6.2).
- **Deste yolunu çevirir.** Gönderimde tam yoldan `parent` ve `leaf` çıkarılır; çekmede tam yol yeniden kurulur ve alt destelerin `name` sütunu güncellenir. Bu yeniden yazmalar türetilmiştir, yakalanmaz.
  - Çekmede bu anahtarlar yerelde yeniden yazılır, böylece sorgular bugünkü gibi çalışır.
- **Bilinmeyen alanları korur.** Bilmediği JSON alanlarını hiçbir zaman silmez; web anında güncellenirken iOS günler sonra güncellenir. Bilmediği grupları da korur: gönderim yalnızca değişen grupları taşıdığı için eski bir sürüm, yeni bir sürümün eklediği bir grubu ezemez. Sunucunun en düşük istemci sürümü kapısı (`upgrade_required`), biçimi değiştiren güncellemeler için kalır.

### 7.4 Varsayılanlar ve bakım

- İlk açılışta yazılan her şeyin saati **0**'dır: yerleşik not tipleri, Varsayılan deste, Varsayılan ayar grubu ve ayar varsayılanları. Bu değerler yalnızca boşluğu doldurur, hiçbir zaman kazanmaz.
- `healBuiltinNoteTypeTemplates` gibi bakım yazmaları türetilmiş yazmadır (`taban + 1`).

### 7.5 Geri alma

Cevabı geri almak, kartın önceki zamanlamasını **yeni bir sürüm** olarak yazar ve cevap kaydına `del` koyar. Yakalama tetikleyiciyle yapıldığı için bugünkü `undoAnswer` kodu değişmeden doğru davranır. Yeniden sıralamayı geri almak ve silmeyi geri almak da aynı yoldan geçer.

### 7.6 İlk bağlanma, önbelleği silinen tarayıcı, geri yükleme

- **İlk bağlanma sıradan bir senkrondur.** Bu cihazdaki ilerleme ve notlar hesaptakilerle birleşir. Kullanıcıya bir kez şu bilgi gösterilir: "Bu cihazdaki 1.240 kart ilerlemesi ve 35 not hesabınla birleştirilecek." İsteyene yedek alındıktan sonra "bu cihazdakini at, hesaptakini indir" seçeneği sunulur.
- **Önbelleği silinen tarayıcı** boş bir cihaz gibi bağlanır. Varsayılanları saat 0'da olduğu için hiçbir şeyi ezmez; her şeyi çeker.
- **Geri yükleme, koleksiyonu sıfırlama ve kayıpsız `.colpkg` içe aktarma artık ayrı bir mod değil.** Bu işlemler yerelde (onay ve öncesinde yedekle) yapılır, değişiklikler tetikleyicilerle yakalanır ve sıradan değişiklik olarak yayılır. Diğer cihaz, büyük bir silme dalgası gelince (100'den fazla cevap ya da 1.000'den fazla nesne) uygulamadan önce kendiliğinden yerel yedek alır ve "Hesabında geri yükleme yapıldı; bu cihazın önceki hâli yedeklendi" der.
- **Uzun süre bağlanmamış cihaz:** 180 günden uzun süre bağlanmamışsa, silinenlerin izleri sunucuda temizlenmiş olabilir. Bu durumda tam bir eşitleme yapılır, ama bu da değiştirme değil birleştirmedir: yerelde bekleyen değişiklikler korunur.

### 7.7 Webe özgü

- Senkronu yalnızca yazar sekme yapar; diğer sekmeler salt okunurdur (bugünkü Web Locks düzeni).
- Webdeki yerel kopya silinebilir: Safari 7 gün etkileşim olmazsa betiğin yazdığı depolamayı siler. Bu yüzden gönderim hemen yapılır (2–3 saniyelik birikim), sayfa gizlenince (`visibilitychange`, `pagehide`) `keepalive` ile.
- sql.js her kayıtta bütün dosyayı yeniden yazıyor. Diğer cihazdan sık değişiklik gelirken kayıt birikimi en az birkaç saniye olmalı; OPFS tabanlı SQLite'a geçiş ayrı bir iş olarak planlanmalı.
- Web oturumu HttpOnly, `Secure`, `SameSite=Lax` bir çerezle taşınmalı; `Origin` denetimi ya da CSRF belirteci de gerekir. Belirteç bugün `localStorage`'da ve bir XSS bütün veriyi açar.
- Gün sınırı bugün her cihazın kendi saat dilimiyle hesaplanıyor (`localDayNumber`). Senkronlanan bir `timeZone` ayarı eklenmeli; varsayılanı koleksiyonu oluşturan cihazın saat dilimi. Böylece başka saat dilimindeki bir tarayıcı "bugün"ü kaydırmaz.

### 7.8 iPhone'a özgü

- **Öne gelince:** Uygulama öne gelince önce kısa bir çekme yapılır (en fazla 1,5 sn), kuyruk ondan sonra kurulur. Ağ yoksa ya da süre dolarsa yerel veriyle devam edilir ve gelen değişiklik ekranı yerinde günceller.
- **Arka plana geçerken:** Bekleyen değişiklikler hemen gönderilir. iOS buna birkaç saniye tanır; yetmezse değişiklikler bir sonraki açılışta gider, çünkü `sync_dirty` kalıcıdır.
- **Uzun yoklama** yalnızca uygulama öndeyken açıktır. Arka planda sessiz bildirim kullanılmaz; ilk sürüm için gerekmiyor.

## 8. Sunucu

### 8.1 Kişi başı şema

`scripts/sync-verification/schema.mjs`:

```sql
CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);   -- usn, format
CREATE TABLE objects (
    kind INTEGER NOT NULL,
    id NOT NULL,              -- paylaşılan kimlik; katalogda paket kimliği; ayarlarda ad
    ident TEXT,               -- kimlik izi (§6.5)
    usn INTEGER NOT NULL,
    fields TEXT NOT NULL,     -- {"grup": [değer, saat, cihazNo], ...}
    UNIQUE (kind, id)
);
CREATE INDEX objects_by_usn ON objects(usn);
CREATE TABLE revlog (
    id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, ckind INTEGER NOT NULL,
    usn INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0,
    ease INTEGER NOT NULL, ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL,
    factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL
);
CREATE INDEX revlog_by_usn ON revlog(usn);
CREATE TABLE media (name TEXT PRIMARY KEY, sha256 BLOB NOT NULL, size INTEGER NOT NULL,
                    usn INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0);
```

`accounts.sqlite`'a eklenecekler:
- `devices`: kimlik, kısa numara, ad, platform, sürüm, son görülme.
- `sessions.device_id` sütunu.
- `sync_state`: `usn`, `format_version`, `collection_bytes`, `media_bytes`, `media_quota_bytes`.
- `entitlements`.

İlk tasarımdaki `epoch` alanı artık gereksiz.

### 8.2 Uç noktalar

| Yöntem ve yol | İş |
|---|---|
| `GET /v1/sync/state` | `usn`, en düşük istemci sürümü, kota, sunucu saati |
| `POST /v1/sync/push` | Değişen gruplar ve cevaplar (≤1 MB gzip). Yanıt: yeni `usn`, kazananlar, kimlik çakışmaları, sunucu saati. |
| `GET /v1/sync/pull?since=&cursor=` | `usn > since` olan nesneler ve cevaplar. Sayfa sınırı (`usn`, tür, kimlik) imleciyle, bir `usn` grubunu bölmeden. |
| `GET /v1/sync/wait?since=` | Uzun yoklama: en fazla 25 sn. Değişiklik gelince hemen döner; değişikliği gönderen cihazı uyandırmaz. |
| `POST /v1/sync/verify` | Günlük sağlama turu (§8.4) |
| `POST /v1/media/check`, `POST /v1/media/urls` | Eksik dosyaları bulur; yükleme ve indirme için imzalı URL verir |
| `GET /v1/devices`, `DELETE /v1/devices/:id` | Cihazlarım, uzaktan çıkış |
| `GET /v1/account/export` | KVKK md. 11 kapsamında dışa aktarma |
| `GET /v1/entitlements`, `POST /v1/webhooks/revenuecat` | Erişim hakları |
| `GET /v1/catalog/pack` | BKA paketi, yalnızca hakkı olan web hesabına |

### 8.3 Gönderim kuralları

- **Tek işlem.** Bir gönderim tek bir işlemde uygulanır ve tek bir `usn` alır.
- **Parçalı gönderim.** 1 MB'ı aşan gönderimler (ilk bağlanma, büyük içe aktarma, geri yükleme) parçalı bir oturumla gelir: `batch`, `part`, `final`. Parçalar sunucuda bekletilir ve `final` gelince tek işlemde görünür olur; diğer cihaz yarım bir değişiklik görmez.
- **Kazananlar.** Saati eski olduğu için kaybeden her grup için sunucu, kazanan sürümü yanıtta döner. Cihaz bunu uygular. Saat ya da gölge bir hatayla bozulsa bile cihazlar kalıcı olarak ayrışmaz; simülasyonda bu dönüş olmadan ayrışma görüldü.
- **Kimlik çakışması** reddedilir ve cihaz yeniden numaralar (§6.5).
- **Saat sınırı** (§6.1).
- **Medya adı çakışması.** Aynı ad farklı bir SHA-256 ile gelirse sunucu reddeder. Cihaz kendi dosyasını içeriğinin kısa özetini ekleyerek yeniden adlandırır, notlardaki referansları günceller (içe aktarmanın bugün yaptığı gibi) ve yeniden gönderir. Yeni eklenen dosyalar zaten `Date.now()_ad` biçiminde adlandırılıyor.
- **Medya silme** yalnızca tam bir çekmeden sonra yapılan "Medyayı Denetle" ile gönderilir. Böylece başka cihazdan gelen ama henüz görülmemiş bir notun dosyası silinmez. Sunucu silinen dosyayı 30 gün tutar.

### 8.4 Günlük sağlama turu

Cihaz günde en fazla bir kez, boşta iken her tür için iki şey gönderir:
- nesne sayısı,
- kanonik içeriklerin 64 bitlik özetlerinin toplamı.

Sonuç uyuşmazsa 256 kovaya inilir ve yalnızca farklı kovaların satırları alınır. Yerelde farklı olup yakalanmamış bir içerik (eski bir web sürümünün ya da bir hatanın izi) "şimdi" damgasıyla gönderilir. Maliyet webde günde yaklaşık 100–300 ms. Anki her senkronun sonunda sayıları karşılaştırır; bu tur onun daha ince ve onarabilen biçimidir.

### 8.5 Sunucu yedekleri

- Canlı dosya kopyalanmaz. Yedekler `VACUUM INTO` (ya da SQLite yedek API'si) ile tutarlı bir anlık görüntüden alınır.
- Son bir saatte `usn`'si değişen kullanıcılar saatlik, herkes gecelik yedeklenir. Yedekler şifrelenip tekilleştirilerek nesne deposuna yazılır. Saklama: 7 günlük, 4 haftalık ve 6 aylık kopya. Sunucu kaybında en fazla bir saatlik veri kaybolur; iPhone'lardaki tam kopya bunu da geri getirir.
- Silinen hesaplar yedeklerden en geç 30 günde silinir.

## 9. Doğrulama

### 9.1 Rastgele senkron simülasyonu

`scripts/sync-verification/sync-sim.mjs`:
- **Cihazlar ve işlemler:** Üç cihaz (iPhone ve iki tarayıcı) aynı koleksiyonda 160 işlem yapar: cevap, geri alma, bayrak, askı, deste taşıma, ayar, deste açma, adlandırma ve silme, Kronometre oturumu ekleme ve silme.
- **Bozulmalar:** İsteklerin %8'i ve yanıtların %10'u kaybolur. Cihazlar çevrimdışı kalır. Bir tarayıcının önbelleği silinebilir.
- **Senaryolar:** `none` (saatler doğru), `mixed` (tarayıcı saatleri 90 dakikaya kadar kaymış, sunucu saati ölçümü ±1 sn hatalı) ve `ids` (ek olarak kimlikler dakikaya yuvarlanır, cihazlar kimlikte çakışsın diye).
- **Son kontroller:** Her koşunun sonunda herkes sessizleşene kadar senkronlanır ve şunlar denetlenir:
  1. Bütün cihazlar ve sunucu aynı veriyi tutuyor.
  2. Hiçbir alan, dayandığı eski değere yenilmemiş (alan bazında nedensellik).
  3. Cevap kaydı, verilen cevaplardan geri alınanların çıkarılmışına eşit.
  4. Her Kronometre oturumu tam bir kez var.
  5. Deste adları tekil ve hiçbir kart silinmiş desteyi göstermiyor.

| Tasarım | Saatler doğru | Saatler kaymış | Kimlik çakışmalı |
|---|---|---|---|
| İlk tasarım, bugünkü yazma yollarıyla (`V1-code`) | 2.000 koşunun %100'ünde hata | %100 | %100 |
| İlk tasarım, kusursuz işaretlemeyle (`V1-ideal`) | %100 | %100 | %100 |
| **Bu belge (`V2`)** | **10.000 koşuda 0** | **10.000 koşuda 0** | **10.000 koşuda 0** |

İlk tasarımın (`V1-code`) stres testindeki başlıca hataları (2.000 koşu, saatler doğru):
- kayıp bayrak %92, kayıp askı %91 ve kayıp deste taşıma %85 (satır bazında karar),
- kayıp ayar %22–25 (tek blok),
- silinmiş desteyi gösteren kart %16,
- kayıp zamanlama %15,
- ayrışma %5.

Kimlik çakışmalı senaryoda bunlara ek olarak sunucu çakışan cevabı sessizce atıyor (%98) ve oturumlar kayboluyor (%12).

Bu oranlar beş kartlık, bilerek çakıştırılmış bir stres testinden geliyor ve gerçek kullanım sıklığını göstermiyor. Tek istisna şu: `V1-code`'daki işaretlenmeyen yazmalar (senkrondan sonra konan bayrak, askı ve geri alma) sıradan, tek cihazlı kullanımda da kesin kaybolur.

V2'nin 30.000 koşusunda bu yolların hepsi çalıştı:
- 25 bin kayıp istek ve 28 bin kayıp yanıt,
- 904 önbellek silinmesi,
- 44 bin deste birleştirme ve 29 bin kart onarımı,
- 2 bin nesne ile 112 bin cevabın yeniden numaralanması,
- eski kalıp elenen 424 bin alan sürümü.

**Denetimin gücü.** V2'nin mekanizmaları birer birer kapatıldı (2.000'er koşu):

| Kapatılan | Sonuç |
|---|---|
| Alan bazında karar (`row-lww`) | koşuların %100'ünde kayıp |
| Gönderimde sıra numarası (`ack-all`) | %54: ayrışma, kayıp cevap ve zamanlama |
| Onarımlar (`no-repair`) | %51: aynı adlı deste, kopuk kart |
| Kimlik denetimi (`no-ident`, kimlik çakışmalı) | %13 kayıp oturum |
| Varsayılanların saati 0 (`defaults-now`) | %0,8 kayıp ayar (yalnızca önbellek silinen koşularda) |
| HLC gözlem kuralı (`no-observe`) | %0,2; sunucu farkıyla birlikte %1,6 kayıp düzenleme |
| Kazananlar (`no-winners`) | tek başına hata yok; saat bozulunca kalıcı ayrışma |
| Sunucu farkı (`no-offset`) | tek başına hata yok (doğruluk için değil, sıralama için) |

Simülasyonun **kapsamadığı** konular, Faz 1 testlerine eklenmeli:
- §3'teki ikinci tur (19–28): etiket ve alan başına gruplar, deste `parent`/`leaf`, askı/gömme ayrımı, `filterOpts`/`filterBuild`, kart izi. Bunlar kodla gösterildi, simülasyonda sınanmadı.
- medya,
- not tipi şema değişiklikleri,
- geri yüklemenin sıradan değişiklik olarak yayılması,
- çok sekmeli web,
- gerçek uygulama kodu.

Simülasyon protokolü modeller. Asıl çıta, aynı değişmezleri iki sql.js istemcisinde gerçek `lib/` koduyla sınayan testlerdir.

### 9.2 Prototip sunucu ve yük testi

`server.mjs` ve `load.mjs`, Apple M5 üzerinde Node 24.16 ile çalıştırıldı. Her kullanıcının bir iPhone'u ve bir web sekmesi uzun yoklama tutuyor. Cevaplar Poisson dağılımıyla geliyor; diğer cihaz uyanıp çekiyor.

| Yük | İstek/sn | Push/sn (cevap/sn) | Sunucu CPU (tek çekirdek) | Bellek | Push p50 / p99 | Diğer cihazın görmesi p50 / p99 | Hata |
|---|---|---|---|---|---|---|---|
| Beklenen zirvenin yaklaşık 2 katı: 150 kullanıcı, 300 istemci | 32,5 | 8,7 (55) | %1,7 | 149 MB | 2,3 / 13 ms | 2,5 / 14 ms | 0 |
| 300 kullanıcı, 600 istemci | 268 | 89 (537) | %9,8 | 336 MB | 1,5 / 14 ms | 1,7 / 16 ms | 0 |
| 300 kullanıcı, 600 istemci | 789 | 263 (1.552) | %12,1 | 508 MB | 1,2 / 11 ms | 1,7 / 14 ms | 0 |

- "Diğer cihazın görmesi" sunucu tarafındaki süredir; buna ağ gidiş-dönüşü eklenir (mobilde 50–150 ms).
- Bellek esas olarak açık kullanıcı dosyalarının SQLite önbelleğinden geliyor. Kullanıcı dosyası başına `cache_size` 1 MB ile sınırlanmalı ve açık dosyalar en fazla 300 olmalı.
- **İlk bağlanma:** Tipik bir kullanıcının bütün verisini almak (1,09 MB gzip, 6 parça) 65 ms, yoğun bir kullanıcınınki (3,2 MB, 13 parça) 184 ms işlemci zamanı. 1.000 kişinin ilk günü toplamda iki dakikadan az işlemci zamanı demek.

### 9.3 Depolama, yeni şemayla

Ölçüm `gen.mjs` ile yapıldı. Alan bazında saat ve cihaz bilgisi depolamayı yaklaşık %3 artırıyor.

| Profil | Sunucudaki SQLite | İlk yükleme (gzip) |
|---|---|---|
| Hafif (1.500 katalog kartı, 3.000 cevap) | 0,85 MB | 0,15 MB |
| Tipik (6.000 katalog kartı, 300 not, 37.500 cevap) | 4,84 MB | 1,09 MB |
| Yoğun (9.575 katalog kartı, 2.000 not, 120.000 cevap) | 13,49 MB | 3,20 MB |

## 10. Kapasite: 1.000 kişi

**Varsayımlar** (ilk tasarımla aynı):
- Profil dağılımı: %40 hafif, %45 tipik, %15 yoğun.
- Kullanıcıların yarısı her gün aktif ve günde yaklaşık 3 saat açık istemci tutuyor.
- Medya kişi başı ortalama yaklaşık 106 MB; bu bir tahmin, 30–250 MB aralığında olabilir.

| Kalem | 1. yıl | 3. yıl (aynı kullanım sürerse) |
|---|---|---|
| Hesap veritabanı | ~5 MB | ~15 MB |
| Senkron veritabanları | ~4,5 GB (çoğu cevap kaydı; yılda ~36 milyon cevap) | ~13,5 GB |
| Medya | ~106 GB | ~320 GB (kota tavanı 1 TB) |
| Sunucu yedekleri | ~9 GB | ~27 GB |
| **Toplam** | **~120 GB** | **~360 GB** |

- **Trafik:** Günde yaklaşık 300 bin istek, ortalama 3,5/sn, en yoğun saatte yaklaşık 17/sn. Zirvede yaklaşık 260 açık bağlantı, ayda yaklaşık 40 GB dışarı giden trafik.
- **İşlemci:** Ölçülen yük testine göre beklenen zirve, bir M5 çekirdeğinin %1'inden az. Bir VPS çekirdeği 2–3 kat yavaş olsa bile %2–3.
- **Bellek:** Zirvede 150–200 MB.
- **Sonuç:** 1.000 kişi için 1 vCPU / 2 GB yeter. **2 vCPU / 4 GB / 40 GB NVMe** önerilir; scrypt patlamaları, saatlik `VACUUM INTO`, Caddy ve on kat büyüme için pay bırakır.

## 11. Barındırma ve maliyet

Fiyatlar 19 Kasım 2026'da kontrol edildi; KDV hariç.

| Kalem | Seçenek | Aylık |
|---|---|---|
| Sunucu (AB) | Hetzner CX23: 2 vCPU / 4 GB / 40 GB NVMe / 20 TB trafik. 15 Haziran 2026 zammıyla 3,99 €'dan 5,49 €'ya çıktı (IPv4 hariç); sayfada 5,99 € yazıyor. **Yeni müşteriler için yeni sunucu açma 26 Haziran 2026'dan beri kısıtlı; sayfada "şu an mevcut değil".** | ~6 € (açılabilirse) |
| Sunucu (TR) | 2 çekirdek / 4 GB / NVMe sunan Türkiye konumlu VPS'ler üçüncü taraf listelerde 200–375 TL + KDV. Konum, yedek ve çalışma süresi taahhüdü sağlayıcının kendi sayfasından doğrulanmalı. | ~200–375 TL |
| Medya ve yedek, seçenek 1 | Cloudflare R2: 0,015 $/GB-ay, ilk 10 GB ve dışarı giden trafik ücretsiz. Yazma 4,50 $, okuma 0,36 $ (milyon istek başına). İlk yıl ~106 GB medya için. | ~1,5 $ |
| Medya ve yedek, seçenek 2 | Hetzner Object Storage: 1 TB depolama ve 1 TB trafik dahil | 6,49 € |
| E-posta | SMTP servisinin ücretsiz katmanı | ~0 |
| **Toplam** | | **~8–13 € ya da TR'de benzeri** |

Medya imzalı URL arayüzünün arkasında tutulur. Türkiye'de barındırılırsa başlangıçta sunucunun ek bir diskine yazılabilir, sonra S3 uyumlu bir depoya taşınabilir. Böylece sağlayıcı değişse istemci kodu değişmez.

## 12. Güvenlik, KVKK, App Store

- **Şifreleme:** Aktarımda TLS, depoda sağlayıcının disk şifrelemesi, yedekler ayrıca şifreli. İçeriği okuyabilen bir yönetim paneli yok.
- **Uçtan uca şifreleme ilk sürümde yok.** Parola unutulunca veri kurtarılamaz olurdu.
- **Limitler:**
  - Senkron uçlarında parça başına 2 MB gövde sınırı. Hesap uçlarının bugünkü 16 KB sınırı aynı kalır.
  - Kişi başı kota ve hız sınırı.
  - Caddy 25 saniyelik yoklamayı kesmemeli.
  - İmzalı yükleme URL'si boyutu ve içerik türünü imzalar; cihaz indirdiği dosyanın SHA-256'sını denetler.
- **KVKK, yurt dışına aktarım:** 7499 sayılı Kanunla değişen 9. madde 1 Haziran 2024'ten beri yürürlükte. Yeterlilik kararı yoksa standart sözleşme imzalanır ve imzadan sonraki 5 iş günü içinde Kurum'a bildirilir; bunun için Kurum'un bildirim modülü var. Bildirim yapmamanın idari para cezası 2024 için 71.965 – 1.439.300 TL idi. Hukuk bürosu notlarına göre 2026'da yaklaşık 90 bin – 1,8 milyon TL aralığında; resmî kaynaktan doğrulanmalı.
  - **Türkiye'de barındırmak bu yükü yalnızca koleksiyon verisi için kaldırır.** RevenueCat (ABD; satın alma için bugün zaten kullanılıyor) ve yurt dışındaki bir e-posta servisi yine aktarım sayılır ve standart sözleşme gerektirir.
  - Cloudflare R2 kullanılırsa medya da yurt dışına gider.
  - Bu konu hukukçuya sorulmalı.
- **Metinler:** Aydınlatma metni ve `docs/privacy.html` güncellenmeli. Bugünkü "koleksiyon sunucuya gitmez" cümlesi değişecek.
- **App Store gizlilik etiketi:** Ad, E-posta ve Kullanıcı Kimliği'ne Kullanıcı İçeriği (fotoğraf, ses, diğer) eklenir. Amaç uygulama işlevi, veri kullanıcıya bağlı, izleme yok.
- **Silme ve dışa aktarma:** Hesap silinince canlı veri hemen, yedeklerdeki kopya en geç 30 günde silinir. "Verilerimi indir" mevcut yedek biçimiyle verilir.

## 13. Yol haritası

| Faz | İçerik | Bitti sayılması için |
|---|---|---|
| 0 | Hesap sunucusunu yayına almak: alan adı, HTTPS, SMTP (SPF/DKIM), web adresi için CORS, web oturumu için çerez, `VACUUM INTO` yedekleri | Canlı ortamda giriş ve yedekten geri dönüş denendi |
| 1a | **Ağ olmadan, cihazın içinde:** tetikleyicilerle yakalama, kalıcı HLC, gölge, kodlayıcı (alan kimlikleri, deste yolu, askı/gömme ayrımı), not tipi alanlarına kalıcı kimlik, ayar sınıflandırması, `syncIdent` ve `sync_ident`, kuyruk defterinin taşınması, saat 0'daki varsayılanlar | Her yazma yolunun yakalandığını kanıtlayan testler; `npm run quality` |
| 1b | Gönderme, çekme ve uzun yoklama; sunucu birleştirmesi, kimlik denetimi, kazananlar, saat sınırı, parçalı gönderim, sağlama turu | §9.1'deki değişmezler iki sql.js istemcisi ve gerçek `lib/` koduyla, rastgele işlem dizilerinde |
| 2 | Kesintisizlik ve arayüz: durum satırı ("Eşitlendi · 3 sn önce" ya da "12 değişiklik bekliyor"), Cihazlarım, ilk bağlanma bilgisi, büyük gelen silmeden önce yedek | iPhone + web canlı testi (`docs/IOS_RELEASE_CHECKLIST.md`) |
| 3 | Medya: imzalı URL'ler, webde ihtiyaç anında indirme, kotalar, ad çakışması | Medya çakışma ve silme testleri |
| 4 | Erişim hakları: RevenueCat webhook, BKA'nın webde hakkı olana sunucudan verilmesi | Satın alma ve iade testleri |

Zamanlama, cevap kaydı, içe aktarma ve geri yükleme AGENTS'ta veri güvenliği sınırı olarak geçiyor. Bu yüzden Faz 1a'dan önce bu yolların bugünkü davranışını sabitleyen testler yazılmalı.

## 14. Açık kararlar

1. **Sunucu yeri:** Türkiye mi, AB mi? Hetzner'de yeni sunucu açmak şu an kısıtlı (§11), KVKK ayrıntısı §12'de.
2. **Web oturumu:** HttpOnly çerez mi (önerim), `localStorage`'da belirteç mi?
3. **BKA webde:** Hakkı olana sunucudan mı verilsin (önerim)? Webde de satış yapılacak mı?
4. **Medya:** Kota 1 GB mı olsun (önerim)? Medya senkronu herkese mi açık olsun, yalnızca BKA sahiplerine mi?
5. **Başlangıç dalı:** Hesap kodu `next-step`'te; senkron işi orada mı başlasın?
6. **Ayar listesi:** §4.3'teki sınıflandırma uygun mu?
7. **Aynı adlı desteler:** Birleştirilsin mi (önerim, doğrulandı), yoksa ikincisi "(2)" ekiyle ayrı mı kalsın?

## Kaynaklar

- [Hetzner fiyat düzenlemesi](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Hetzner Cost-Optimized planları](https://www.hetzner.com/cloud/cost-optimized/)
- [Hetzner Regular Performance planları](https://www.hetzner.com/cloud/regular-performance/)
- [Hetzner Cloud fiyatları ve CX erişilebilirliği (Bitdoze, 2026)](https://www.bitdoze.com/es/hetzner-cloud-precios-2026/)
- [Hetzner Cloud incelemesi (Better Stack, 2026)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)
- [Cloudflare R2 fiyatları](https://developers.cloudflare.com/r2/pricing/)
- [KVKK standart sözleşme duyurusu](https://www.kvkk.gov.tr/Icerik/7938/Standart-Sozlesmeler-ve-Baglayici-Sirket-Kurallarina-Iliskin-Dokumanlar-Hakkinda-Kamuoyu-Duyurusu)
- [Standart sözleşme bildirim modülü](https://www.alomaliye.com/2024/10/30/kvkk-standart-sozlesme-bildirim-modulu/)
- [Standart sözleşme bildirim yükümlülüğü ve yaptırımlar (Cottgroup)](https://cottgroup.com/tr/blog/kvkk-gdpr/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari)
- [KVKK yurt dışına aktarım 2026](https://bilalalyar.av.tr/?p=75770)
- [Ekiphost TR-VPS-2 (whtop)](https://www.whtop.com/plans/ekiphost.com/156589)
- [Teklan TR VDS-2 (whtop)](https://www.whtop.com/plans/teklan.com.tr/152468)

## 15. Uygulama (23 Kasım 2026)

### 15.1 Parçalar

| Yer | İş |
|---|---|
| `lib/syncContract.ts` | Tel biçimi, hata kodları, sürüm karşılaştırması. İçe aktarım yok; sunucu ve uygulama paylaşır. |
| `lib/sync/syncDb.ts` | `sync_meta`, `sync_dirty`, `sync_shadow`, `sync_out`, `sync_parked`, `sync_merged` tabloları; TEMP tetikleyiciler; `sync_guard`. Tablolar yalnızca eşitleme açılınca kurulur. |
| `lib/sync/syncClock.ts` | Kalıcı HLC (§6.1), değer özeti (anahtarları sıralı JSON + cyrb53). |
| `lib/sync/syncCodecs*.ts` | Satır ↔ alan grupları (§6.2, §7.3): kart ve not (`syncCodecsNotes.ts`), deste, ayar grubu, not tipi (`syncCodecsDecks.ts`), cevap kaydı, Kronometre, ayarlar (`syncCodecsOther.ts`). |
| `lib/sync/syncCapture.ts` | Yakalama: işaretli satırı kodlar, gölgeyle grup grup karşılaştırır, değişen gruba damga verip `sync_out`'a yazar. |
| `lib/sync/syncApply.ts` | Gelen nesneler: grup bazında son yazan kazanır, eksik parçası olan nesne park edilir, silinmiş nesne `del` kazanmadıkça geri gelmez. |
| `lib/sync/syncRepair.ts`, `syncReid.ts` | Türetilmiş onarımlar (§6.4) ve kimlik çakışmasında yeniden numaralama (§6.5). |
| `lib/sync/syncRun.ts` | Bir tur: yakala → gönder (parçalı) → çek (imleçle) → uygula → onarımları gönder. Ağdan bağımsız. |
| `lib/sync/syncEngine.ts`, `syncApi.ts` | Uygulamadaki döngü: yazmadan 2 sn sonra, uzun yoklama uyandırınca, öne ve arkaya geçerken tur; geri çekilmeli yeniden deneme; günlük tam karşılaştırma. |
| `contexts/SyncContext.tsx`, `components/account/AccountSyncSection.tsx` | Hesabı izler; gelen değişiklikte ekranları ve iOS arama dizinini yeniler. Hesap ekranında durum satırı, Şimdi eşitle, Cihazlarım, aç/kapat. |
| `server/account/sync.ts`, `syncStore.ts` | `GET /v1/sync/state`, `POST /v1/sync/push`, `GET /v1/sync/pull`, `GET /v1/sync/wait`, `GET`/`DELETE /v1/sync/devices`. Kişi başı SQLite dosyası, `sync_devices` tablosu, kota, saat sınırı, parçalı gönderim, hesap silinince dosya da silinir. |

### 15.2 Tasarımdan farklar

- **Yakalama zamanı.** Tetikleyiciler yalnızca satırı işaretler; grupların karşılaştırılması ve damgalanması bir sonraki yakalamada (en geç birkaç saniye sonra, her uygulamadan önce) yapılır. Satırı silip aynı değerlerle yeniden yazan yollar (katalog yenileme, geri yükleme) böylece hiçbir şey göndermez.
- **İlk bağlanma damgası.** Eşitleme açılmadan önce yapılmış bir değişiklik, satırın `mod` zamanıyla damgalanır; böylece iki cihazda bağlanmadan önce yapılmış düzenlemeler gerçek sırasıyla birleşir. Katalog satırlarının ilk görüşü de paketin kendi zamanıyla damgalanır. Varsayılanlar (yerleşik not tipleri, Varsayılan deste ve ayar grubu, varsayılan ayar değerleri, dokunulmamış katalog kartı ve notu) saat 0'dadır ve hiç gönderilmez.
- **Kimlik izi** JSON'a yazılmaz, gölgede tutulur: not GUID, kart notun GUID'i, deste / ayar grubu / not tipi ilk görüldüğündeki adı (yerleşikler `b:<id>`), Kronometre oturumu başlangıcı, cevap kart + içerik özeti.
- **Not alanları** `f:<sıra>` ile anahtarlanır; not tiplerine kalıcı alan kimliği eklenmedi. Alan sırası değiştirilirken başka cihazda aynı notun alanı düzenlenirse değer yanlış alana düşebilir (seyrek).
- **Şablonlar** not tipinde tek grup (`tpls`); filtreli destenin ilerlemesi (`filterBuild`) tek grup.
- **`mergedInto`** deste silinmesinin `mi` grubu olarak taşınır; alt desteler ve kartlar bu zinciri izler.
- **Silinmiş nesne** başka cihazın düzenlemesiyle geri gelmez; yalnızca `del: false` (geri yükleme) geri getirir.
- **Saat sınırı** sonrası istemci saati, kendisinin kabul edilmiş ve başkalarından gördüğü damgaların altına inmez (aynı damganın iki değere verilmesini önler).
- **Sağlama turu (§8.4)** sunucu özeti yerine cihazda günde bir kez bütün satırların gölgeyle karşılaştırılmasıdır; tetikleyicisiz yazılmış bir değişikliği bulur, sunucu tarafı bozulmayı bulmaz.

### 15.3 Doğrulama

- `server/account/sync.test.ts`: birleştirme, kazananlar, kimlik çakışması, saat sınırı, sayfalama, parçalı gönderim, uzun yoklama, kota, HTTP.
- `lib/sync/syncTwoDevices.test.ts`: iki ayrı SQLite koleksiyonu, gerçek `lib/` koduyla (cevap, geri alma, bayrak, askı/gömme, not alanları ve etiketler, silme, deste yeniden adlandırma ve aynı adlı deste birleştirme, ayarlar, ayar grubu varsayılanı, Kronometre, saat kayması, kimlik çakışması).
- `lib/sync/syncCatalog.test.ts`: katalog içeriği sunucuya gitmez; katalogu sonradan kuran cihaz ilerlemeyi alır; katalogu kaldırmak silme yaymaz.
- `lib/sync/syncFuzz.test.ts`: §9.1'deki simülasyonun gerçek kodla sürümü. iPhone ve iki tarayıcı; %8 kayıp istek, %10 kayıp yanıt, çevrimdışılık, ±90 dk saat kayması, önbelleği silinen tarayıcı. Değişmezler: bütün cihazlar aynı veride, cevap kaydı = verilen − geri alınan, her Kronometre oturumu bir kez, deste adları tekil, kart yalnızca var olan destede ve notuyla. Sunucu `SYNC_STRICT_SERVER=1` ile aynı sürüme farklı değer gelirse hata verir. `npm test` 25 koşu çalıştırır; `SYNC_FUZZ_RUNS=8000 SYNC_FUZZ_STEPS=100` 8.000 koşuda 0 hata verdi (23 Kasım 2026). Bu tur şu açıkları buldu ve kapattı: yeniden numaralanan nesnenin aynı sayfada ezilmesi, birleştirilen destenin alt destesinin cihazlara göre farklı yere düşmesi, askıdaki kartın gömmesinin kaybolması, türetilmiş damganın saati ilerletmemesi, silinmiş nesnenin onarım yazmasıyla geri gelmesi.

### 15.4 Kalanlar

- Faz 3: medya (fotoğraf ve ses). Bu sürümde notlar eşitlenir, dosyaları eşitlenmez; diğer cihazda resim eksik görünür.
- Faz 4: BKA erişim hakkının sunucudan verilmesi; webde katalog kurulu değilse katalog ilerlemesi park edilip kurulunca uygulanır.
- Aynı kart iki cihazda çevrimdışı cevaplanınca `reps`/`lapses`/FSRS belleğinin birleşmiş cevap kaydından yeniden hesaplanması (§6.4 son satırlar) yok; zamanlama son cevaplayan cihazdan gelir, cevap kaydında iki cevap da durur.
- "Bu cihazdakini at, hesaptakini indir" seçeneği yok; ilk bağlanma her zaman birleştirir.
- Senkronlanan `timeZone` ayarı (§7.7), HttpOnly çerezli web oturumu (§14.2), sunucu yedekleri ve 180 günlük silme izi temizliği (§8.5, §6.3) yok.
- Sunucu yayında değil (Faz 0); gizlilik metni (`docs/privacy.html`) eşitlemeyi anlatacak şekilde güncellendi, ama barındırma yeri ve KVKK aktarım bildirimi (§12) hukukçuyla netleştirilmeli.
- iPhone'da (expo-sqlite) canlı deneme yapılmadı. Web'de iki ayrı koleksiyonla (aynı uygulama `localhost` ve `127.0.0.1` kökenlerinden, yani iki ayrı IndexedDB) yerel hesap sunucusuna karşı denendi: eşitlemeyi açma, düzenleyiciden eklenen notun diğer cihaza gelmesi, diğer cihazda düzenlenen alanın sayfa yenilenmeden dönmesi; bir cihazdaki yazmadan diğerinde görünmesine 2,4 sn. Bu deneme bir açık buldu ve kapattı: sql.js her IndexedDB kaydında bağlantıyı kapatıp açıyor ve TEMP tetikleyicileri siliyordu (`lib/webDb.ts` artık her dışa aktarmadan hemen sonra yeniden kurar).
