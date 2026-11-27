import fsrsPlanner from '../data/generated/fsrs-planner.json';
import examsData from '../data/exams.json';
import {
  formatDurationTr,
  formatTrInt,
  parsePlannerQueryWithCourses,
  type CourseOrder,
  type CourseRoadmapItem,
  type DailyPoint,
  type DeckSettingsSummary,
  type PlannerCourse,
  type PlannerExam,
  type PlannerInput,
  type PlannerMode,
  type PlannerPreset,
  type PlannerResult,
  type PlannerRetention,
  type PlannerScope,
  type PlannerVerdict,
  type ScopeMetrics,
  type StudyDaysPerWeek,
} from './studyPlannerTypes';

export * from './studyPlannerTypes';

export const PLANNER_LIMITS = {
  minDays: 30,
  maxDays: fsrsPlanner.maxDays,
  minPace: 5,
  maxPace: 160,
  minBudgetMin: 30,
  maxBudgetMin: 240,
  maxBufferDays: 45,
} as const;

export const MEGA_DECK_CARDS = fsrsPlanner.megaCards;

const TEMEL_ORDER = ['Anatomi', 'FHE', 'Biyokimya', 'Mikrobiyoloji', 'Patoloji', 'Farmakoloji'];
const KLINIK_ORDER = ['Dahiliye', 'Pediatri', 'Genel Cerrahi', 'Kadın Doğum', 'Küçük Stajlar'];

function canonicalOrderIndex(name: string): number {
  const ti = TEMEL_ORDER.indexOf(name);
  if (ti !== -1) return ti;
  const ki = KLINIK_ORDER.indexOf(name);
  if (ki !== -1) return 10 + ki;
  return 99;
}

export const PLANNER_COURSES: PlannerCourse[] = [...fsrsPlanner.courses]
  .sort((a, b) => canonicalOrderIndex(a.name) - canonicalOrderIndex(b.name))
  .map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group as 'temel' | 'klinik' | 'karma',
    cards: c.cards,
    notes: c.notes,
    topicSubdecks: c.topicSubdecks,
    destekOran: c.destekOran,
    branchSlug: c.branchSlug,
  }));

export const ALL_COURSE_IDS: string[] = PLANNER_COURSES.map((c) => c.id);
const VALID_COURSE_ID_SET = new Set(ALL_COURSE_IDS);

export const PLANNER_EXAMS: PlannerExam[] = examsData.exams.map((e) => ({
  id: e.id,
  name: e.name,
  shortName: e.shortName,
  examDate: e.examDate,
  examDateIso: e.examDate.slice(0, 10),
  examDateLabel: e.examDateLabel,
}));

export const DEFAULT_PLANNER_INPUT: PlannerInput = {
  mode: 'exam',
  days: 180,
  scope: 'all',
  selectedCourseIds: [...ALL_COURSE_IDS],
  completedCards: 0,
  newPerDay: 60,
  maxMinutes: 120,
  bufferDays: 14,
  studyDaysPerWeek: 7,
  retention: 90,
  showMega: true,
  chartUnit: 'cards',
  courseOrder: 'temel-first',
};

