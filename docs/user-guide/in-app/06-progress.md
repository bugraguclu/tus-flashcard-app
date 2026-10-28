# Uygulama içi metinler — İlerleme (İstatistikler, Kronometre, Çalışma Takvimi)

Kapsam: `app/stats.tsx`, `components/stats/*`, `components/WeekStreakStrip.tsx`, `app/stopwatch.tsx`,
`components/stopwatch/*`, `app/study-calendar.tsx`. Hepsi iPhone'da ve web sürümünde aynıdır; farklar
satırlarda belirtilmiştir. Kenar çubuğu girişleri (`components/Sidebar.tsx:296-317`) yalnızca ≥768 px
genişlikte (geniş web penceresi) vardır; `supportsTablet: false` olduğundan iPad'de de iPhone
düzeni açılır.

Bilgi sayfaları README'deki genel `HelpSheet` kalıbını kullanır (`SwipeDismissSheet`, görünür ve
çalışan tutamaç, alt satırda **Daha fazla bilgi** → `/help?article=…&section=…`).

---

## 1. İstatistikler

### help.stats.sheet — İstatistikler hakkında (mevcut, genişletilecek)
- **Yer:** İstatistikler ekranı başlığı, sağ üstteki **Bilgi** / **Info** metin düğmesi
  (`app/stats.tsx:248-256`); sayfa `components/stats/StatsHelpSheet.tsx:11-36`.
- **Tetikleyici:** **Bilgi**'ye dokunma.
- **Bileşen:** StatsHelpSheet (bölüm başlığı + gövde listesi). Yeni: listenin en altına
  **Daha fazla bilgi** / **Learn more** bağlantısı → `help?article=statistics`.
- **Daha fazla bilgi:** `tr/12-statistics.md` (her bölüm aşağıdaki çapasına karşılık gelir)
- **Durum:** Mevcut — genişlet. Sıra aşağıdaki gibidir; "koru" yazanlar değişmez.

| # | Bölüm TR / EN | Durum | Çapa |
| --- | --- | --- | --- |
| 1 | Deste ve dönem / Deck and period | Mevcut — güncelle | `scope-and-period` |
| 2 | Bugün / Today | Yeni | `today` |
| 3 | Çalışma serisi / Study streak | Yeni | `streak` |
| 4 | Gelecek vadeler / Future Due | Mevcut — güncelle | `future-due` |
| 5 | Tekrarlar / Reviews (eski: Tekrarlar ve cevaplar) | Mevcut — güncelle | `reviews` |
| 6 | Cevap düğmeleri / Answer Buttons | Yeni | `answer-buttons` |
| 7 | Saatlik dağılım / Hourly Breakdown | Mevcut — güncelle | `hourly` |
| 8 | Tekrar aralıkları / Review Intervals (eski: Aralıklar ve kart sayıları) | Mevcut — güncelle | `intervals` |
| 9 | Kart sayıları / Card Counts | Yeni | `card-counts` |
| 10 | Eklenenler / Added | Yeni | `added` |
| 11 | Desteler / Decks | Yeni | `deck-progress` |
| 12 | Grafikleri kullanma / Using charts | Mevcut — güncelle | `chart-tips` |

**1. Deste ve dönem** — Mevcut — güncelle (eski metin: "Deste ve zaman aralığı üstten seçilir. Bugün ve çalışma serisi bu dönemden bağımsızdır." / "Choose a deck and period at the top. Today and the study streak are independent of that period.")
- TR: Deste ve zaman aralığı üstten seçilir; bir deste seçince alt desteleri de dahil olur. Bugün, çalışma serisi, kart sayıları ve deste satırları dönemden etkilenmez. Çalışma serisi her zaman tüm koleksiyonu gösterir.
- EN: Choose a deck and period at the top; a deck includes its subdecks. Today, the study streak, card counts and the deck rows do not depend on the period. The study streak always covers the whole collection.

**2. Bugün** — Yeni
- TR: Bugün verdiğiniz bütün cevaplar, Tekrar dışındaki cevapların oranı, cevaplara harcanan süre ve ilk kez gördüğünüz kartlar. Seçili desteye uyar. Her cevap en fazla deste ayarındaki cevap süresi kadar sayılır; Kronometre süresi buraya eklenmez.
- EN: All answers you gave today, the share that were not Again, the time spent on answers and the cards you saw for the first time. Follows the selected deck. Each answer counts up to the deck's maximum answer time; stopwatch time is not added here.

