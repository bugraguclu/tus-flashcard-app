// ============================================================
// TUS Flashcard - Scheduling Engine (ANKI_V3)
// ============================================================
// Tek motor: ANKI_V3 (Anki birebir uyumlu SM-2 tabanlÄ± zamanlama)
// FSRS-5 implementasyonu:
//   Kaynak: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
//   Makale: "A Stochastic Shortest Path Algorithm for Optimizing
//            Spaced Repetition Scheduling" (Ye, Su, Cao - KDD 2022)
//
// Bu dosyadaki FSRS formÃ¼lleri, Anki 23.10+ (FSRS-5) ile birebir
// uyumlu olacak ÅŸekilde resmi wiki'den alÄ±nmÄ±ÅŸtÄ±r.
// ============================================================

import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';

// ============================================================
// YARDIMCI: Yerel tarih fonksiyonlarÄ± (UTC KULLANILMAZ)
// ============================================================
// Anki tÃ¼m tarih karÅŸÄ±laÅŸtÄ±rmalarÄ±nÄ± yerel gÃ¼n bazÄ±nda yapar.
// toISOString() UTC kullanÄ±r ve gece yarÄ±sÄ± civarÄ±nda gÃ¼n kaymasÄ± Ã¼retir.
// Bu yÃ¼zden tÃ¼m dueDate Ã¼retimleri yerel tarihle yapÄ±lÄ±r.

/** Yerel saatle bugÃ¼nÃ¼n tarihini YYYY-MM-DD dÃ¶ner (UTC DEÄÄ°L) */
function todayLocalYMD(now?: Date): string {
    const d = now || new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Yerel gÃ¼ne gÃ¼n ekleyip YYYY-MM-DD dÃ¶ner */
function addDaysLocalYMD(days: number, baseDate?: Date): string {
    const d = baseDate ? new Date(baseDate.getTime()) : new Date();
    d.setDate(d.getDate() + days);
    return todayLocalYMD(d);
}

/** Yerel gÃ¼n baÅŸlangÄ±cÄ± (00:00:00.000) epoch ms */
function startOfLocalDayMs(date?: Date): number {
    const d = date ? new Date(date.getTime()) : new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Eski getToday() uyumluluÄŸu â€” artÄ±k yerel tarih kullanÄ±r */
function getToday(): string {
    return todayLocalYMD();
}

function formatDays(days: number): string {
    if (days <= 0) return '< 1dk';
    if (days === 1) return '1 gÃ¼n';
    if (days < 30) return `${days} gÃ¼n`;
    if (days < 365) {
        const months = days / 30;
        return months < 1.5 ? '1 ay' : `${Math.round(months)} ay`;
    }
    return `${(days / 365).toFixed(1)} yÄ±l`;
}

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}dk`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}sa`;
    return formatDays(Math.round(minutes / 1440));
}

// ============================================================
// 1. FSRS-5 ENGINE
// ============================================================
//
// Akademik arka plan:
//   FSRS, "Three Component Model of Memory" Ã¼zerine kuruludur.
//   3 bileÅŸen:
//     D (Difficulty)     â†’ KartÄ±n zorluÄŸu, [1, 10] aralÄ±ÄŸÄ±nda
//     S (Stability)      â†’ R=%90 oluncaya kadar geÃ§en gÃ¼n sayÄ±sÄ±
//     R (Retrievability)  â†’ HatÄ±rlama olasÄ±lÄ±ÄŸÄ±, [0, 1] aralÄ±ÄŸÄ±nda
//
//   HafÄ±za modeli:
//     - Her cevap sonrasÄ± D ve S gÃ¼ncellenir
//     - R, zamanla dÃ¼ÅŸer (forgetting curve)
//     - Bir sonraki tekrar tarihi, hedef retention'a gÃ¶re belirlenir
//
//   Neden SM-2'den iyi?
//     1. HafÄ±za bilimsel modeline dayanÄ±r (SM-2 heuristik)
//     2. KullanÄ±cÄ± verisinden optimize edilebilir (ML tabanlÄ±)
//     3. Spacing effect'i doÄŸru modeller (geÃ§ kaldÄ±ÄŸÄ±nda bonus)
//     4. Zorluk "ease hell"e dÃ¼ÅŸmez (mean reversion)
//
// ============================================================