export const PLANNER_PRESETS: PlannerPreset[] = [
  {
    id: 'stajyer',
    title: 'Stajyer · 4.–5. sınıf',
    horizonLabel: '365 gün',
    tip: 'Stajınla birlikte ilerle. Haftada 1 gün mola ver, günlük kart sayını düşük tut, son ay yalnız tekrar yap.',
    patch: {
      mode: 'exam',
      days: 365,
      scope: 'all',
      completedCards: 0,
      newPerDay: 34,
      bufferDays: 30,
      studyDaysPerWeek: 6,
      retention: 90,
    },
  },
  {
    id: 'intorn',
    title: 'İntörn',
    horizonLabel: '270 gün',
    examId: '2027-2',
    tip: 'Nöbet günlerinde yeni kart açma, yalnız vadesi gelen tekrarları bitir; son 3 hafta denemeye kalsın.',
    patch: {
      mode: 'exam',
      days: 270,
      scope: 'all',
      completedCards: 0,
      newPerDay: 45,
      bufferDays: 21,
      studyDaysPerWeek: 6,
      retention: 90,
    },
  },
  {
    id: 'mezun',
    title: 'Mezun · pratisyen',
    horizonLabel: '180 gün',
    tip: 'Konu çalışmanın yanına günde 60 yeni kart ekle; ilk tur 160. günde biter, son 20 gün yalnız tekrar kalır.',
    patch: {
      mode: 'exam',
      days: 180,
      scope: 'all',
      completedCards: 0,
      newPerDay: 60,
      bufferDays: 14,
      studyDaysPerWeek: 7,
      retention: 90,
    },
  },
  {
    id: 'son4ay',
    title: 'Son 4 ay',
    horizonLabel: '120 gün',
    examId: '2027-1',
    tip: 'Süre dar. İlk turu son 2 haftadan önce bitir, deneme haftalarında zorlandığın konuları filtrele.',
    patch: {
      mode: 'exam',
      days: 120,
      scope: 'all',
      completedCards: 0,
      newPerDay: 91,
      bufferDays: 14,
      studyDaysPerWeek: 7,
      retention: 90,
    },
  },
];

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function resolveActiveCourses(scope: PlannerScope, selectedCourseIds: readonly string[]): PlannerCourse[] {
  if (scope === 'all') return PLANNER_COURSES;
  if (scope === 'temel') return PLANNER_COURSES.filter((c) => c.group === 'temel');
  if (scope === 'klinik') return PLANNER_COURSES.filter((c) => c.group === 'klinik');
  const picked = new Set(selectedCourseIds.filter((id) => VALID_COURSE_ID_SET.has(id)));
  const filtered = PLANNER_COURSES.filter((c) => picked.has(c.id));
  return filtered.length > 0 ? filtered : [PLANNER_COURSES[0]];
}

export function clampPlannerInput(raw: Partial<PlannerInput>): PlannerInput {
  const mode: PlannerMode = raw.mode === 'time' ? 'time' : 'exam';
  const scope: PlannerScope =
    raw.scope === 'temel' || raw.scope === 'klinik' || raw.scope === 'custom' ? raw.scope : 'all';
  const days = clampInt(raw.days, PLANNER_LIMITS.minDays, PLANNER_LIMITS.maxDays, DEFAULT_PLANNER_INPUT.days);

  const selectedCourseIds = Array.isArray(raw.selectedCourseIds)
    ? raw.selectedCourseIds.filter((id): id is string => typeof id === 'string' && VALID_COURSE_ID_SET.has(id))
    : [...ALL_COURSE_IDS];
  const safeSelectedIds = selectedCourseIds.length > 0 ? [...new Set(selectedCourseIds)] : [...ALL_COURSE_IDS];

  const activeCourses = resolveActiveCourses(scope, safeSelectedIds);
  const totalCards = activeCourses.reduce((sum, c) => sum + c.cards, 0);
  const completedCards = clampInt(raw.completedCards, 0, Math.max(0, totalCards - 1), 0);

  const newPerDay = clampInt(raw.newPerDay, PLANNER_LIMITS.minPace, PLANNER_LIMITS.maxPace, DEFAULT_PLANNER_INPUT.newPerDay);
  const maxMinutes = clampInt(
    raw.maxMinutes,
    PLANNER_LIMITS.minBudgetMin,
    PLANNER_LIMITS.maxBudgetMin,
    DEFAULT_PLANNER_INPUT.maxMinutes,
  );
  const bufferDays = clampInt(raw.bufferDays, 0, PLANNER_LIMITS.maxBufferDays, DEFAULT_PLANNER_INPUT.bufferDays);

  const studyDaysPerWeek: StudyDaysPerWeek =
    raw.studyDaysPerWeek === 5 || raw.studyDaysPerWeek === 6 ? raw.studyDaysPerWeek : 7;
  const retention: PlannerRetention = raw.retention === 85 || raw.retention === 93 ? raw.retention : 90;
  const showMega = typeof raw.showMega === 'boolean' ? raw.showMega : true;
  const chartUnit = raw.chartUnit === 'minutes' ? 'minutes' : 'cards';
  const courseOrder: CourseOrder =
    raw.courseOrder === 'klinik-first' || raw.courseOrder === 'high-yield' ? raw.courseOrder : 'temel-first';

  return {
    mode,
    days,
    scope,
    selectedCourseIds: safeSelectedIds,
    completedCards,
    newPerDay,
    maxMinutes,
    bufferDays,
    studyDaysPerWeek,
    retention,
    showMega,
    chartUnit,
    courseOrder,
  };
}