**3. Çalışma serisi** — Yeni
- TR: Art arda çalıştığınız gün sayısı. Kart yanıtladığınız veya Kronometre'de oturum kaydettiğiniz her gün sayılır; bugün henüz çalışmadıysanız seri dünden devam eder. Karta dokunmak Kronometre'yi açar.
- EN: How many days in a row you have studied. Every day with a card answer or a saved stopwatch session counts; if you have not studied yet today, the streak runs to yesterday. Tap the card to open the Stopwatch.

**4. Gelecek vadeler** — Mevcut — güncelle (eski metin: "Yeni kart öğrenmediğiniz ve kart unutmadığınız varsayımıyla beklenen tekrarlar. Gecikenlerle seçeneği vadesi geçmiş kartları da içerir." / "Expected reviews assuming no new cards are learned and none are forgotten. With backlog includes overdue cards.")
- TR: Yeni kart öğrenmediğiniz ve kart unutmadığınız varsayımıyla beklenen tekrarlar; seçilen dönem kadar ileriye bakar. Gecikenlerle vadesi geçmiş kartları da gösterir. Genç kartların aralığı 21 günden kısadır, olgunlarınki 21 gün veya daha uzundur. Günlük yük, her gün ortalama kaç tekrar geleceğinin tahminidir.
- EN: Expected reviews assuming no new cards are learned and none are forgotten; looks as far ahead as the selected period. With backlog also shows overdue cards. Young cards have intervals under 21 days, mature cards 21 days or more. Daily load estimates how many reviews come up per day.

**5. Tekrarlar** — Mevcut — güncelle (eski başlık "Tekrarlar ve cevaplar"; eski metin: "Tekrarlar, kart türüne göre cevap sayısını veya çalışma süresini gösterir. Doğruluk, Tekrar dışındaki cevapların oranıdır." / "Reviews shows answer counts or study time by card type. Accuracy is the share of answers other than Again.")
- TR: Her gün, hafta veya ayda verdiğiniz cevapları ya da cevaplara harcadığınız süreyi kart türüne göre gösterir. Filtreli, filtrelenmiş destelerde ve özel çalışmada verilen cevaplardır. Günlük ortalama bütün günlere, Çalışılan günlerde yalnızca çalıştığınız günlere bölünür.
- EN: Shows the answers you gave, or the time spent on them, per day, week or month by card type. Filtered means answers in filtered decks and Custom Study. Daily average divides by every day; On days studied by the days you studied only.

**6. Cevap düğmeleri** — Yeni
- TR: Her düğmeye kaç kez bastığınızı öğrenme, genç ve olgun kartlara göre gösterir. Alttaki oranlar her kart türünde Tekrar dışındaki cevapların payıdır. Son ay seçiliyken son 30 gün sayılır.
- EN: How often you pressed each button, split into learning, young and mature cards. The figures below are the share of answers that were not Again for each kind. Last Month counts the last 30 days here.

**7. Saatlik dağılım** — Mevcut — güncelle (eski metin: "Saatlere göre cevap sayısı ve doğru cevap oranı." / "Answer counts and accuracy by hour of day.")
- TR: Saate göre cevap sayısı ve Tekrar dışındaki cevapların oranı. Oran çizgisi %0'dan değil, en düşük saatin biraz altından başlar. En başarılı saat için o saatte en az 10 cevap gerekir. Filtrelenmiş destelerdeki cevaplar sayılmaz.
- EN: Answers by hour and the share that were not Again. The rate line starts just below the lowest hour, not at 0%. An hour needs at least 10 answers to be the strongest hour. Answers in filtered decks are left out.

**8. Tekrar aralıkları** — Mevcut — güncelle (eski başlık "Aralıklar ve kart sayıları"; eski metin: "İkisi de güncel kart durumunu gösterir. Seçilen dönem, tekrar aralıklarının yalnızca üst sınırını belirler; kart sayılarını değiştirmez." / "Both show current card state. The period only limits the longest review interval shown; it does not change card counts.")
- TR: Tekrar kartlarınızın şu anki aralıkları. Grafik seçilen dönemden uzun aralıkları göstermez; Ortalama aralık ve En uzun aralık ise bütün tekrar kartlarını sayar.
- EN: The current intervals of your review cards. The chart leaves out intervals longer than the period; Average interval and Longest interval count every review card.

**9. Kart sayıları** — Yeni
- TR: Kartlarınızın şu anki durumu; dönemden etkilenmez. Genç ve olgun tekrar kartları 21 günlük aralıkla ayrılır, Görülmemiş yeni kartlardır. Askıdaki ve gömülü kartlar, hangi aşamada olursa olsun, yalnızca kendi satırlarında sayılır.
- EN: Where your cards stand now; the period does not change it. Young and mature review cards are split at a 21-day interval; Unseen means new cards. Suspended and buried cards are counted only in their own rows, at whatever stage.