// ---- SABÄ°TLER ----
// FSRS-4.5 ve FSRS-5'te kullanÄ±lan forgetting curve sabitleri
const DECAY = -0.5;
const FACTOR = 19 / 81;  // â‰ˆ 0.2346 â€” R(S,S) = 0.9 saÄŸlamak iÃ§in

// ---- FSRS-5 VARSAYILAN PARAMETRELER (Anki resmi wiki) ----
// Kaynak: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm#fsrs-5
const W = [
    0.40255,  // w[0]  â†’ S0(1): "Again" ile ilk stability (gÃ¼n)
    1.18385,  // w[1]  â†’ S0(2): "Hard" ile ilk stability
    3.173,    // w[2]  â†’ S0(3): "Good" ile ilk stability
    15.69105, // w[3]  â†’ S0(4): "Easy" ile ilk stability
    7.1949,   // w[4]  â†’ D0 base: ilk zorluk offset (D0(1) = w4)
    0.5345,   // w[5]  â†’ D0 grade: ilk zorlukta grade Ã§arpanÄ±
    1.4604,   // w[6]  â†’ Î”D: zorluk gÃ¼ncelleme Ã§arpanÄ±
    0.0046,   // w[7]  â†’ Mean reversion aÄŸÄ±rlÄ±ÄŸÄ±
    1.54575,  // w[8]  â†’ S'r: recall stability exp katsayÄ±sÄ±
    0.1192,   // w[9]  â†’ S'r: recall stability S^(-w9) katsayÄ±sÄ±
    1.01925,  // w[10] â†’ S'r: recall stability R exp katsayÄ±sÄ±
    1.9395,   // w[11] â†’ S'f: forget stability katsayÄ±sÄ±
    0.11,     // w[12] â†’ S'f: forget stability D^(-w12) katsayÄ±sÄ±
    0.29605,  // w[13] â†’ S'f: forget stability (S+1)^w13 katsayÄ±sÄ±
    2.2698,   // w[14] â†’ S'f: forget stability R exp katsayÄ±sÄ±
    0.2315,   // w[15] â†’ Hard penalty: recall'da stability Ã§arpanÄ±
    2.9898,   // w[16] â†’ Easy bonus: recall'da stability Ã§arpanÄ±
    0.51655,  // w[17] â†’ Same-day review: grade etkisi katsayÄ±sÄ±
    0.6621,   // w[18] â†’ Same-day review: grade offset
];

// ============================================================
// FSRS-5 FORMÃœLLER (Resmi wiki'den birebir)
// ============================================================

/**
 * FORMÃœL 1: Forgetting Curve (Unutma EÄŸrisi)
 *
 *   R(t, S) = (1 + FACTOR * t/S)^DECAY
 *
 * Akademik arka plan:
 *   - FSRS-4.5'te exponential'den power function'a geÃ§ildi
 *   - t = son tekrardan bu yana geÃ§en gÃ¼n
 *   - S = stability (R=%90 olana kadar geÃ§en gÃ¼n)
 *   - SonuÃ§: t=S olduÄŸunda R=0.9 (tanÄ±m gereÄŸi)
 *
 * Neden power function?
 *   Exponential (e^(-t/S)) Ã§ok hÄ±zlÄ± dÃ¼ÅŸer. Power function gerÃ§ek
 *   insan hafÄ±zasÄ±nÄ± daha iyi modeller: baÅŸta hÄ±zlÄ± dÃ¼ÅŸer, sonra yavaÅŸlar.
 */
function forgettingCurve(t: number, S: number): number {
    if (S <= 0) return 0;
    return Math.pow(1 + FACTOR * t / S, DECAY);
}