export function decodePlannerQuery(search: string): Partial<PlannerInput> | null {
  return parsePlannerQueryWithCourses(search, VALID_COURSE_ID_SET);
}

export function isNewCardDay(dayIndex: number, studyDaysPerWeek: StudyDaysPerWeek): boolean {
  if (studyDaysPerWeek >= 7) return true;
  return dayIndex % 7 < studyDaysPerWeek;
}

export function effectiveBuffer(days: number, bufferDays: number): number {
  return Math.min(Math.max(0, bufferDays), Math.max(0, days - 7));
}

export function countActiveIntroDays(days: number, bufferDays: number, studyDaysPerWeek: StudyDaysPerWeek): number {
  const effBuf = effectiveBuffer(days, bufferDays);
  const windowDays = Math.max(1, days - effBuf);
  let count = 0;
  for (let d = 0; d < windowDays; d++) {
    if (isNewCardDay(d, studyDaysPerWeek)) count++;
  }
  return Math.max(1, count);
}

export function computeRecommendedPace(
  remainingCards: number,
  days: number,
  bufferDays: number,
  studyDaysPerWeek: StudyDaysPerWeek,
): number {
  if (remainingCards <= 0) return PLANNER_LIMITS.minPace;
  const activeDays = countActiveIntroDays(days, bufferDays, studyDaysPerWeek);
  return Math.max(PLANNER_LIMITS.minPace, Math.ceil(remainingCards / activeDays));
}

export function computeMinimumDaysForPace(
  remainingCards: number,
  pace: number,
  bufferDays: number,
  studyDaysPerWeek: StudyDaysPerWeek,
): number {
  if (remainingCards <= 0) return PLANNER_LIMITS.minDays;
  const safePace = Math.max(1, pace);
  const neededActiveDays = Math.ceil(remainingCards / safePace);
  const fullWeeks = Math.floor((neededActiveDays - 1) / studyDaysPerWeek);
  const remActive = neededActiveDays - fullWeeks * studyDaysPerWeek;
  const introSpan = fullWeeks * 7 + remActive;
  return Math.max(PLANNER_LIMITS.minDays, introSpan + Math.max(0, bufferDays));
}

type KernelData = { rev: number[]; sec: number[]; mem: number[] };
const KERNELS = fsrsPlanner.kernels as Record<string, KernelData>;
const REV_SCALE = fsrsPlanner.scales.rev;
const SEC_SCALE = fsrsPlanner.scales.sec;
const MEM_SCALE = fsrsPlanner.scales.mem;

function buildDailyNewArray(
  cardsToIntroduce: number,
  days: number,
  newPerDay: number,
  bufferDays: number,
  studyDaysPerWeek: StudyDaysPerWeek,
): { newArr: number[]; finishDay: number | null; introduced: number } {
  const effBuf = effectiveBuffer(days, bufferDays);
  const introWindow = Math.max(1, days - effBuf);
  const newArr = new Array<number>(days).fill(0);
  let remaining = Math.max(0, cardsToIntroduce);
  let introduced = 0;
  let finishDay: number | null = remaining === 0 ? 1 : null;

  for (let d = 0; d < introWindow && remaining > 0; d++) {
    if (!isNewCardDay(d, studyDaysPerWeek)) continue;
    const take = Math.min(newPerDay, remaining);
    newArr[d] = take;
    remaining -= take;
    introduced += take;
    if (remaining === 0 && finishDay === null) {
      finishDay = d + 1;
    }
  }
  return { newArr, finishDay, introduced };
}

