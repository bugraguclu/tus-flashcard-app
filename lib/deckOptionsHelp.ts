/**
 * The "?" sheets on the Deck Options screen.
 *
 * These live outside the screen so each one can be checked against two things at once: the Anki
 * manual (https://docs.ankiweb.net/deck-options.html) and this app's own scheduler. Where the two
 * disagree, the sheet describes *this app* — a learner opens it to find out what the switch in
 * front of them does, and a help text documenting behaviour the code does not have is worse than
 * no help text at all. The two places the app knowingly differs from upstream say so in plain
 * words rather than quietly implying parity:
 *
 *   - Daily limits: upstream counts interday learning cards against the review limit
 *     ("Anki includes any learning cards that have crossed the day boundary … in the review
 *     count"). `buildStudyQueue` caps only queue 2, so this build does not.
 *   - Advanced: upstream hides the SM-2 multipliers once FSRS is on. This screen keeps them
 *     visible, and only `maxInterval` still reaches `lib/fsrsScheduler.ts`.
 *
 * Each claim is backed by the code named beside the entry. When one of those files changes, the
 * matching sentence here is what has to change with it.
 */

/** `l(turkish, english)` — the locale picker from `hooks/useI18n`. */
export type Localize = (turkish: string, english: string) => string;

export interface OptionHelp {
    title: string;
    summary: string;
    points: string[];
    note?: string;
    eyebrow: string;
    noteLabel: string;
    dismissLabel: string;
}

/** One key per `OptionCard` on the screen that carries a "?" badge. */
export type OptionHelpKey =
    | 'dailyLimits'
    | 'newCards'
    | 'lapses'
    | 'fsrs'
    | 'displayOrder'
    | 'burying'
    | 'audio'
    | 'timers'
    | 'autoAdvance'
    | 'easyDays'
    | 'advanced';

export const OPTION_HELP_KEYS: OptionHelpKey[] = [
    'dailyLimits', 'newCards', 'lapses', 'fsrs', 'displayOrder',
    'burying', 'audio', 'timers', 'autoAdvance', 'easyDays', 'advanced',
];