/**
 * FORMÃœL 2: Optimal Interval (Optimum Tekrar AralÄ±ÄŸÄ±)
 *
 *   I(r, S) = (S / FACTOR) * (r^(1/DECAY) - 1)
 *
 * Forgetting curve'Ã¼n tersi: "R = r olmasÄ±nÄ± istiyorsam kaÃ§ gÃ¼n beklemeliyim?"
 *   - r = hedef retention (varsayÄ±lan 0.9)
 *   - S = mevcut stability
 *   - SonuÃ§: r=0.9 ve S=10 ise â†’ I = 10 gÃ¼n (mantÄ±klÄ±!)
 */
function nextInterval(S: number, desiredRetention: number): number {
    const raw = (S / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
    return Math.max(1, Math.round(raw));
}

/**
 * FORMÃœL 3: Initial Stability (Ä°lk KararlÄ±lÄ±k)
 *
 *   S0(G) = w[G-1]
 *
 * En basit formÃ¼l: grade'e gÃ¶re sabit bir baÅŸlangÄ±Ã§ stability.
 *   Again(1): 0.40 gÃ¼n â†’ yaklaÅŸÄ±k 10 saat
 *   Hard(2):  1.18 gÃ¼n
 *   Good(3):  3.17 gÃ¼n
 *   Easy(4):  15.69 gÃ¼n
 */
function initStability(grade: number): number {
    const index = Math.max(0, Math.min(3, grade - 1));
    return Math.max(0.1, W[index]);
}

/**
 * FORMÃœL 4: Initial Difficulty (Ä°lk Zorluk)
 *
 *   D0(G) = w[4] - e^(w[5] * (G - 1)) + 1
 *
 * Ã–nemli: w[4] = D0(1), yani "Again" grade verildiÄŸindeki ilk zorluk.
 *   Again(1): D0 = w4 - e^0 + 1 = w4 = 7.19
 *   Easy(4): D0 = w4 - e^(w5*3) + 1 â‰ˆ 7.19 - 4.97 + 1 â‰ˆ 3.22
 *
 * Her zaman [1, 10] aralÄ±ÄŸÄ±na clamp edilir.
 */
function initDifficulty(grade: number): number {
    const d = W[4] - Math.exp(W[5] * (grade - 1)) + 1;
    return clampDifficulty(d);
}

/**
 * FORMÃœL 5: Next Difficulty (Zorluk GÃ¼ncelleme) â€” FSRS-5
 *
 * 3 adÄ±m:
 *   1. Î”D(G) = -w[6] * (G - 3)
 *   2. D' = D + Î”D * (10 - D) / 9    [Linear Damping]
 *   3. D'' = w[7] * D0(4) + (1 - w[7]) * D'   [Mean Reversion]
 *
 * Akademik arka plan:
 *   - AdÄ±m 1: Grade 3 (Good) nÃ¶tr. Daha dÃ¼ÅŸÃ¼k â†’ zorluk artar. Daha yÃ¼ksek â†’ azalÄ±r.
 *   - AdÄ±m 2: "Linear Damping" â€” D 10'a yaklaÅŸtÄ±kÃ§a gÃ¼ncellemeler kÃ¼Ã§Ã¼lÃ¼r,
 *     bÃ¶ylece D asla tam 10'a ulaÅŸamaz (asimptotik davranÄ±ÅŸ).
 *   - AdÄ±m 3: "Mean Reversion" â€” D uzun vadede D0(4)'e doÄŸru Ã§ekilir.
 *     Bu, "ease hell" problemini Ã§Ã¶zer: sÃ¼rekli "Again" basan biri bile
 *     zamanla zorluk deÄŸerinin dengelenmesini gÃ¶rÃ¼r.
 *
 * Ã–NEMLÄ°: FSRS-5'te mean reversion hedefi D0(4) dir!
 *   (FSRS-4'te D0(3) idi â€” bu fark kritiktir)
 */
function nextDifficulty(D: number, grade: number): number {
    // AdÄ±m 1: Grade sapmasÄ±
    const deltaD = -W[6] * (grade - 3);

    // AdÄ±m 2: Linear Damping (D â†’ 10 yaklaÅŸtÄ±kÃ§a etki azalÄ±r)
    const Dprime = D + deltaD * (10 - D) / 9;

    // AdÄ±m 3: Mean Reversion (FSRS-5: hedef = D0(4))
    const D0_target = initDifficulty(4);
    const Dfinal = W[7] * D0_target + (1 - W[7]) * Dprime;

    return clampDifficulty(Dfinal);
}

/**
 * FORMÃœL 6: Recall Stability (BaÅŸarÄ±lÄ± HatÄ±rlama SonrasÄ±)
 *
 *   S'r(D, S, R, G) = S * (e^w[8] * (11-D) * S^(-w[9]) * (e^(w[10]*(1-R)) - 1)
 *                          * w[15](if G=2)  * w[16](if G=4)
 *                          + 1)
 *
 * Akademik arka plan (Spacing Effect):
 *   1. (11-D): Kolay kart â†’ daha bÃ¼yÃ¼k stability artÄ±ÅŸÄ±
 *   2. S^(-w9): YÃ¼ksek stability â†’ daha kÃ¼Ã§Ã¼k artÄ±ÅŸ (tavan etkisi)
 *   3. (e^(w10*(1-R)) - 1): DÃ¼ÅŸÃ¼k R â†’ bÃ¼yÃ¼k artÄ±ÅŸ (spacing effect!)
 *      â†’ KartÄ± geÃ§ tekrar edip doÄŸru bilirsen daha fazla bonus alÄ±rsÄ±n
 *   4. w[15] < 1: Hard penalty â†’ stability daha yavaÅŸ artar
 *   5. w[16] > 1: Easy bonus â†’ stability daha hÄ±zlÄ± artar
 *
 * Neden Ã¶nemli?
 *   SM-2'de "ease factor" sabit bir Ã§arpandÄ±r (2.5 gibi).
 *   FSRS'te SInc = S'/S dinamik olarak hesaplanÄ±r ve
 *   kartÄ±n zorluk + mevcut stability + hatÄ±rlama olasÄ±lÄ±ÄŸÄ±na baÄŸlÄ±dÄ±r.
 */
function recallStability(D: number, S: number, R: number, grade: Grade): number {
    let SInc = Math.exp(W[8])
        * (11 - D)
        * Math.pow(S, -W[9])
        * (Math.exp(W[10] * (1 - R)) - 1);

    // Grade modifiers
    if (grade === 2) SInc *= W[15];       // Hard: ~0.23x (stability yavaÅŸ artar)
    if (grade === 4) SInc *= W[16];       // Easy: ~2.99x (stability hÄ±zlÄ± artar)

    // SInc >= 1 garantisi (baÅŸarÄ±lÄ± recall'da stability dÃ¼ÅŸmemeli)
    SInc = Math.max(1, SInc + 1);

    return S * SInc;
}

/**
 * FORMÃœL 7: Forget (Lapse) Stability
 *
 *   S'f(D, S, R) = w[11] * D^(-w[12]) * ((S+1)^w[13] - 1) * e^(w[14]*(1-R))
 *
 * Akademik arka plan:
 *   - KartÄ± unuttun â†’ stability dÃ¼ÅŸer ama sÄ±fÄ±rlanmaz
 *   - D^(-w12): Kolay kart â†’ lapse sonrasÄ± daha yÃ¼ksek stability
 *   - (S+1)^w13: Eski stability yÃ¼ksekse â†’ kalÄ±ntÄ± hafÄ±za daha fazla
 *   - e^(w14*(1-R)): Erken unutma (yÃ¼ksek R) â†’ daha az stability kaybÄ±
 *
 * Ã–rnek (wiki'den):
 *   D=2, S=100, R=0.9:
 *   S'f â‰ˆ 1.94 * 2^(-0.11) * (101^0.30 - 1) * e^(2.27 * 0.1) â‰ˆ 3 gÃ¼n
 *   â†’ 100 gÃ¼nlÃ¼k bir kartÄ± unutursan bile 3 gÃ¼nlÃ¼k stability kalÄ±r
 */
function forgetStability(D: number, S: number, R: number): number {
    const newS = W[11]
        * Math.pow(D, -W[12])
        * (Math.pow(S + 1, W[13]) - 1)
        * Math.exp(W[14] * (1 - R));

    return Math.max(0.01, newS);
}

/**
 * FORMÃœL 8: Same-Day Review Stability (AynÄ± GÃ¼n Tekrar) â€” FSRS-5 YENÄ°
 *
 *   S'(S, G) = S * e^(w[17] * (G - 3 + w[18]))
 *
 * Akademik arka plan:
 *   FSRS-5'te eklendi. AynÄ± gÃ¼n iÃ§inde yapÄ±lan tekrarlar (Ã¶rn. 
 *   Ã¶ÄŸrenme adÄ±mlarÄ±nda 1dk â†’ 10dk tekrarlarÄ±) stability'i etkiler.
 *   - Grade < 3: stability dÃ¼ÅŸebilir
 *   - Grade >= 3: stability artar (w18 offset sayesinde)
 */
function sameDayStability(S: number, grade: number): number {
    return S * Math.exp(W[17] * (grade - 3 + W[18]));
}

/**
 * Deterministic Fuzz (Anki uyumlu)
 *
 * TÃ¼m kartlarÄ±n aynÄ± gÃ¼ne yÄ±ÄŸÄ±lmasÄ±nÄ± Ã¶nler.
 * Math.random() yerine kart+tarih bazlÄ± seed kullanÄ±r â†’ aynÄ± kart iÃ§in
 * aynÄ± gÃ¼n iÃ§inde hep aynÄ± sonucu verir (Ã¶ngÃ¶rÃ¼lebilir, tekrarlanabilir).
 */
function hashSeed(cardId: number, today: string): number {
    let h = 0;
    const s = `${cardId}-${today}`;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function applyFuzz(interval: number, cardId?: number): number {
    if (interval <= 2) return interval;
    const fuzzRange = interval < 7 ? 1
        : interval < 30 ? Math.max(2, Math.round(interval * 0.15))
            : Math.max(3, Math.round(interval * 0.05));
    // Deterministik seed veya fallback Math.random
    const seed = cardId != null ? hashSeed(cardId, todayLocalYMD()) : Math.floor(Math.random() * 100000);
    const delta = (seed % (2 * fuzzRange + 1)) - fuzzRange;
    return Math.max(1, interval + delta);
}

function clampDifficulty(d: number): number {
    return Math.min(10, Math.max(1, d));
}

// ============================================================
// 4. ANKI V3 COMPAT ENGINE (Anki birebir uyum)
// ============================================================
//
// Anki'nin SM-2 tabanli zamanlama kurallarini birebir uygular:
//   - Learning: steps uzerinden ilerle, Again->step0, Hard->ayni step,
//     Good->sonraki step veya mezuniyet, Easy->direkt mezuniyet
//   - Review: ease*interval bazli (min 1.3 ease, min 1 gun interval)
//   - Relearning: lapse sonrasi steps'ten gecip review'a geri don
//   - Fuzz: deterministik seed (kart+tarih hash)
//   - Tarih: yerel gun (UTC degil)
//
// ============================================================

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 Uyumlu (SM-2, birebir)',

    initCardState: (settings: AppSettings): Partial<CardState> => ({
        easeFactor: settings.startingEase,
        learningStep: 0,
        relearningStep: -1,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
        lastReviewedAtMs: 0,
    }),

    schedule: (cs: CardState, grade: Grade, settings: AppSettings): ScheduleResult => {
        const now = Date.now();
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now);
        return ankiV3Review(cs, grade, settings, now);
    },

    previewIntervals: (cs: CardState, settings: AppSettings): IntervalPreview => {
        const learningSteps = settings.learningSteps;
        const lapseSteps = settings.lapseSteps;
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isLearning && !isRelearning) {
            const step = cs.learningStep || 0;
            const curMin = learningSteps[step] || 1;
            const nextMin = learningSteps[step + 1] ?? null;
            let hardMin: number;
            if (nextMin !== null) { hardMin = Math.round((curMin + nextMin) / 2); }
            else { hardMin = Math.round(curMin * 1.5); }
            return {
                again: formatMinutes(learningSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${settings.graduatingInterval} gun`,
                easy: `${settings.easyInterval} gun`,
                againMinutes: learningSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        if (isRelearning) {
            const step = cs.relearningStep;
            const curMin = lapseSteps[step] || lapseSteps[0] || 1;
            const nextMin = lapseSteps[step + 1] ?? null;
            let hardMin: number;
            if (nextMin !== null) { hardMin = Math.round((curMin + nextMin) / 2); }
            else { hardMin = Math.round(curMin * 1.5); }
            return {
                again: formatMinutes(lapseSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${cs.interval || 1} gun`,
                easy: `${Math.max(cs.interval || 1, 1)} gun`,
                againMinutes: lapseSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        // Review preview
        const ef = cs.easeFactor || 2.5;
        const cur = cs.interval || 1;
        const rawHard = Math.max(cur + 1, Math.round(cur * 1.2));
        const rawGood = Math.round(cur * ef);
        const rawEasy = Math.round(cur * ef * 1.3);
        const iHard = Math.max(1, rawHard);
        const iGood = Math.max(iHard + 1, rawGood);
        const iEasy = Math.max(iGood + 1, rawEasy);
        return {
            again: formatMinutes(lapseSteps[0] || 1),
            hard: formatDays(iHard),
            good: formatDays(iGood),
            easy: formatDays(iEasy),
            againMinutes: lapseSteps[0] || 1,
        };
    },
};

function ankiV3Learning(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const curMin = steps[step] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0, isLearning: true, minutesUntilDue: steps[0] || 1,
            stateUpdates: { learningStep: 0, relearningStep: -1, status: 'learning', lastReviewedAtMs: now }
        };
    }
    if (grade === 2) {
        let delayMin: number;
        if (nextMin !== null) { delayMin = Math.round((curMin + nextMin) / 2); }
        else { delayMin = Math.round(curMin * 1.5); }
        return {
            interval: 0, isLearning: true, minutesUntilDue: delayMin,
            stateUpdates: { learningStep: step, relearningStep: -1, status: 'learning', lastReviewedAtMs: now }
        };
    }
    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0, isLearning: true, minutesUntilDue: nextMin,
                stateUpdates: { learningStep: step + 1, relearningStep: -1, status: 'learning', lastReviewedAtMs: now }
            };
        }
        const gradInterval = settings.graduatingInterval;
        return {
            interval: gradInterval, isLearning: false,
            stateUpdates: { learningStep: -1, relearningStep: -1, status: 'review', interval: gradInterval, repetition: (cs.repetition || 0) + 1, lastReviewedAtMs: now }
        };
    }
    // Easy (4) -> direkt mezuniyet
    const easyInt = settings.easyInterval;
    return {
        interval: easyInt, isLearning: false,
        stateUpdates: {
            learningStep: -1, relearningStep: -1, status: 'review', interval: easyInt,
            easeFactor: Math.max(1.3, (cs.easeFactor || settings.startingEase) + 0.15),
            repetition: (cs.repetition || 0) + 1, lastReviewedAtMs: now
        }
    };
}