function convolveSchedule(
  totalCards: number,
  remainingCards: number,
  days: number,
  newPerDay: number,
  bufferDays: number,
  studyDaysPerWeek: StudyDaysPerWeek,
  retention: PlannerRetention,
): {
  metrics: ScopeMetrics;
  dailyNew: number[];
  dailyRev: number[];
  dailyTotal: number[];
  dailyMin: number[];
  cumNew: number[];
} {
  const kernel = KERNELS[String(retention)] ?? KERNELS['90'];
  const { newArr, finishDay, introduced } = buildDailyNewArray(
    remainingCards,
    days,
    newPerDay,
    bufferDays,
    studyDaysPerWeek,
  );

  const dailyRev = new Array<number>(days).fill(0);
  const dailyTotal = new Array<number>(days).fill(0);
  const dailyMin = new Array<number>(days).fill(0);
  const cumNew = new Array<number>(days).fill(0);

  let sumRev = 0;
  let sumNew = 0;
  let sumSec = 0;
  let peakCards = 0;
  let peakSec = 0;
  let peakDay = 1;
  let runningNew = 0;

  for (let d = 0; d < days; d++) {
    let rev = 0;
    let sec = 0;
    for (let s = 0; s <= d; s++) {
      const nw = newArr[s];
      if (nw === 0) continue;
      const age = d - s;
      rev += nw * (kernel.rev[age] / REV_SCALE);
      sec += nw * (kernel.sec[age] / SEC_SCALE);
    }
    const nwToday = newArr[d];
    const total = rev + nwToday;
    runningNew += nwToday;

    dailyRev[d] = Math.round(rev);
    dailyTotal[d] = Math.round(total);
    dailyMin[d] = Math.round(sec / 60);
    cumNew[d] = runningNew;

    sumRev += rev;
    sumNew += nwToday;
    sumSec += sec;

    if (total > peakCards) {
      peakCards = total;
      peakDay = d + 1;
    }
    if (sec > peakSec) {
      peakSec = sec;
    }
  }

  let endMemorized = 0;
  const lastDay = days - 1;
  for (let s = 0; s <= lastDay; s++) {
    const nw = newArr[s];
    if (nw === 0) continue;
    endMemorized += nw * (kernel.mem[lastDay - s] / MEM_SCALE);
  }
  const memorized = Math.round(endMemorized);
  const denom = Math.max(1, remainingCards);
  const memorizedPct = Number(((memorized / denom) * 100).toFixed(1));
  const unseenAtExam = Math.max(0, remainingCards - introduced);

  return {
    metrics: {
      totalCards,
      remainingCards,
      avgCards: Math.round((sumRev + sumNew) / days),
      avgReviews: Math.round(sumRev / days),
      avgMinutes: Math.round(sumSec / days / 60),
      peakCards: Math.round(peakCards),
      peakMinutes: Math.round(peakSec / 60),
      peakDay,
      endDayCards: dailyTotal[lastDay] ?? 0,
      endDayMinutes: dailyMin[lastDay] ?? 0,
      finishDay,
      introduced,
      unseenAtExam,
      memorized,
      memorizedPct,
      reviewOnlyTailDays: finishDay !== null ? Math.max(0, days - finishDay) : 0,
    },
    dailyNew: newArr,
    dailyRev,
    dailyTotal,
    dailyMin,
    cumNew,
  };
}