export function buildDeckOptionsHelp(l: Localize): Record<OptionHelpKey, OptionHelp> {
    const chrome = {
        eyebrow: l('AYAR REHBERİ', 'SETTING GUIDE'),
        noteLabel: l('NOT', 'NOTE'),
        dismissLabel: l('Anladım', 'Got it'),
    };

    return {
        // lib/studyRepository.ts `buildStudyQueue`: hierarchical caps via `deckKeysForCard` /
        // `applyHierarchicalLimit`, `limitsStartFromTop` -> `limitRoot`,
        // `newCardsIgnoreReviewLimit` -> `newCardsShareReviewLimit`.
        dailyLimits: {
            title: l('Günlük limitler nasıl uygulanır?', 'How daily limits are applied'),
            summary: l(
                'Bir çalışma gününde kuyruğa girebilecek yeni kart ve tekrar sayısının üst sınırını belirler.',
                'These set the ceiling on how many new cards and reviews can enter a single study day.',
            ),
            points: [
                l(
                    '“Ayar grubu” bu ön ayarı kullanan bütün desteler için temel değerdir. “Bu deste” kalıcı bir deste istisnası, “Yalnızca bugün” ise bir sonraki çalışma gününde kendiliğinden düşen geçici bir istisnadır.',
                    '“Preset” is the base value for every deck using this preset. “This deck” is a permanent per-deck override; “Today only” is temporary and lapses on the next study day.',
                ),
                l(
                    'Bir kart yalnızca kendi destesine değil, üstündeki bütün destelere de sayılır. Üst destenin sınırı dolduğunda alt destede kart kalmış olsa bile o gün daha fazlası gelmez.',
                    'A card counts against its own deck and every parent above it. Once a parent’s limit is full, no more cards arrive that day even if the subdeck still has some waiting.',
                ),
                l(
                    '“Yeni kartlar tekrar limitini yok saysın” kapalıyken tekrar sınırı günün tamamını kapsar: o gün alınan her tekrar, yeni kartlara kalan yeri daraltır. Açıkken yeni kartlar, tekrar sınırı dolsa da gelmeye devam eder.',
                    'With “New cards ignore review limit” off, the review cap covers the whole day: every review taken shrinks the room left for new cards. With it on, new cards keep arriving after the review cap is full.',
                ),
                l(
                    '“Limitler en üst desteden başlasın” kapalıyken doğrudan açtığınız deste zincirin başı sayılır ve üstündeki destelerin sınırları uygulanmaz.',
                    'With “Limits start from top” off, the deck you open directly becomes the top of the chain, and the limits of decks above it no longer apply.',
                ),
            ],
            note: l(
                'Limitler bekleyen kartları silmez; yalnızca bugün gösterilecek sayıyı keser. Gün sınırını aşmış öğrenme kartları bu sürümde ayrı sayılır ve tekrar limitine dahil edilmez — masaüstü Anki onları tekrar sayısına katar.',
                'Limits never delete waiting cards; they only cap what today shows. Learning cards that crossed a day boundary are counted separately in this version and are not subject to the review limit — desktop Anki does include them in the review count.',
            ),
            ...chrome,
        },

        // lib/scheduler.ts `graduatingInterval` / `easyInterval`; lib/fsrsScheduler.ts reads
        // neither, so both fields are inert while FSRS is on.
        newCards: {
            title: l('Yeni bir kart nasıl öğrenilir?', 'How a new card is learned'),
            summary: l(
                'Bu bölüm yalnızca yeni kartları ve henüz öğrenme aşamasındaki kartları etkiler.',
                'This section affects only new cards and cards still in learning.',
            ),
            points: [
                l(
                    'Öğrenme adımlarını boşlukla ayırın: “1m 10m”, İyi yanıtından sonra kartı önce 1, sonra 10 dakika içinde geri getirir. Birimler: s, m, h, d.',
                    'Learning steps are space-separated: “1m 10m” brings the card back after 1 minute, then 10 minutes, on Good. Units: s, m, h, d.',
                ),
                l(
                    'Tekrar kartı ilk adıma döndürür. Son adımda İyi kartı mezun eder ve mezuniyet aralığını verir; Kolay kalan adımları atlayarak kartı doğrudan kolay aralığıyla mezun eder.',
                    'Again returns the card to the first step. Good on the final step graduates it with the graduating interval; Easy skips the remaining steps and graduates it with the easy interval.',
                ),
                l(
                    'Ekleniş sırası kartların konum numarasını belirler — sıralı ya da rastgele. Günün çalışma sırasını değiştirmek için “Görüntüleme sırası” bölümünü kullanın.',
                    'Insertion order assigns each card’s position number, sequential or random. Use Display Order to change the order the day is studied in.',
                ),
            ],
            note: l(
                'FSRS açıkken mezuniyet aralığı ve kolay aralığı kullanılmaz; ilk tekrar aralığını FSRS kendisi hesaplar. Öğrenme adımları her iki zamanlayıcıda da geçerlidir.',
                'While FSRS is on, the graduating and easy intervals are not used — FSRS derives the first review interval itself. Learning steps apply under both schedulers.',
            ),
            ...chrome,
        },

        // lib/scheduler.ts lapse handling; the empty-steps and minimum-interval wording follows
        // the manual's Relearning Steps section.
        lapses: {
            title: l('Unutulan kartlara ne olur?', 'What happens to a forgotten card'),
            summary: l(
                'Bir tekrar kartında Tekrar’a basmak “unutma” sayılır ve bu bölüm devreye girer.',
                'Pressing Again on a review card counts as a lapse, and this section takes over.',
            ),
            points: [
                l(
                    'Yeniden öğrenme adımları öğrenme adımlarıyla aynı biçimdedir ve unutulan kartı kısa gecikmelerle geri getirir. Alan boş bırakılırsa kart yeniden öğrenmeye hiç girmez, doğrudan yeni bir aralık alır.',
                    'Relearning steps use the same format as learning steps and bring the forgotten card back at short delays. Left empty, the card skips relearning entirely and goes straight to a new interval.',
                ),
                l(
                    'En az aralık, yeniden öğrenme bittikten sonra verilebilecek en kısa gün aralığıdır. Varsayılanı 1 gündür.',
                    'Minimum interval is the shortest day-scale delay allowed once relearning finishes. The default is 1 day.',
                ),
                l(
                    'Eşik kadar unutulan kart “leech” etiketini alır. “Etiketle ve askıya al” seçiliyse kart aynı anda askıya alınıp kuyruktan çıkar; “Yalnızca etiketle” kartı çalışmada bırakır.',
                    'A card that reaches the threshold gets the “leech” tag. With “Tag and Suspend” it is suspended and leaves the queue at the same time; “Tag Only” leaves it in study.',
                ),
                l(
                    'Sürekli unutulan bir kartı daha sık göstermek nadiren işe yarar; Anki’nin kendi önerisi kartı bölmek ya da yeniden yazmaktır.',
                    'Showing a repeatedly forgotten card more often rarely helps; Anki’s own advice is to split or rewrite it.',
                ),
            ],
            note: l(
                'Yeniden öğrenme adımları ve leech ayarları her iki zamanlayıcıda da geçerlidir. En az aralık ise yalnızca SM-2 içindir: FSRS açıkken unutma sonrası aralığı FSRS kendi hesaplar ve bu alanı okumaz.',
                'Relearning steps and the leech settings apply under both schedulers. Minimum interval is SM-2 only: while FSRS is on, it derives the post-lapse interval itself and does not read this field.',
            ),
            ...chrome,
        },

        // lib/fsrs.ts, lib/fsrsScheduler.ts, lib/fsrsOptimizer.ts (`improved = after.logLoss <
        // before.logLoss`), lib/fsrsMaintenance.ts `rebuildFsrsMemoryStates`, and the
        // `fsrsInputsChanged` guard in app/deck-options.tsx.
        fsrs: {
            title: l('FSRS nasıl çalışır?', 'How FSRS works'),
            summary: l(
                'FSRS her kart için hafıza gücünü (stability) ve zorluğunu izler; aralığı bu iki sayıdan hesaplar, SM-2’nin kolaylık çarpanını kullanmaz.',
                'FSRS tracks each card’s memory strength (stability) and difficulty, and derives the interval from those two numbers instead of SM-2’s ease multiplier.',
            ),
            points: [
                l(
                    'Stability, hatırlama olasılığının %90’a düştüğü gün sayısıdır. Hedeflenen hatırlama oranı 0,90 iken bir sonraki aralık tam olarak stability kadar olur.',
                    'Stability is the number of days until recall probability falls to 90%. At a desired retention of 0.90, the next interval is exactly the stability.',
                ),
                l(
                    'Hedeflenen hatırlama oranı (0,70–0,99) iş yükünü doğrudan belirler: 0,90 yerine 0,97 seçmek günlük tekrar sayısını katlayabilir.',
                    'Desired retention (0.70–0.99) drives the workload directly: choosing 0.97 instead of 0.90 can multiply your daily reviews.',
                ),
                l(
                    'Öğrenme ve yeniden öğrenme adımları aynen çalışmaya devam eder; FSRS yalnızca gün ölçeğindeki aralıkları belirler.',
                    'Learning and relearning steps keep working unchanged; FSRS only decides the day-scale intervals.',
                ),
                l(
                    '“Parametreleri optimize et” 21 parametreyi kendi tekrar geçmişinizden yeniden hesaplar ve sonucu yalnızca mevcut parametrelerden daha iyi tahmin ediyorsa alana yazar.',
                    '“Optimize parameters” refits the 21 parameters from your own review history, and writes the result only when it predicts better than the parameters you already have.',
                ),
                l(
                    '“Geçmiş hatırlama oranı” tekrar kaydı olmayan eski kartların hafıza durumunu tahmin etmekte kullanılır. “Şu tarihten önceki tekrarları yok say” ise güvenmediğiniz eski geçmişi hesabın dışında bırakır.',
                    '“Historical retention” estimates the memory state of older cards with no review log. “Ignore reviews before” leaves history you do not trust out of the calculation.',
                ),
            ],
            note: l(
                'FSRS açıldığında — ve parametreler, hedeflenen ya da geçmiş hatırlama oranı veya yok sayma tarihi değiştiğinde — kartların hafıza durumu tekrar geçmişinden yeniden hesaplanır. Mevcut vade tarihlerinin de yeniden yazılması için “Değişiklikte kartları yeniden zamanla” açık olmalıdır.',
                'Switching FSRS on — and changing the parameters, the desired or historical retention, or the ignore-before date — recomputes memory states from the review log. Existing due dates are only rewritten as well when “Reschedule cards on change” is on.',
            ),
            ...chrome,
        },

        // lib/studyRepository.ts `newRowOrderSql` / `applyNewCardOrder` / `mixInterdayLearning`,
        // and lib/queueSortOrders.ts.
        displayOrder: {
            title: l('Toplama ile sıralama arasındaki fark', 'Gathering versus sorting'),
            summary: l(
                'Toplama bugün hangi kartların alınacağını, sıralama ise alınan kartların hangi sırayla gösterileceğini belirler.',
                'Gathering chooses which cards enter today; sorting decides the order the gathered cards are shown in.',
            ),
            points: [
                l(
                    'Yeni kart toplama sırası, bugünkü yeni kart havuzunu deste, konum, rastgele not veya rastgele kart yaklaşımıyla kurar. Yeni kart sıralaması ise o havuzun içindeki sırayı belirler.',
                    'New-card gather order builds today’s pool by deck, position, random note, or random card. New-card sort order then decides the order inside that pool.',
                ),
                l(
                    'Yeni / tekrar sırası yeni kartların tekrarlarla karışmasını ya da onlardan önce veya sonra gelmesini belirler. Gün aşan öğrenme / tekrar sırası aynı kararı, gün sınırını aşmış öğrenme kartları için verir.',
                    'New/review order mixes new cards with reviews or places them before or after. Interday learning/review order makes the same decision for learning cards that crossed a day boundary.',
                ),
                l(
                    'Tekrar sıralaması yalnızca zamanı gelmiş kartlar arasındaki önceliği değiştirir; vade tarihlerine ya da aralıklara dokunmaz.',
                    'Review sort order only changes priority among cards that are already due; it does not touch due dates or intervals.',
                ),
            ],
            note: l(
                'Üst deste çalışılırken görüntüleme sırası, seçtiğiniz üst destenin ayar grubundan okunur; alt destelerin kendi görüntüleme ayarları kullanılmaz.',
                'When you study a parent deck, display order is read from that parent’s preset; the subdecks’ own display settings are not used.',
            ),
            ...chrome,
        },

        // lib/studyRepository.ts `applySiblingBuryPolicy` and `buryBuildTimeSiblings`; the queue
        // priority matches the manual's "intraday learning → interday learning → review → new".
        burying: {
            title: l('Kardeş kartları gömme', 'Burying sibling cards'),
            summary: l(
                'Aynı nottan üretilen kartlar kardeştir: ön→arka ile arka→ön, ya da aynı metnin komşu cloze kartları.',
                'Cards generated from the same note are siblings: front→back and back→front, or adjacent cloze cards from the same text.',
            ),
            points: [
                l(
                    'Bir kardeş gösterildiğinde, açık olan türlerdeki diğer kardeşler bir sonraki çalışma gününe kadar gizlenir. Üç anahtar birbirinden bağımsızdır.',
                    'Once one sibling is shown, siblings of the enabled types are hidden until the next study day. The three switches are independent of each other.',
                ),
                l(
                    'Kuyruk önceliği gün içi öğrenme, gün aşan öğrenme, tekrar, yeni kart sırasındadır; bu listede önce gelen kart gösterilir, diğerleri gömülür.',
                    'Queue priority runs intraday learning, interday learning, review, then new; the card that comes first in that list is the one shown, and the others are buried.',
                ),
                l(
                    'Amaç, aynı oturumdaki bir kartın başka bir kardeşin cevabını ele vermesini önlemektir.',
                    'The point is to stop one card in a session from giving away the answer to a sibling.',
                ),
            ],
            note: l(
                'Gömme askıya alma değildir: kartlar ertesi gün kendiliğinden geri gelir ve çalışma geçmişleri değişmez.',
                'Burying is not suspending: the cards come back on their own the next day, and their review history is unchanged.',
            ),
            ...chrome,
        },

        // components/CardWebView.tsx audio bootstrap (`defRate`, `element.playbackRate`) and the
        // per-deck resolution in app/(tabs)/index.tsx.
        audio: {
            title: l('Kart sesi', 'Card audio'),
            summary: l(
                'Bu seçenekler kart yüzü açılırken sesin kendiliğinden başlamasını ve elle yeniden oynatmayı ayrı ayrı yönetir.',
                'These options separately control whether audio starts by itself when a side opens, and how manual replay behaves.',
            ),
            points: [
                l(
                    '“Sesi otomatik oynat” açıkken görünen yüzdeki ses, o yüz açılır açılmaz başlar. Kapalıyken ses yalnızca karttaki oynatma denetimiyle başlatılır.',
                    'With “Automatically play audio” on, audio on the visible side starts as soon as that side appears. With it off, audio starts only from the card’s own play control.',
                ),
                l(
                    'Ses oynatma hızı karttaki bütün ses öğelerine uygulanır (0,75x–2,0x) ve önce bu ön ayardan, orada yoksa uygulama ayarlarından okunur.',
                    'Audio playback speed applies to every audio element on the card (0.75x–2.0x); it is read from this preset first, and from the app settings when the preset does not set one.',
                ),
                l(
                    '“Cevabı yeniden oynatırken soruyu atla” açıkken, cevap tarafında yeniden oynat dediğinizde soru yüzünün sesleri baştan çalınmaz.',
                    'With “Skip question when replaying answer” on, replaying on the answer side does not play the question side’s audio again.',
                ),
            ],
            note: l(
                'Soruyu atlama yalnızca elle yeniden oynatmayı etkiler; otomatik oynatma davranışını değiştirmez.',
                'Skipping the question affects manual replay only; it does not change autoplay behaviour.',
            ),
            ...chrome,
        },

        // lib/reviewerTimers.ts `answerTimerSeconds`, lib/reviewLogger.ts `timeCapMs`, and the
        // `timerFrozen` / `ActiveElapsedTimer` pair in app/(tabs)/index.tsx.
        timers: {
            title: l('Cevap zamanlayıcısı', 'The answer timer'),
            summary: l(
                'Zamanlayıcı yalnızca süre ölçer: kartın notunu da, alacağı aralığı da değiştirmez.',
                'The timer only measures time. It changes neither the card’s grade nor the interval it will get.',
            ),
            points: [
                l(
                    'En fazla cevap süresi, tek bir incelemenin istatistiklere yazılabilecek üst sınırıdır. Kartı daha uzun açık bırakırsanız kayda bu değer geçer.',
                    'Maximum answer time is the ceiling a single review can write to your statistics. Leave a card open longer and this value is what gets recorded.',
                ),
                l(
                    'Ekran zamanlayıcısı aynı sayacı gösterir ve bu üst sınıra ulaştığında durur.',
                    'The on-screen timer shows that same count, and stops when it reaches the ceiling.',
                ),
                l(
                    '“Cevap gösterilince durdur” yalnızca ekrandaki sayıyı dondurur; kayda geçen süre siz not verene kadar işlemeye devam eder.',
                    '“Stop on answer” freezes only the number on screen; the time being recorded keeps running until you press a grade button.',
                ),
            ],
            note: l(
                'Sayaç yalnızca uygulama önplandayken işler. Telefonu kilitleyip sonra döndüğünüzde aradan geçen süre kaydedilmez.',
                'The counter only runs while the app is in the foreground. Time that passes while your phone is locked is not recorded.',
            ),
            ...chrome,
        },

        // app/(tabs)/index.tsx auto-advance effect (`settings.autoAdvance` gate,
        // `shouldRunAutoAdvance`, whiteboard/background pause) and app/settings.tsx:
        // the master switch lives in Settings, not on the study screen.
        autoAdvance: {
            title: l('Otomatik ilerleme nasıl çalışır?', 'How Auto Advance works'),
            summary: l(
                'Belirlediğiniz süre dolduğunda otomatik ilerleme cevabı açabilir ve ardından seçtiğiniz işlemi uygulayabilir.',
                'When the time you set runs out, Auto Advance can reveal the answer and then carry out the action you chose.',
            ),
            points: [
                l(
                    'Bir süreyi 0 yapmak o aşamayı kapatır. Soru süresi dolunca cevap açılabilir ya da yalnızca bir süre uyarısı gösterilebilir.',
                    'Setting a time to 0 disables that stage. When the question time runs out, the answer can be revealed, or only a time reminder shown.',
                ),
                l(
                    'Cevap süresi dolunca kart gömülebilir, Tekrar / Zor / İyi ile yanıtlanabilir ya da yalnızca uyarı gösterilebilir.',
                    'When the answer time runs out, the card can be buried, graded Again / Hard / Good, or only show a reminder.',
                ),
                l(
                    '“Sesin bitmesini bekle” açıkken işlem, o yüzdeki ses bitmeden uygulanmaz. Ses geri sayımdan uzun sürerse işlem, ikinci bir geri sayım beklenmeden sesin bittiği anda uygulanır.',
                    'With “Wait for audio” on, the action holds until audio on that side finishes. If the audio outlasts the countdown, the action runs the moment it ends rather than waiting out a second countdown.',
                ),
                l(
                    'Uygulama arka plana alındığında veya yazı tahtası açıkken geri sayım duraklar; sıfırlanmaz, kaldığı yerden devam eder.',
                    'The countdown pauses while the app is in the background or the whiteboard is open. It is paused, not reset, and resumes where it stopped.',
                ),
            ],
            note: l(
                'Süreleri bu ön ayar belirler, ancak özelliğin çalışması için Ayarlar’daki “Otomatik ilerleme” anahtarının açık olması gerekir. Otomatik verilen notlar normal tekrar kaydı oluşturur.',
                'The preset owns the timings, but the feature only runs while the “Auto advance” switch in Settings is on. Automatic grades create ordinary review-log entries.',
            ),
            ...chrome,
        },

        // lib/studyRepository.ts `adjustIntervalForEasyDays` and lib/schedulingIntervals.ts
        // `fuzzRangeForInterval` (no window below 2.5 days).
        easyDays: {
            title: l('Kolay günler neyi değiştirir?', 'What Easy Days change'),
            summary: l(
                'Yeni bir aralık hesaplanırken vade günü, seçtiğiniz günlerden kaçınmak için birkaç gün kaydırılabilir.',
                'When a new interval is calculated, its due day can be nudged a few days to avoid the weekdays you picked.',
            ),
            points: [
                l(
                    'Güne dokunarak Normal → Azaltılmış → Yok arasında geçersiniz. Normal o günü hiç değiştirmez, Azaltılmış o güne düşen kartların yaklaşık yarısını kaydırır, Yok ise kaydırılabilen kartların tamamını kaydırır.',
                    'Tap a day to cycle Normal → Reduced → None. Normal leaves the day alone, Reduced moves about half of the cards landing on it, and None moves every card that can be moved.',
                ),
                l(
                    'Kaydırma kartın kendi bulanıklık penceresiyle sınırlıdır: zamanlayıcının zaten birbirinin yerine sayabileceği gün aralığı. Pencerede uygun gün yoksa aralık olduğu gibi bırakılır.',
                    'The shift is bounded by the card’s own fuzz window — the band of days the scheduler already treats as interchangeable. When no allowed day falls inside it, the interval is left as it was.',
                ),
                l(
                    'Yaklaşık 2,5 günden kısa aralıkların bulanıklık penceresi yoktur, bu yüzden hiç kaydırılmazlar. Kapattığınız bir günde yine de kart görmenizin olağan sebebi budur.',
                    'Intervals shorter than about 2.5 days have no fuzz window, so they are never moved. That is the usual reason a day you switched off still shows cards.',
                ),
            ],
            note: l(
                'Değişiklik yalnızca bundan sonra hesaplanan aralıklara uygulanır; mevcut vade tarihleri toplu olarak taşınmaz. Bütün günleri birlikte kısmak toplam yükü azaltmaz, yalnızca dağılımı değiştirir.',
                'The change applies only to intervals calculated from now on; existing due dates are not moved in bulk. Reducing every day together does not lower the total workload, it only redistributes it.',
            ),
            ...chrome,
        },

        // lib/scheduler.ts uses all of these. lib/fsrsScheduler.ts reads only `settings.maxInterval`
        // (line 122) plus `startingEase`, and that one only to keep the legacy ease field moving —
        // it never reaches an interval.
        advanced: {
            title: l('Gelişmiş aralık ayarları', 'Advanced interval settings'),
            summary: l(
                'Bu değerler SM-2 zamanlayıcısının tekrar aralıklarını doğrudan belirler.',
                'These values directly determine review intervals under the SM-2 scheduler.',
            ),
            points: [
                l(
                    'Başlangıç kolaylığı, kart mezun olduğunda aldığı çarpandır; varsayılanı 2,50’dir. Kolay bonusu Kolay yanıtının, zor aralık çarpanı Zor yanıtının aralığını ölçekler.',
                    'Starting ease is the multiplier a card receives when it graduates; the default is 2.50. Easy bonus scales the interval an Easy answer gives, and the hard interval multiplier the one Hard gives.',
                ),
                l(
                    'Aralık düzenleyici bütün tekrar aralıklarına ek bir çarpan uygular. En fazla aralık ise hesaplanan aralığın kırpıldığı üst sınırdır.',
                    'Interval modifier applies an extra multiplier to every review interval. Maximum interval is the ceiling a calculated interval is clipped to.',
                ),
                l(
                    'Unutma sonrası yeni aralık (%), Tekrar yanıtından sonra eski aralığın ne kadarının korunacağını belirler. 0 kartı en az aralığa döndürür.',
                    'New interval (%) after a lapse decides how much of the old interval survives an Again answer. 0 returns the card to the minimum interval.',
                ),
            ],
            note: l(
                'FSRS açıkken bu bölümden yalnızca “En fazla aralık” çalışmaya devam eder; başlangıç kolaylığı, kolay bonusu, zor çarpanı, aralık düzenleyici ve unutma sonrası yeni aralık kullanılmaz. Masaüstü Anki bu alanları FSRS açıkken gizler, burada görünür kalırlar.',
                'While FSRS is on, only “Maximum interval” from this section still applies; starting ease, easy bonus, the hard multiplier, the interval modifier and the post-lapse new interval are unused. Desktop Anki hides these fields when FSRS is on; here they stay visible.',
            ),
            ...chrome,
        },
    };
}