**10. Eklenenler** — Yeni
- TR: Seçilen dönemde oluşturulan kartlar. Kartın tarihi oluşturulduğu gündür; içe aktarılan kartlar yazarının eklediği tarihte görünür. Bir sütuna dokunmak o günlerde eklenen kartları Kartlarım'da açar.
- EN: Cards created in the period. A card's date is the day it was created; imported cards keep their author's dates. Tap a bar to open the cards added on those days in the Card Browser.

**11. Desteler** — Yeni
- TR: Her destenin yüzde kaçının en az bir kez çalışıldığını gösterir; çubuk olgun, genç, öğrenme ve yeni kartlara bölünür. Bir desteye dokunmak bütün ekranı o desteye göre gösterir.
- EN: The share of each deck's cards studied at least once; the bar splits into mature, young, learning and new cards. Tap a deck to show the whole screen for it.

**12. Grafikleri kullanma** — Mevcut — güncelle (eski metin: "…Tekrarlar ve Saatlik dağılım üzerinde yana kaydırarak değerleri gezebilirsiniz. Eklenenler sütununa dokunmak o kartları açar." / "…Slide across Reviews and Hourly Breakdown to inspect values. Tap an Added bar to open its cards.")
- TR: Ayrıntı için sütuna dokunun; kapatmak için yeniden dokunun. Tekrarlar, Saatlik dağılım ve Eklenenler üzerinde parmağınızı yana kaydırarak sütunları gezebilirsiniz. Eklenenler sütununa dokunmak o kartları açar.
- EN: Tap a bar for details and again to dismiss. Slide across Reviews, Hourly Breakdown and Added to inspect values. Tap an Added bar to open its cards.

### İstatistikler — kısa metinler

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.stats.rangeSubtitle | Zaman aralığı seçicisi, "Zaman aralığı" başlığının altı (`components/stats/StatsRangePicker.tsx:46`) | alt başlık | Bugün, çalışma serisi ve kart sayıları dönemden etkilenmez. | Today, the study streak and card counts do not depend on the period. | Yeni |
| help.stats.deckRowsHint | En alttaki "Desteler" / "Alt desteler" başlığının altı (`components/stats/DeckProgressSection.tsx:26`) | ipucu | Yüzde, en az bir kez çalışılmış kartların payıdır. Ayrıntı için desteye dokunun. | The percentage is the share of cards studied at least once. Tap a deck for its statistics. | Yeni |
| help.stats.addedHint | Eklenenler grafiğinin üstündeki başlık satırı, hiçbir sütun seçili değilken (`components/stats/AddedSection.tsx:51`; çizim `StatsBarChart.tsx:204`) | görünür ipucu | Kartları görmek için bir sütuna dokunun | Tap a bar to see its cards | Mevcut — güncelle (metin var ama hiç gösterilmiyor: StatsBarChart notu yalnızca seçili sütunda çizer) |
| help.stats.todayAnswered | Bugün kartı, ilk kutunun etiketi (`app/stats.tsx:308`) | etiket | Yanıtlanan (koru) | Answered | Mevcut — güncelle (eski metin EN: Reviews; bütün cevapları sayar, yalnızca tekrar kartlarını değil) |
| help.stats.intervalAxis | Tekrar aralıkları grafiğinin eksen etiketleri (`lib/ankiStats.ts:333`) | eksen etiketi | 5g, 0–6g (koru) | 5d, 0–6d | Mevcut — güncelle (eski metin EN: "5g", "0–6g") |
| help.stats.streakHint | Çalışma serisi kartı başlığı, VoiceOver ipucu (`app/stats.tsx:337`) | erişilebilirlik ipucu | Kronometreyi açar | Opens the stopwatch | Mevcut — koru |
| help.stats.empty.* | Grafik boş durumları (`app/stats.tsx:404, 450, 495`; `ReviewsSection.tsx:118`; `HourlySection.tsx:58`; `AddedSection.tsx:60`) | boş durum | (mevcut metinler) | (existing texts) | Mevcut — koru |
| help.stats.deckOverviewEntry | Genel bakış › **Deste istatistikleri** açıklaması (`app/deck-overview.tsx:330`) | alt satır | İlerlemeyi ve tekrar yükünü görüntüleyin | View progress and review workload | Mevcut — koru |