export function solvePaceForTimeBudget(input: PlannerInput): { pace: number; fitsBudget: boolean } {
  const activeCourses = resolveActiveCourses(input.scope, input.selectedCourseIds);
  const totalCards = activeCourses.reduce((sum, c) => sum + c.cards, 0);
  const remainingCards = Math.max(0, totalCards - input.completedCards);

  let lo: number = PLANNER_LIMITS.minPace;
  let hi: number = PLANNER_LIMITS.maxPace;
  let best: number = PLANNER_LIMITS.minPace;
  let fits = false;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const sim = convolveSchedule(
      totalCards,
      remainingCards,
      input.days,
      mid,
      input.bufferDays,
      input.studyDaysPerWeek,
      input.retention,
    );
    if (sim.metrics.avgMinutes <= input.maxMinutes) {
      best = mid;
      fits = true;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { pace: best, fitsBudget: fits };
}

export function orderCourses(courses: readonly PlannerCourse[], order: CourseOrder): PlannerCourse[] {
  const list = [...courses];
  if (order === 'klinik-first') {
    const rank = (c: PlannerCourse) => (c.group === 'klinik' ? 0 : c.group === 'temel' ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || canonicalOrderIndex(a.name) - canonicalOrderIndex(b.name));
  }
  if (order === 'high-yield') {
    return list.sort((a, b) => {
      if (a.destekOran === null && b.destekOran === null) return 0;
      if (a.destekOran === null) return 1;
      if (b.destekOran === null) return -1;
      return b.destekOran - a.destekOran;
    });
  }
  return list.sort((a, b) => canonicalOrderIndex(a.name) - canonicalOrderIndex(b.name));
}

export function buildCourseRoadmap(
  activeCourses: readonly PlannerCourse[],
  completedCards: number,
  days: number,
  newPerDay: number,
  bufferDays: number,
  studyDaysPerWeek: StudyDaysPerWeek,
  order: CourseOrder,
): CourseRoadmapItem[] {
  const ordered = orderCourses(activeCourses, order);
  const totalCards = ordered.reduce((s, c) => s + c.cards, 0);
  const remainingRatio = totalCards > 0 ? Math.max(0, totalCards - completedCards) / totalCards : 0;
  const effBuf = effectiveBuffer(days, bufferDays);
  const introWindow = Math.max(1, days - effBuf);

  let remainingPool = Math.max(0, totalCards - completedCards);
  const perCourseRemaining = ordered.map((course, idx) => {
    if (idx === ordered.length - 1) return remainingPool;
    const share = Math.min(remainingPool, Math.round(course.cards * remainingRatio));
    remainingPool -= share;
    return share;
  });

  let cursorDay = 0;
  let dayBudgetLeft = 0;
  const items: CourseRoadmapItem[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const course = ordered[i];
    let need = perCourseRemaining[i];
    if (need <= 0) {
      items.push({
        course,
        remainingCards: 0,
        activeDays: 0,
        startDay: Math.max(1, cursorDay + 1),
        endDay: Math.max(1, cursorDay + 1),
        finishesBeforeExam: true,
      });
      continue;
    }

    let startDay = 0;
    let endDay = 0;
    let guard = 0;
    const maxWalkDays = Math.max(days + 600, 1000);

    while (need > 0 && guard < maxWalkDays) {
      guard++;
      if (dayBudgetLeft <= 0) {
        while (!isNewCardDay(cursorDay, studyDaysPerWeek) && guard < maxWalkDays) {
          cursorDay++;
          guard++;
        }
        dayBudgetLeft = newPerDay;
      }
      if (startDay === 0) startDay = cursorDay + 1;
      const take = Math.min(need, dayBudgetLeft);
      need -= take;
      dayBudgetLeft -= take;
      endDay = cursorDay + 1;
      if (dayBudgetLeft === 0) {
        cursorDay++;
      }
    }

    items.push({
      course,
      remainingCards: perCourseRemaining[i],
      activeDays: Math.max(1, Math.ceil(perCourseRemaining[i] / Math.max(1, newPerDay))),
      startDay: Math.max(1, startDay),
      endDay: Math.max(startDay, endDay),
      finishesBeforeExam: endDay <= introWindow,
    });
  }

  return items;
}

function classifyVerdict(
  input: PlannerInput,
  activePace: number,
  recommendedPace: number,
  effBuffer: number,
  target: ScopeMetrics,
  timeBudgetFits: boolean,
): PlannerVerdict {
  const cadenceText =
    input.studyDaysPerWeek === 7 ? 'her gün' : `haftada ${input.studyDaysPerWeek} aktif günde`;

  if (target.finishDay === null) {
    const canFixPace = recommendedPace <= PLANNER_LIMITS.maxPace;
    const seenPct = Math.round((target.introduced / Math.max(1, target.remainingCards)) * 100);
    const finishDeadlinePhrase =
      effBuffer > 0
        ? `son ${effBuffer} günlük tampon başlamadan`
        : 'sınav gününe kadar';

    let fallbackFix: PlannerVerdict['fixAction'];
    if (canFixPace) {
      fallbackFix = {
        label: `Önerilen hıza ayarla (${recommendedPace} yeni/gün)`,
        patch: { mode: 'exam', newPerDay: recommendedPace },
      };
    } else if (input.scope === 'all') {
      fallbackFix = {
        label: 'Yalnız Klinik Bilimler seç (4.812 kart)',
        patch: { scope: 'klinik' },
      };
    } else {
      const neededDays = computeMinimumDaysForPace(
        target.remainingCards,
        PLANNER_LIMITS.maxPace,
        effBuffer,
        input.studyDaysPerWeek,
      );
      if (neededDays <= PLANNER_LIMITS.maxDays && neededDays > input.days) {
        fallbackFix = {
          label: `Süreyi ${neededDays} güne çıkar`,
          patch: { days: neededDays, mode: 'exam', newPerDay: PLANNER_LIMITS.maxPace },
        };
      }
    }

    return {
      tone: 'danger',
      badge: 'İlk tur sınava yetişmiyor',
      title: `Bu tempoyla sınava kadar ${formatTrInt(target.introduced)} / ${formatTrInt(target.remainingCards)} kart (%${seenPct}) açılır.`,
      detail: canFixPace
        ? `Tüm kartları ${finishDeadlinePhrase} bitirmek için ${cadenceText} en az ${recommendedPace} yeni kart gerekir.`
        : `Seçili sürede tüm kartlar için günde ${recommendedPace} yeni kart gerekir. Süreyi uzat ya da daha az ders seç.`,
      fixAction: fallbackFix,
    };
  }

  if (input.mode === 'time' && !timeBudgetFits) {
    return {
      tone: 'warn',
      badge: 'Ayırdığın süre yetmiyor',
      title: `En düşük ${activePace} yeni kart/gün hızında bile ortalama ${formatDurationTr(target.avgMinutes)} gerekir.`,
      detail: 'Hedef hatırlamayı %85’e çekersen ya da daha az ders seçersen günlük süren kısalır.',
      fixAction:
        input.retention !== 85 ? { label: 'Hedef hatırlamayı %85 yap', patch: { retention: 85 } } : undefined,
    };
  }

  if (target.peakMinutes >= 165 || target.avgMinutes >= 135 || activePace >= 100) {
    return {
      tone: 'warn',
      badge: 'Yoğun tempo',
      title: `İlk tur ${target.finishDay}. günde biter; en yoğun günde ~${formatDurationTr(target.peakMinutes)} çalışman gerekir.`,
      detail:
        input.retention > 85
          ? `Günde ortalama ${formatDurationTr(target.avgMinutes)} çalışırsın. Zamanın darsa hedef hatırlamayı %85’e indir; tekrarların yaklaşık %20 azalır.`
          : `Bu hızda en yoğun gün ${formatTrInt(target.peakCards)} karta çıkar. Deneme haftalarında yeni kart açmayı durdur, yalnız tekrarları bitir.`,
      fixAction:
        input.retention > 85 ? { label: 'Tekrarı azalt (%85 hatırlama)', patch: { retention: 85 } } : undefined,
    };
  }

  return {
    tone: 'good',
    badge: 'Plan sınava yetişiyor',
    title:
      target.reviewOnlyTailDays > 0
        ? `İlk tur ${target.finishDay}. günde biter; son ${target.reviewOnlyTailDays} gün yalnız tekrar ve denemeye kalır.`
        : `Tüm kartlar ${target.finishDay}. günde tamamlanır.`,
    detail: `Günde ortalama ${formatTrInt(target.avgCards)} kart (~${formatDurationTr(target.avgMinutes)}). Son günlerde günlük tekrar sayın ${formatTrInt(target.endDayCards)} karta (${formatDurationTr(target.endDayMinutes)}) kadar iner.`,
  };
}

export function runPlanner(rawInput: Partial<PlannerInput>): PlannerResult {
  const input = clampPlannerInput(rawInput);
  const activeCourses = resolveActiveCourses(input.scope, input.selectedCourseIds);
  const totalCards = activeCourses.reduce((sum, c) => sum + c.cards, 0);
  const remainingCards = Math.max(0, totalCards - input.completedCards);

  const effBuf = effectiveBuffer(input.days, input.bufferDays);
  const introWindowDays = Math.max(1, input.days - effBuf);
  const activeIntroDaysInWindow = countActiveIntroDays(input.days, effBuf, input.studyDaysPerWeek);
  const recommendedPace = computeRecommendedPace(remainingCards, input.days, effBuf, input.studyDaysPerWeek);

  let activePace = input.newPerDay;
  let timeBudgetFits = true;
  if (input.mode === 'time') {
    const solved = solvePaceForTimeBudget(input);
    activePace = solved.pace;
    timeBudgetFits = solved.fitsBudget;
  }

  const targetSim = convolveSchedule(
    totalCards,
    remainingCards,
    input.days,
    activePace,
    effBuf,
    input.studyDaysPerWeek,
    input.retention,
  );

  // Mega deck has 27.341 cards and never finishes its first pass inside normal exam windows,
  // so it keeps introducing new cards through exam day (bufferDays = 0) instead of halting early.
  const megaSim = convolveSchedule(
    MEGA_DECK_CARDS,
    MEGA_DECK_CARDS,
    input.days,
    activePace,
    0,
    input.studyDaysPerWeek,
    input.retention,
  );

  const series: DailyPoint[] = new Array(input.days);
  for (let d = 0; d < input.days; d++) {
    series[d] = {
      day: d + 1,
      newCards: targetSim.dailyNew[d],
      reviews: targetSim.dailyRev[d],
      totalCards: targetSim.dailyTotal[d],
      minutes: targetSim.dailyMin[d],
      cumNew: targetSim.cumNew[d],
      megaTotalCards: megaSim.dailyTotal[d],
      megaMinutes: megaSim.dailyMin[d],
    };
  }

  const verdict = classifyVerdict(input, activePace, recommendedPace, effBuf, targetSim.metrics, timeBudgetFits);
  const roadmap = buildCourseRoadmap(
    activeCourses,
    input.completedCards,
    input.days,
    activePace,
    effBuf,
    input.studyDaysPerWeek,
    input.courseOrder,
  );

  const cadenceLabel =
    input.studyDaysPerWeek === 7
      ? 'Haftada 7 gün (her gün yeni kart)'
      : input.studyDaysPerWeek === 6
        ? 'Haftada 6 gün (1 nöbet/mola günü: yalnız tekrar)'
        : 'Haftada 5 gün (2 gün: yalnız tekrar)';

  const settings: DeckSettingsSummary = {
    newPerDay: activePace,
    reviewLimitLabel: 'Sınırsız (9.999)',
    retentionPct: input.retention,
    cadenceLabel,
    bufferLabel:
      effBuf > 0
        ? `Son ${effBuf} gün yeni kart = 0 (yalnız tekrar + deneme)`
        : 'Tampon gün yok (sınava kadar yeni kart)',
  };

  return {
    input,
    effectiveBufferDays: effBuf,
    introWindowDays,
    activeIntroDaysInWindow,
    activePace,
    recommendedPace,
    timeBudgetFits,
    activeCourses,
    target: targetSim.metrics,
    mega: megaSim.metrics,
    series,
    verdict,
    roadmap,
    settings,
  };
}
