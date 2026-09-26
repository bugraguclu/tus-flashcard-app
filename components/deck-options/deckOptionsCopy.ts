import type { useI18n } from '../../hooks/useI18n';
import type { DeckOptionsWarningId } from '../../lib/deckOptionsRules';
import type { OptionHelp } from './types';

type Localize = ReturnType<typeof useI18n>['l'];

/** Anki's warning lines, in this app's two languages. */
export function deckOptionsWarningText(id: DeckOptionsWarningId, l: Localize): string {
    switch (id) {
        case 'reviewsTooLow':
            return l(
                'Tekrar limiti yeni kart limitine göre düşük. Dengeli bir yük için tekrar limitini günlük yeni kart sayısının yaklaşık 10 katı tutun.',
                'The review limit is low for this many new cards. For a balanced workload keep it around ten times the daily new-card count.',
            );
        case 'learningStepsAboveGraduating':
            return l(
                'Son öğrenme adımı mezuniyet aralığından uzun; kart mezun olunca daha erken geri gelir.',
                'Your final learning step is longer than the graduating interval, so the card comes back sooner once it graduates.',
            );
        case 'learningStepsTooLargeForFsrs':
        case 'relearningStepsTooLargeForFsrs':
            return l(
                'FSRS açıkken bir gün veya daha uzun adımlar önerilmez: aralığı seçmek FSRS’in işidir.',
                'Steps of a day or more are not recommended with FSRS; choosing the interval is its job.',
            );
        case 'goodAboveEasy':
            return l(
                'Kolay aralığı mezuniyet aralığından kısa; Kolay yanıtı kartı İyi’den daha erken geri getirir.',
                'The Easy interval is shorter than the graduating interval, so Easy brings the card back sooner than Good.',
            );
        case 'insertionOrderRandom':
            return l(
                'Rastgele ekleme kartların konum numaralarını karıştırır. Günlük çalışma sırası yine Görüntüleme sırasından gelir.',
                'Random insertion shuffles the position numbers of new cards. The daily study order still comes from Display Order.',
            );
        case 'relearningStepsAboveMinimum':
            return l(
                'Son yeniden öğrenme adımı en az aralıktan uzun; en az aralık bu kartlar için bir şey değiştirmez.',
                'Your final relearning step is longer than the minimum interval, so the minimum changes nothing for those cards.',
            );
        case 'maximumIntervalTooShort':
            return l(
                'En fazla aralık kısa: iyi hatırlanan kartlar bile sık sık geri gelir ve tekrar yükü artar.',
                'A short maximum interval brings well-remembered cards back often, which raises your daily reviews.',
            );
        case 'maximumAnswerSecsAboveRecommended':
            return l(
                'On dakikanın üzerindeki süreler istatistiklere olduğu gibi yazılır; verilen bir mola çalışma süresi gibi görünür.',
                'Times above ten minutes are recorded as they are, so a break gets logged as study time.',
            );
        case 'desiredRetentionTooLow':
            return l(
                'Düşük hedef daha az tekrar, ama belirgin biçimde daha çok unutma demektir.',
                'A low target means fewer reviews, and noticeably more forgetting.',
            );
        case 'desiredRetentionTooHigh':
            return l(
                'Yüksek hedef günlük tekrar sayısını hızla artırır; 0,90 çoğu deste için yeterlidir.',
                'A high target raises your daily reviews quickly; 0.90 is enough for most decks.',
            );
        case 'easyDaysNoNormalDays':
            return l(
                'En az bir gün Normal kalmalı, yoksa tekrarların kaydırılabileceği gün kalmaz.',
                'Keep at least one day Normal, or there is nowhere left to move reviews to.',
            );
        case 'easyDaysNotRescheduled':
            return l(
                'Bu değişiklik yalnızca bundan sonra hesaplanan aralıkları etkiler; mevcut vadeler yerinde kalır.',
                'This change only affects intervals calculated from now on; existing due dates stay where they are.',
            );
        case 'fsrsParamsStale':
            return l(
                'Parametreler bir aydan uzun süredir optimize edilmedi; yeniden optimize etmek iyi olur.',
                'These parameters were last optimized over a month ago; running the optimizer again is worthwhile.',
            );
    }
}