function ankiV3Relearning(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const curMin = steps[step] || steps[0] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0, isLearning: true, minutesUntilDue: steps[0] || 1,
            stateUpdates: { relearningStep: 0, learningStep: -1, status: 'learning', lastReviewedAtMs: now }
        };
    }
    if (grade === 2) {
        let delayMin: number;
        if (nextMin !== null) { delayMin = Math.round((curMin + nextMin) / 2); }
        else { delayMin = Math.round(curMin * 1.5); }
        return {
            interval: 0, isLearning: true, minutesUntilDue: delayMin,
            stateUpdates: { relearningStep: step, learningStep: -1, status: 'learning', lastReviewedAtMs: now }
        };
    }
    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0, isLearning: true, minutesUntilDue: nextMin,
                stateUpdates: { relearningStep: step + 1, learningStep: -1, status: 'learning', lastReviewedAtMs: now }
            };
        }
        const lapseInterval = Math.max(1, cs.interval || 1);
        return {
            interval: lapseInterval, isLearning: false,
            stateUpdates: { relearningStep: -1, learningStep: -1, status: 'review', interval: lapseInterval, lastReviewedAtMs: now }
        };
    }
    // Easy (4) -> direkt review'a don
    const lapseInterval = Math.max(1, cs.interval || 1);
    return {
        interval: lapseInterval, isLearning: false,
        stateUpdates: { relearningStep: -1, learningStep: -1, status: 'review', interval: lapseInterval, lastReviewedAtMs: now }
    };
}