---

## 2. Kronometre

### help.stopwatch.sheet — Kronometre bilgi sayfası (yeni)
- **Yer:** Kronometre ekranı başlığı, sağdaki düğme grubunun ilki: **ⓘ**, zil (Hatırlatmalar)
  düğmesinin solunda. `app/stopwatch.tsx:324-341` `actions` parçasında, 326. satırdaki zil
  `HeaderIconButton`'ından önce eklenir. Sıra: ⓘ · zil · dişli. iPhone ve web.
- **Erişilebilirlik etiketi:** Kronometre hakkında / About the stopwatch
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası (HelpSheet: title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/13-stopwatch-and-calendar.md#stopwatch` (`help?article=stopwatch&section=stopwatch`)
- **Durum:** Yeni

**TR**
- Başlık: Kronometre
- Özet: Kartların dışındaki çalışmanızı da ölçer ve günlük hedefinize ekler.
- Maddeler: (1) Halkadaki Toplam Çalışma Süresi, bugün kart cevaplarına harcadığınız süre ile Kronometre oturumlarının toplamıdır. İstatistikler'deki Çalışma süresi yalnızca kart cevaplarını sayar. (2) Mola Ver ile çalışma süresi durur, mola süresi işler. Ders ve mola süreleri dolunca hatırlatılırsınız; kronometre kendiliğinden durmaz. (3) Uygulamayı kapatsanız da süre işlemeye devam eder. Bitirmeyi unuttuysanız oturumu bitirip ••• › Düzenle ile düzeltin. (4) Tür etiketi Kronometre oturumunda seçtiğiniz türü (ör. "2. Tekrar", "Soru Çözümü"), kart oturumunda o gün o dersteki kaçıncı oturum olduğunu gösterir.
- Not: Kaydedilen her oturum o günü Çalışma serisi'ne sayar. Bir dakikadan kısa çalışmalar kaydedilmez.

**EN**
- Title: Stopwatch
- Summary: Times the study you do away from the cards and adds it to your daily goal.
- Points: (1) Total Study Time on the ring adds today's time on card answers and your stopwatch sessions. Study time on Statistics counts card answers only. (2) Break stops study time and starts break time. You are reminded when a block or break is over; the stopwatch never stops by itself. (3) The time keeps running even if you close the app. If you forgot to finish, finish the session and fix it with ••• › Edit. (4) The type label is the type you chose for a stopwatch session ("Pass 2", question practice...); on card sessions, "Session N" is the Nth session of that subject that day.
- Note: Every saved session counts that day for your Study streak. Sessions shorter than a minute are not saved.

### Kronometre — kısa metinler

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.stopwatch.goalHint | Halkanın yanında, **Günlük Hedef** adımlayıcısının altı (`components/stopwatch/StopwatchHero.tsx:117-126`) | ipucu | Kart çalışmanız da bu hedefe sayılır. | Card study counts towards this goal too. | Yeni |
| help.stopwatch.startSubtitle | **Çalışmaya Başla** sayfası, **Başla** düğmesinin üstü (`components/stopwatch/StudyStartSheet.tsx`) | alt başlık | Kronometre seçtiğiniz dersle başlar; tekrar sayısı o dersin son oturumundan devam eder. | The stopwatch starts on the subject you choose and continues its latest pass. | Yeni (eski **Hangi dersi çalışacaksınız?** sayfasının alt başlığıydı; sayfa TUSBuddy düzenindeki **Çalışmaya Başla** ile değişti) |
| help.stopwatch.editorPassHint | — | — | — | — | Kaldırıldı: tekrar sayısı artık **Tür Seçin** listesinde ("1. Tekrar"–"8. Tekrar") seçilir, ayrı bir **Tekrar** satırı yok |
| help.stopwatch.alertsUndetermined | **Hatırlatmalar** sayfası, anahtarın altındaki durum satırı, iPhone'da izin henüz istenmemişken (`components/stopwatch/StopwatchAlertsSheet.tsx:55-63`) | durum satırı | Hatırlatmalar için bildirim izni gerekiyor. İzin vermek için anahtarı kapatıp yeniden açın. | Reminders need notification permission. Turn the switch off and on again to allow it. | Yeni (bkz. açık soru 2) |
| help.stopwatch.sessionDuration | Oturum kartlarındaki **Çalışma** / **Mola** süreleri (`lib/studyCalendar.ts:413-424`) | biçim | 1 sa 39 dk, 36 dk | 1h 39m (koru) | Mevcut — güncelle (eski metin TR: "1s 39dk"; "s" saniye gibi okunuyor, uygulamanın geri kalanı "sa" kullanır) |
| help.stopwatch.existing | Ayar ipuçları (`StopwatchSettingsSheet.tsx:43-45, 80, 93`), hatırlatma ipucu ve durumları (`StopwatchAlertsSheet.tsx:55-72`), plan kartları (`PlannedStudyCard.tsx`, `NoStudyPlanCard.tsx`), boş günler (`StopwatchTimeline.tsx`), blok ilerlemesi (`LiveSessionCard.tsx`), form bilgi kutusu ve hataları (`SessionEditorSheet.tsx`), onaylar ve bildirimler (`app/stopwatch.tsx`) | çeşitli | (mevcut metinler) | (existing texts) | Mevcut — koru |

---

## 3. Çalışma Takvimi

### help.calendar.sheet — Çalışma Takvimi bilgi sayfası (yeni)
- **Yer:** Çalışma Takvimi ekranı başlığı, sağda **ⓘ**, grafik simgeli **Çalışma analizleri**
  düğmesinin solunda. `app/study-calendar.tsx:327-334` `actions` içinde, 328. satırdaki
  `HeaderIconButton`'dan önce (iki düğme bir fragment içine alınır). Sıra: ⓘ · grafik. iPhone ve web.
- **Erişilebilirlik etiketi:** Çalışma Takvimi hakkında / About the study calendar
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası (HelpSheet)
- **Daha fazla bilgi:** `tr/13-stopwatch-and-calendar.md#study-calendar` (`help?article=stopwatch&section=study-calendar`)
- **Durum:** Yeni

**TR**
- Başlık: Çalışma Takvimi
- Özet: Kart çalışmalarınızı ve Kronometre oturumlarınızı gün gün gösterir.
- Maddeler: (1) Günün altındaki süre, o günkü kart ve Kronometre oturumlarının çalışma süresidir; molalar dahil değildir. (2) Kart oturumları cevaplarınızdan kendiliğinden oluşur: üst desteye ve güne göre gruplanır, iki cevap arasında 30 dakikadan fazla geçerse yeni oturum başlar. (3) Kart oturumunda Çalışma cevaplara harcanan süredir, Mola cevaplar arasındaki boş süredir. (4) Kronometre oturumlarını buradan düzenleyebilir veya silebilirsiniz. Kart oturumları cevaplardan geldiği için silinmez.
- Not: Çalışmakta olan kronometre, bitirdiğinizde takvime eklenir.

**EN**
- Title: Study Calendar
- Summary: Shows your card study and stopwatch sessions day by day.
- Points: (1) The time under each day is the study time of that day's card and stopwatch sessions; breaks are not included. (2) Card sessions are made from your answers: grouped by top-level deck and day, with a new session after more than 30 minutes between answers. (3) In a card session, Study is the time spent on answers and Break the idle time between them. (4) You can edit or delete stopwatch sessions here. Card sessions come from your answers and cannot be deleted.
- Note: A stopwatch that is still running is added to the calendar once you finish it.

### Çalışma Takvimi — kısa metinler

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.calendar.goToDeck | ••• menüsü, kart oturumunun ilk öğesi (`app/study-calendar.tsx:242`) | menü öğesi | Bu desteye git | Go to this deck | Mevcut — güncelle (eski metin: "Bu oturuma git" / "Go to this session"; öğe destenin genel bakışını açar, Kronometre'deki aynı öğe "Bu desteye git" der: `app/stopwatch.tsx:265`) |
| help.calendar.empty | Liste boşken (`app/study-calendar.tsx:313-319, 446-449`) | boş durum | (mevcut metinler) | (existing texts) | Mevcut — koru |
| help.calendar.analyticsLabel | Başlıktaki grafik düğmesi (`app/study-calendar.tsx:329`) | erişilebilirlik etiketi | Çalışma analizleri | Study analytics | Mevcut — koru |

---

## Açık sorular

1. `help.stopwatch.alertsUndetermined`: Günlük hatırlatmalar açıkken uygulama ilk açılışta iOS
   geçici (provisional) izni alır; bu durumda Kronometre bildirimleri planlanır ama sessiz teslim
   edilebilir. Hangi izin durumunda bu satırın gösterileceği cihazda doğrulanmalı.
2. `TUS dersleri` listesi (`lib/stopwatch.ts:398-414`) İngilizce arayüzde de Türkçe adlarla
  görünür; ders adı oturuma metin olarak kaydedildiği için çeviri ürün kararı gerektirir.