/** The guide behind each option card's "?" button, in this app's two languages. */
export function buildOptionHelp(l: Localize) {
    const helpChrome = {
        eyebrow: l('AYAR REHBERİ', 'SETTING GUIDE'),
        noteLabel: l('NOT', 'NOTE'),
        dismissLabel: l('Anladım', 'Got it'),
    };
    return {
        fsrs: {
            title: l('FSRS nasıl çalışır?', 'How FSRS works'),
            summary: l(
                'FSRS, her kart için hafıza gücünü (stability) ve zorluğunu takip eder ve aralığı bu iki sayıdan hesaplar; klasik zamanlayıcının kolaylık çarpanını kullanmaz.',
                'FSRS tracks each card’s memory strength (stability) and difficulty, and derives the interval from those two numbers instead of the classic scheduler’s ease multiplier.',
            ),
            points: [
                l('Stability, hatırlama olasılığının %90’a düştüğü gün sayısıdır. Hedeflenen hatırlama oranı 0,90 iken bir sonraki aralık tam olarak stability kadar olur.', 'Stability is the number of days until recall probability falls to 90%. At a desired retention of 0.90 the next interval is exactly the stability.'),
                l('Öğrenme ve yeniden öğrenme adımları aynen korunur; FSRS yalnızca gün ölçeğindeki aralıkları belirler.', 'Learning and relearning steps are unchanged; FSRS only decides the day-scale intervals.'),
                l('Hedeflenen hatırlama oranını yükseltmek tekrar yükünü hızla artırır: 0,90 yerine 0,97 seçmek günlük tekrar sayısını katlayabilir.', 'Raising the desired retention increases the workload quickly: 0.97 instead of 0.90 can multiply your daily reviews.'),
                l('“Optimize et”, parametreleri kendi tekrar geçmişinizden yeniden hesaplar ve yalnızca daha iyi tahmin ediyorsa yazar.', '“Optimize” refits the parameters from your own review history and only writes them when they predict better.'),
            ],
            note: l(
                'FSRS açıldığında mevcut kartların hafıza durumu tekrar geçmişinden yeniden hesaplanır. Geçmişi olmayan kartlar için aralık ve kolaylık çarpanından tahmin edilir.',
                'Switching FSRS on recomputes memory states from the review log. Cards with no usable history are estimated from their interval and ease factor.',
            ),
            ...helpChrome,
        },
        dailyLimits: {
            title: l('Günlük limitler nasıl uygulanır?', 'How daily limits are applied'),
            summary: l(
                'Bu bölüm, bir çalışma gününde kuyruğa alınabilecek yeni ve tekrar kartlarının üst sınırını belirler.',
                'This section sets the maximum number of new and review cards that can enter a study day.',
            ),
            points: [
                l('Ayar grubu, tüm bağlı destelerin temel değeridir. “Bu deste” kalıcı bir deste istisnası, “Yalnızca bugün” ise bir sonraki çalışma gününde sıfırlanan geçici istisnadır.', 'The preset is the base value for every linked deck. “This deck” is a permanent deck override; “Today only” resets on the next study day.'),
                l('“Yeni kartlar tekrar limitini yok saysın” kapalıyken tekrar sınırı günün toplam yükünü de sınırlar. Açıkken yeni kartlar, tekrar sınırı dolsa bile gösterilebilir.', 'When “New cards ignore review limit” is off, the review cap also limits the day’s total workload. When on, new cards can still appear after the review cap is reached.'),
                l('“Limitler en üst desteden başlasın” açıkken bir alt desteyi doğrudan çalışsanız bile üst destelerin sınırları uygulanır.', 'When “Limits start from top” is on, parent-deck limits still apply when you study a subdeck directly.'),
            ],
            note: l('Gün sınırını aşmış öğrenme kartları tekrar limitine dahildir. Limitler bekleyen kartları silmez; yalnızca bugün gösterilecek miktarı sınırlar.', 'Interday learning cards count toward the review limit. Limits do not delete waiting cards; they only cap what is shown today.'),
            ...helpChrome,
        },
        newCards: {
            title: l('Yeni kartların öğrenme akışı', 'New-card learning flow'),
            summary: l('Bu seçenekler yalnızca yeni ve öğrenme aşamasındaki kartları etkiler.', 'These options affect only new cards and cards still in learning.'),
            points: [
                l('Adımları boşlukla yazın: “1m 10m”, İyi yanıtından sonra kartı önce 1, sonra 10 dakika içinde yeniden gösterir. s, m, h ve d birimleri desteklenir.', 'Enter space-separated steps: “1m 10m” shows the card after 1 minute, then 10 minutes after Good. s, m, h, and d units are supported.'),
                l('Tekrar ilk adıma döndürür. Son adımda İyi kartı mezun eder; Kolay ise kalan adımları atlayarak kolay aralığını kullanır.', 'Again returns to the first step. Good on the final step graduates the card; Easy skips the remaining steps and uses the Easy interval.'),
                l('Ekleniş sırası kartların konum numaralarını belirler. Günlük çalışma sırasını değiştirmek için “Görüntüleme Sırası” bölümünü kullanın.', 'Insertion order assigns card position numbers. Use Display Order to control the daily study sequence.'),
            ],
            note: l('Bu değişiklikler daha önce oluşturulmuş öğrenme gecikmelerini geriye dönük değiştirmez.', 'These changes do not retroactively alter learning delays that were already scheduled.'),
            ...helpChrome,
        },
        lapses: {
            title: l('Unutulan kartlara ne olur?', 'What happens to forgotten cards'),
            summary: l('Bir tekrar kartında Tekrar’a basılması “unutma” sayılır ve bu bölüm devreye girer.', 'Pressing Again on a review card counts as a lapse and activates this section.'),
            points: [
                l('Yeniden öğrenme adımları, unutulan kartın kısa aralıklarla tekrar edilmesini sağlar. Alanı boş bırakırsanız kart yeniden öğrenmeye girmeden doğrudan yeni aralık alır.', 'Relearning steps repeat the forgotten card at short delays. Leave the field empty to assign a new interval without entering relearning.'),
                l('En az aralık, yeniden öğrenme tamamlandıktan sonra verilebilecek en kısa gün aralığıdır.', 'Minimum interval is the shortest day-based delay allowed after relearning finishes.'),
                l('Eşiğe ulaşan karta “leech” etiketi eklenir. İsterseniz kart aynı anda askıya alınarak çalışma kuyruğundan çıkarılır.', 'A card reaching the threshold receives the “leech” tag. It can also be suspended and removed from the study queue.'),
            ],
            note: l('Sürekli unutulan kartları yalnızca daha sık göstermek yerine sadeleştirmek veya yeniden yazmak genellikle daha etkilidir.', 'Rewriting or simplifying a repeatedly forgotten card is often more effective than merely showing it more often.'),
            ...helpChrome,
        },
        displayOrder: {
            title: l('Toplama ve sıralama farkı', 'Gathering versus sorting'),
            summary: l('Toplama “hangi kartların”, sıralama ise toplanan kartların “hangi sırayla” gösterileceğini belirler.', 'Gathering chooses which cards enter today; sorting decides the order of the cards already gathered.'),
            points: [
                l('Yeni kart toplama sırası deste, konum, rastgele not veya rastgele kart yaklaşımıyla bugünkü yeni kart havuzunu oluşturur.', 'New-card gather order builds today’s pool by deck, position, random note, or random card.'),
                l('Yeni / tekrar sırası yeni kartların tekrarlarla karışmasını ya da önce/sonra gösterilmesini belirler. Gün aşan öğrenme / tekrar sırası aynı kararı gün sınırını aşan öğrenme kartları için verir.', 'New/review order mixes new cards with reviews or places them before/after. Interday learning/review order does the same for learning cards that crossed a day boundary.'),
                l('Tekrar sıralaması yalnızca zamanı gelmiş kartların önceliğini değiştirir; kartların vade tarihlerini veya aralıklarını değiştirmez.', 'Review sort order only changes priority among due cards; it does not alter due dates or intervals.'),
            ],
            note: l('Üst deste çalışılırken görüntüleme sırası seçtiğiniz üst destenin ayar grubundan alınır; alt destelerin görüntüleme ayarları kullanılmaz.', 'When studying a parent deck, display order comes from the selected parent deck’s preset, not its subdecks.'),
            ...helpChrome,
        },
        burying: {
            title: l('Kardeş kartları gömme', 'Burying sibling cards'),
            summary: l('Aynı nottan üretilen kartlar kardeştir; örneğin ön→arka, arka→ön ve komşu cloze kartları.', 'Cards generated from the same note are siblings, such as front→back, back→front, and adjacent cloze cards.'),
            points: [
                l('Bir kardeş gösterildiğinde etkin türdeki diğer kardeşler ertesi çalışma gününe kadar gizlenir.', 'After one sibling is shown, enabled sibling types are hidden until the next study day.'),
                l('Kuyruk önceliği gün içi öğrenme, gün aşan öğrenme, tekrar ve yeni kart şeklindedir; daha erken türdeki kart korunur.', 'Queue priority is intraday learning, interday learning, review, then new; the earlier card type is kept.'),
                l('Bu davranış, aynı oturumdaki bir kartın başka bir kardeşin cevabını ele vermesini önler.', 'This prevents one card in a session from revealing the answer to a sibling.'),
            ],
            note: l('Gömme askıya alma değildir. Kartlar otomatik geri gelir ve çalışma geçmişi değişmez.', 'Burying is not suspension. Cards return automatically and review history is unchanged.'),
            ...helpChrome,
        },
        audio: {
            title: l('Kart sesi', 'Card audio'),
            summary: l('Ses seçenekleri kart açılışını ve cevap tarafındaki manuel yeniden oynatmayı ayrı ayrı yönetir.', 'Audio options separately control card-side autoplay and manual replay on the answer side.'),
            points: [
                l('Otomatik oynatma açıkken ilgili yüzdeki ses kart yüzü görünür görünmez başlar.', 'With autoplay enabled, audio on the current side starts as soon as that side appears.'),
                l('Otomatik oynatma kapalıysa ses yalnızca karttaki oynatma kontrolüyle başlatılır.', 'With autoplay disabled, audio starts only from the card’s play control.'),
                l('“Cevabı yeniden oynatırken soruyu atla”, cevap tarafında yeniden oynat düğmesine bastığınızda soru yüzünün seslerini tekrar çalmaz.', '“Skip question when replaying answer” prevents question-side audio from replaying when Replay is used on the answer side.'),
            ],
            note: l('Soruyu atlama seçeneği otomatik oynatmayı etkilemez; yalnızca manuel yeniden oynatma davranışını değiştirir.', 'Skipping the question does not affect autoplay; it only changes manual replay behavior.'),
            ...helpChrome,
        },
        timers: {
            title: l('Cevap zamanlayıcısı', 'Answer timer'),
            summary: l('Zamanlayıcı çalışma süresini ölçer; kartın derecesini veya zamanlama aralığını değiştirmez.', 'The timer measures study time; it does not change a card’s grade or scheduling interval.'),
            points: [
                l('En fazla cevap süresi, tek bir inceleme için istatistiklere yazılabilecek süreyi sınırlar.', 'Maximum answer time caps the time recorded for a single review.'),
                l('Ekran zamanlayıcısı aynı sayacı çalışma ekranında gösterir ve üst sınıra ulaştığında durur.', 'The on-screen timer displays the same counter during study and stops at the maximum.'),
                l('“Cevap gösterilince durdur” yalnızca görünen sayacı dondurur; istatistiklere kaydedilen toplam süre cevap düğmesine basılana kadar devam eder.', '“Stop on answer” freezes only the visible timer; the time recorded for statistics continues until a grade is pressed.'),
            ],
            note: l('Sık sık üst sınırı aşıyorsanız süreyi yükseltmekten önce kartı daha kısa ve tek odaklı hâle getirmeyi düşünün.', 'If you often hit the cap, consider making the card shorter and more focused before raising the limit.'),
            ...helpChrome,
        },
        autoAdvance: {
            title: l('Otomatik ilerleme nasıl çalışır?', 'How Auto Advance works'),
            summary: l('Otomatik ilerleme, belirlediğiniz süre dolunca cevabı gösterebilir ve ardından seçtiğiniz işlemi uygulayabilir.', 'Auto Advance can reveal the answer after a delay and then perform the selected action.'),
            points: [
                l('Soru veya cevap süresini 0 yapmak o aşamayı kapatır. Soru işlemi cevabı açabilir veya yalnızca süre uyarısı gösterebilir.', 'Setting the question or answer time to 0 disables that stage. The question action can reveal the answer or only show a time reminder.'),
                l('Sesin bitmesini bekle açıkken geri sayım, o yüzdeki ses tamamlanana kadar işlemi uygulamaz.', 'When Wait for audio is on, the action is delayed until audio on that side finishes.'),
                l('Cevap işlemi kartı gömebilir, Tekrar/Zor/İyi ile yanıtlayabilir veya yalnızca süre uyarısı gösterebilir.', 'The answer action can bury the card, grade it Again/Hard/Good, or only show a time reminder.'),
            ],
            note: l('Bu ayarlar süreleri tanımlar. Çalışma ekranındaki Otomatik İlerleme anahtarı ayrıca açık olmalıdır; otomatik verilen notlar normal inceleme kaydı oluşturur.', 'These options define the timings. Auto Advance must also be enabled for studying; automatic grades create normal review-log entries.'),
            ...helpChrome,
        },
        easyDays: {
            title: l('Kolay günler neyi değiştirir?', 'How Easy Days work'),
            summary: l('Yeni bir aralık hesaplanırken vade günü küçük miktarda kaydırılarak belirli günlerdeki tekrar yükü azaltılır.', 'When a new interval is calculated, its due day is shifted slightly to reduce review load on selected weekdays.'),
            points: [
                l('Normal günü değiştirmez; Azaltılmış o güne düşen tekrarların bir bölümünü, Yok ise mümkün olan tekrarların tamamını yakın günlere kaydırır.', 'Normal leaves the day unchanged; Reduced shifts some reviews away, and None shifts all eligible reviews to nearby days.'),
                l('Bir güne dokunarak Normal → Azaltılmış → Yok sırasıyla geçebilirsiniz.', 'Tap a day to cycle Normal → Reduced → None.'),
                l('Değişiklik yalnızca bundan sonra hesaplanan aralıklara uygulanır; mevcut vadeler topluca taşınmaz.', 'The change applies only to intervals calculated from now on; existing due dates are not moved in bulk.'),
            ],
            note: l('Bütün günleri aynı seviyeye düşürmek toplam iş yükünü azaltmaz; yalnızca günler arasındaki dağılımı değiştirir.', 'Reducing every day equally does not lower total workload; it only changes distribution between days.'),
            ...helpChrome,
        },
        advanced: {
            title: l('Gelişmiş aralık ayarları', 'Advanced interval settings'),
            summary: l('Bu değerler mevcut Anki V3 / SM-2 motorunun tekrar aralıklarını doğrudan değiştirir.', 'These values directly change review intervals in the current Anki V3 / SM-2 engine.'),
            points: [
                l('Başlangıç kolaylığı yeni mezun kartın katsayısıdır. Kolay bonusu ve Zor çarpanı ilgili yanıtların aralıklarını etkiler.', 'Starting ease is assigned when a card graduates. Easy bonus and Hard multiplier affect their respective answer intervals.'),
                l('Aralık düzenleyici bütün tekrar aralıklarına ek bir çarpan uygular; en fazla aralık nihai üst sınırdır.', 'Interval modifier applies an extra multiplier to all review intervals; Maximum interval is the final upper bound.'),
                l('Yeni aralık yüzdesi, Tekrar yanıtından sonra eski aralığın ne kadarının korunacağını belirler. 0, kartı en az aralığa döndürür.', 'New interval percentage controls how much of the old interval remains after Again. 0 resets the card to the minimum interval.'),
            ],
            note: l(
                'Bu değerleri yalnızca FSRS kapalıyken görürsünüz; FSRS açıldığında aralıkları kartın hafıza durumu belirler ve bu çarpanlar kullanılmaz. Ne yaptığınızdan emin değilseniz varsayılanları koruyun.',
                'These values are shown only while FSRS is off: with FSRS on, intervals come from each card’s memory state and the multipliers are unused. Keep the defaults unless you understand the scheduling impact.',
            ),
            ...helpChrome,
        },
    } satisfies Record<string, OptionHelp>;
}