function ankiV3Review(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
    const ef = cs.easeFactor || settings.startingEase;
    const cur = Math.max(1, cs.interval || 1);
    const lapseSteps = settings.lapseSteps;

    if (grade === 1) {
        const newInterval = Math.max(1, Math.round(cur * settings.lapseNewInterval));
        const newEase = Math.max(1.3, ef - 0.20);
        return {
            interval: 0, isLearning: true, minutesUntilDue: lapseSteps[0] || 1,
            stateUpdates: {
                interval: newInterval, easeFactor: newEase, relearningStep: 0, learningStep: -1,
                lapses: (cs.lapses || 0) + 1, status: 'learning', lastReviewedAtMs: now
            }
        };
    }
    if (grade === 2) {
        const rawHard = Math.max(cur + 1, Math.round(cur * 1.2));
        const newEase = Math.max(1.3, ef - 0.15);
        const iHard = Math.max(1, applyFuzz(rawHard));
        return {
            interval: iHard, isLearning: false,
            stateUpdates: {
                interval: iHard, easeFactor: newEase, learningStep: -1, relearningStep: -1,
                repetition: (cs.repetition || 0) + 1, status: 'review', lastReviewedAtMs: now
            }
        };
    }
    if (grade === 3) {
        const rawGood = Math.round(cur * ef);
        const hardBase = Math.max(cur + 1, Math.round(cur * 1.2));
        const iGood = Math.max(hardBase + 1, applyFuzz(rawGood));
        return {
            interval: iGood, isLearning: false,
            stateUpdates: {
                interval: iGood, easeFactor: ef, learningStep: -1, relearningStep: -1,
                repetition: (cs.repetition || 0) + 1, status: 'review', lastReviewedAtMs: now
            }
        };
    }
    // Easy (4)
    const rawEasy = Math.round(cur * ef * 1.3);
    const hardBase = Math.max(cur + 1, Math.round(cur * 1.2));
    const goodBase = Math.max(hardBase + 1, Math.round(cur * ef));
    const iEasy = Math.max(goodBase + 1, applyFuzz(rawEasy));
    const newEase = Math.max(1.3, ef + 0.15);
    return {
        interval: iEasy, isLearning: false,
        stateUpdates: {
            interval: iEasy, easeFactor: newEase, learningStep: -1, relearningStep: -1,
            repetition: (cs.repetition || 0) + 1, status: 'review', lastReviewedAtMs: now
        }
    };
}

// ============================================================
// SCHEDULER: Engine Secici (Strategy Pattern)
// ============================================================

const engines: Record<AlgorithmType, SchedulerEngine> = {
    ANKI_V3: AnkiV3Engine,
};

export function getScheduler(type: AlgorithmType = 'ANKI_V3'): SchedulerEngine {
    return engines[type] || AnkiV3Engine;
}

export function getAvailableAlgorithms(): { type: AlgorithmType; name: string; description: string }[] {
    return Object.entries(engines).map(([type, engine]) => ({
        type: type as AlgorithmType,
        name: engine.name,
        description: engine.description,
    }));
}

export {
    formatDays,
    formatMinutes,
    getToday,
    todayLocalYMD,
    addDaysLocalYMD,
    startOfLocalDayMs,
};