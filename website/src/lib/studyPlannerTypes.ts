export type PlannerMode = 'exam' | 'time';
export type PlannerScope = 'all' | 'temel' | 'klinik' | 'custom';
export type PlannerRetention = 85 | 90 | 93;
export type StudyDaysPerWeek = 5 | 6 | 7;
export type CourseOrder = 'temel-first' | 'klinik-first' | 'high-yield';
export type ChartUnit = 'cards' | 'minutes';

export interface PlannerCourse {
  id: string;
  name: string;
  group: 'temel' | 'klinik' | 'karma';
  cards: number;
  notes: number;
  topicSubdecks: number;
  destekOran: number | null;
  branchSlug: string | null;
}

export interface PlannerExam {
  id: string;
  name: string;
  shortName: string;
  examDate: string;
  examDateIso: string;
  examDateLabel: string;
}

export interface PlannerInput {
  mode: PlannerMode;
  days: number;
  scope: PlannerScope;
  selectedCourseIds: string[];
  completedCards: number;
  newPerDay: number;
  maxMinutes: number;
  bufferDays: number;
  studyDaysPerWeek: StudyDaysPerWeek;
  retention: PlannerRetention;
  showMega: boolean;
  chartUnit: ChartUnit;
  courseOrder: CourseOrder;
}

export interface DailyPoint {
  day: number;
  newCards: number;
  reviews: number;
  totalCards: number;
  minutes: number;
  cumNew: number;
  megaTotalCards: number;
  megaMinutes: number;
}

export interface ScopeMetrics {
  totalCards: number;
  remainingCards: number;
  avgCards: number;
  avgReviews: number;
  avgMinutes: number;
  peakCards: number;
  peakMinutes: number;
  peakDay: number;
  endDayCards: number;
  endDayMinutes: number;
  finishDay: number | null;
  introduced: number;
  unseenAtExam: number;
  memorized: number;
  memorizedPct: number;
  reviewOnlyTailDays: number;
}

export interface CourseRoadmapItem {
  course: PlannerCourse;
  remainingCards: number;
  activeDays: number;
  startDay: number;
  endDay: number;
  finishesBeforeExam: boolean;
}

export interface PlannerVerdict {
  tone: 'good' | 'warn' | 'danger';
  badge: string;
  title: string;
  detail: string;
  fixAction?: {
    label: string;
    patch: Partial<PlannerInput>;
  };
}

export interface DeckSettingsSummary {
  newPerDay: number;
  reviewLimitLabel: string;
  retentionPct: PlannerRetention;
  cadenceLabel: string;
  bufferLabel: string;
}

export interface PlannerResult {
  input: PlannerInput;
  effectiveBufferDays: number;
  introWindowDays: number;
  activeIntroDaysInWindow: number;
  activePace: number;
  recommendedPace: number;
  timeBudgetFits: boolean;
  activeCourses: PlannerCourse[];
  target: ScopeMetrics;
  mega: ScopeMetrics;
  series: DailyPoint[];
  verdict: PlannerVerdict;
  roadmap: CourseRoadmapItem[];
  settings: DeckSettingsSummary;
}

export interface PlannerPreset {
  id: 'stajyer' | 'intorn' | 'mezun' | 'son4ay';
  title: string;
  horizonLabel: string;
  examId?: string;
  tip: string;
  href: string;
  linkLabel: string;
  patch: Partial<PlannerInput>;
}

export interface ChartGeometry {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
  maxY: number;
  yTicks: number[];
  xTicks: number[];
  targetPath: string;
  targetAreaPath: string;
  megaPath: string;
  finishX: number | null;
  bufferRect: { x: number; width: number } | null;
  xAt: (day: number) => number;
  yAt: (val: number) => number;
  targetYAtDay: (day: number) => number;
  megaYAtDay: (day: number) => number;
}

const DAY_MS = 86_400_000;
const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;
const TR_WEEKDAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

export function formatTrInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatTrPct(n: number, decimals = 1): string {
  return `%${n.toFixed(decimals).replace('.', ',')}`;
}

export function formatDurationTr(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} sa` : `${h} sa ${rem} dk`;
}

export function todayUtcMs(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseIsoCalendarUtcMs(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

export function formatIsoDateUtc(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTrCalendarDate(baseUtcMs: number, offsetDays: number): string {
  const d = new Date(baseUtcMs + offsetDays * DAY_MS);
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTrCalendarDateWithWeekday(baseUtcMs: number, offsetDays: number): string {
  const d = new Date(baseUtcMs + offsetDays * DAY_MS);
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (${TR_WEEKDAYS[d.getUTCDay()]})`;
}

export function daysBetweenUtc(startUtcMs: number, targetUtcMs: number): number {
  return Math.round((targetUtcMs - startUtcMs) / DAY_MS);
}

export function daysUntilExamIso(examDateIso: string, baseUtcMs: number): number | null {
  const target = parseIsoCalendarUtcMs(examDateIso);
  if (target === null) return null;
  return daysBetweenUtc(baseUtcMs, target);
}

export function scopeDisplayLabel(scope: PlannerScope, courseCount: number): string {
  if (scope === 'all') return 'Tüm BKA TUS paketi (12 ders)';
  if (scope === 'temel') return 'Temel Bilimler (6 ders)';
  if (scope === 'klinik') return 'Klinik Bilimler (5 ders)';
  return `Özel seçim (${courseCount} ders)`;
}

export function buildSvgChartGeometry(result: PlannerResult): ChartGeometry {
  const width = 640;
  const height = 256;
  const pad = { l: 56, r: 16, t: 20, b: 34 };
  const days = result.input.days;
  const isMin = result.input.chartUnit === 'minutes';
  const showMega = result.input.showMega;

  const step = Math.max(1, Math.floor(days / 72));
  const indices = new Set<number>([0, days - 1]);
  for (let i = 0; i < days; i += step) indices.add(i);
  if (result.target.finishDay !== null) {
    const fi = result.target.finishDay - 1;
    if (fi >= 0 && fi < days) indices.add(fi);
    if (fi + 1 < days) indices.add(fi + 1);
  }
  const peakIdx = result.target.peakDay - 1;
  if (peakIdx >= 0 && peakIdx < days) indices.add(peakIdx);
  const sortedIdx = [...indices].sort((a, b) => a - b);

  const smoothAt = (idx: number, key: 'totalCards' | 'minutes' | 'megaTotalCards' | 'megaMinutes'): number => {
    if (result.input.studyDaysPerWeek === 7 || idx === 0) return result.series[idx][key];
    const finishIdx = result.target.finishDay !== null ? result.target.finishDay - 1 : days;
    const isTargetKey = key === 'totalCards' || key === 'minutes';
    if (isTargetKey && idx > finishIdx) return result.series[idx][key];
    const start = Math.max(0, idx - 6);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= idx; j++) {
      if (isTargetKey && j > finishIdx) break;
      sum += result.series[j][key];
      count++;
    }
    return count > 0 ? sum / count : result.series[idx][key];
  };

  const targetKey = isMin ? 'minutes' : 'totalCards';
  const megaKey = isMin ? 'megaMinutes' : 'megaTotalCards';

  let rawMax = 0;
  for (let i = 0; i < days; i++) {
    const tv = smoothAt(i, targetKey);
    if (tv > rawMax) rawMax = tv;
    if (showMega) {
      const mv = smoothAt(i, megaKey);
      if (mv > rawMax) rawMax = mv;
    }
  }
  const roundStep = isMin ? 30 : 100;
  const maxY = Math.max(roundStep, Math.ceil(rawMax / roundStep) * roundStep);

  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (day: number) => pad.l + ((day - 1) / Math.max(1, days - 1)) * plotW;
  const yAt = (val: number) => pad.t + (1 - Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const targetCoords = sortedIdx.map((i) => {
    const pt = result.series[i];
    return [xAt(pt.day), yAt(smoothAt(i, targetKey))] as const;
  });
  const megaCoords = sortedIdx.map((i) => {
    const pt = result.series[i];
    return [xAt(pt.day), yAt(smoothAt(i, megaKey))] as const;
  });

  const toLine = (coords: readonly (readonly [number, number])[]) =>
    coords.map(([cx, cy], idx) => `${idx === 0 ? 'M' : 'L'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ');

  const targetPath = toLine(targetCoords);
  const megaPath = toLine(megaCoords);
  const baseY = yAt(0).toFixed(1);
  const firstX = targetCoords[0]?.[0].toFixed(1) ?? pad.l.toFixed(1);
  const lastX = targetCoords[targetCoords.length - 1]?.[0].toFixed(1) ?? (width - pad.r).toFixed(1);
  const targetAreaPath = `${targetPath} L${lastX} ${baseY} L${firstX} ${baseY} Z`;

  const yTicks = [0, Math.round(maxY / 2), maxY];
  const xTicks = [1, Math.round(days / 3), Math.round((days * 2) / 3), days];

  const finishX =
    result.target.finishDay !== null && result.target.finishDay <= days ? xAt(result.target.finishDay) : null;

  const bufferRect =
    result.effectiveBufferDays > 0 && result.introWindowDays < days
      ? {
          x: xAt(result.introWindowDays),
          width: Math.max(0, xAt(days) - xAt(result.introWindowDays)),
        }
      : null;

  const targetYAtDay = (day: number) => {
    const idx = Math.max(0, Math.min(days - 1, Math.round(day) - 1));
    return yAt(smoothAt(idx, targetKey));
  };
  const megaYAtDay = (day: number) => {
    const idx = Math.max(0, Math.min(days - 1, Math.round(day) - 1));
    return yAt(smoothAt(idx, megaKey));
  };

  return {
    width,
    height,
    pad,
    maxY,
    yTicks,
    xTicks,
    targetPath,
    targetAreaPath,
    megaPath,
    finishX,
    bufferRect,
    xAt,
    yAt,
    targetYAtDay,
    megaYAtDay,
  };
}

export function encodePlannerQuery(input: PlannerInput): string {
  const params = new URLSearchParams();
  params.set('mod', input.mode);
  params.set('gun', String(input.days));
  params.set('kapsam', input.scope);
  if (input.scope === 'custom') {
    params.set('dersler', input.selectedCourseIds.join(','));
  }
  if (input.completedCards > 0) {
    params.set('biten', String(input.completedCards));
  }
  if (input.mode === 'time') {
    params.set('dk', String(input.maxMinutes));
  } else {
    params.set('hiz', String(input.newPerDay));
  }
  params.set('tampon', String(input.bufferDays));
  params.set('hafta', String(input.studyDaysPerWeek));
  params.set('hedef', String(input.retention));
  if (input.courseOrder !== 'temel-first') {
    params.set('sira', input.courseOrder);
  }
  return params.toString();
}

export function parsePlannerQueryWithCourses(
  search: string,
  validCourseIds: ReadonlySet<string>,
): Partial<PlannerInput> | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const keys = ['mod', 'gun', 'kapsam', 'dersler', 'biten', 'hiz', 'dk', 'tampon', 'hafta', 'hedef', 'sira'];
  if (!keys.some((k) => params.has(k))) return null;

  const patch: Partial<PlannerInput> = {};
  const mod = params.get('mod');
  if (mod === 'exam' || mod === 'time') patch.mode = mod;

  if (params.has('gun')) patch.days = Number(params.get('gun'));
  const kapsam = params.get('kapsam');
  if (kapsam === 'all' || kapsam === 'temel' || kapsam === 'klinik' || kapsam === 'custom') {
    patch.scope = kapsam;
  }
  if (params.has('dersler')) {
    const ids = (params.get('dersler') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => validCourseIds.has(id));
    if (ids.length > 0) patch.selectedCourseIds = ids;
  }
  if (params.has('biten')) patch.completedCards = Number(params.get('biten'));
  if (params.has('hiz')) patch.newPerDay = Number(params.get('hiz'));
  if (params.has('dk')) patch.maxMinutes = Number(params.get('dk'));
  if (params.has('tampon')) patch.bufferDays = Number(params.get('tampon'));
  const hafta = Number(params.get('hafta'));
  if (hafta === 5 || hafta === 6 || hafta === 7) patch.studyDaysPerWeek = hafta;
  const hedef = Number(params.get('hedef'));
  if (hedef === 85 || hedef === 90 || hedef === 93) patch.retention = hedef;
  const sira = params.get('sira');
  if (sira === 'temel-first' || sira === 'klinik-first' || sira === 'high-yield') {
    patch.courseOrder = sira;
  }
  return patch;
}

export function buildShareSummaryText(result: PlannerResult, startUtcMs?: number): string {
  const { input, target, settings } = result;
  const finishLine =
    target.finishDay !== null
      ? startUtcMs !== undefined
        ? `${target.finishDay}. gün (${formatTrCalendarDate(startUtcMs, target.finishDay)})`
        : `${target.finishDay}. gün`
      : `Sınava yetişmez (${formatTrInt(target.introduced)} / ${formatTrInt(target.remainingCards)} kart açılır)`;

  const examLine =
    startUtcMs !== undefined
      ? `${input.days} gün (hedef: ${formatTrCalendarDate(startUtcMs, input.days)})`
      : `${input.days} gün`;

  return [
    'TusAnkiM FSRS-6 Çalışma Planım',
    `• Kapsam: ${scopeDisplayLabel(input.scope, result.activeCourses.length)}, ${formatTrInt(target.remainingCards)} kart`,
    `• Süre: ${examLine}`,
    `• Günlük yeni kart: ${result.activePace} kart (${settings.cadenceLabel})`,
    `• İlk tur bitişi: ${finishLine}`,
    `• Günlük ortalama: ${formatTrInt(target.avgCards)} kart (~${formatDurationTr(target.avgMinutes)})`,
    `• En yoğun gün: ${formatTrInt(target.peakCards)} kart (~${formatDurationTr(target.peakMinutes)}, ${target.peakDay}. gün)`,
    `• Sınav günü akılda kalan: ${formatTrPct(target.memorizedPct)} (${formatTrInt(target.memorized)} kart, FSRS-6 %${input.retention})`,
    '',
    'TusAnkiM / Anki Deste Seçenekleri:',
    `- Günlük yeni kart sınırı: ${settings.newPerDay}`,
    `- Günlük tekrar sınırı: ${settings.reviewLimitLabel}`,
    `- FSRS-6 hedef hatırlama: %${settings.retentionPct}`,
    `- Tampon: ${settings.bufferLabel}`,
  ].join('\n');
}

function formatIcsDateUtc(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatIcsStampUtc(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}

/**
 * Generates an RFC 5545 all-day milestone calendar (.ics) for Apple Calendar / Google Calendar.
 * Offline client-side download — zero network requests, CSP-safe.
 */
export function buildPlannerIcs(result: PlannerResult, startUtcMs: number): string {
  const dtStamp = formatIcsStampUtc(startUtcMs);
  const { input, target, settings } = result;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TusAnkiM//FSRS-6 Study Planner//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TusAnkiM TUS Çalışma Planı',
  ];

  const addAllDayEvent = (uidKey: string, offsetDays: number, summary: string, description: string) => {
    const startMs = startUtcMs + Math.max(0, offsetDays) * DAY_MS;
    const endMs = startMs + DAY_MS;
    lines.push(
      'BEGIN:VEVENT',
      `UID:tusankim-${uidKey}-${formatIcsDateUtc(startMs)}@tusankim.com`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${formatIcsDateUtc(startMs)}`,
      `DTEND;VALUE=DATE:${formatIcsDateUtc(endMs)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'END:VEVENT',
    );
  };

  addAllDayEvent(
    'start',
    0,
    `TusAnkiM Plan Başlangıcı (${result.activePace} yeni kart/gün)`,
    [
      `Kapsam: ${scopeDisplayLabel(input.scope, result.activeCourses.length)} (${formatTrInt(target.remainingCards)} kart)`,
      `Deste Seçenekleri: Yeni=${settings.newPerDay}/gün, Tekrar=Sınırsız, FSRS-6=%${settings.retentionPct}`,
      `Haftalık düzen: ${settings.cadenceLabel}`,
      `Ortalama günlük yük: ${formatTrInt(target.avgCards)} kart (~${formatDurationTr(target.avgMinutes)})`,
    ].join('\n'),
  );

  for (const item of result.roadmap) {
    if (item.remainingCards <= 0 || item.startDay > input.days) continue;
    const supportStr =
      item.course.destekOran !== null
        ? `Son 6 TUS çözüm desteği: ${formatTrPct(item.course.destekOran)}`
        : 'Karma pekiştirme destesi';
    addAllDayEvent(
      `course-${item.course.id}`,
      item.startDay - 1,
      `TusAnkiM: ${item.course.name} (${formatTrInt(item.remainingCards)} kart)`,
      [
        `Hedef aralık: ${item.startDay}–${item.endDay}. gün (${item.activeDays} aktif gün)`,
        `Günlük tempo: ${result.activePace} yeni kart/gün`,
        supportStr,
      ].join('\n'),
    );
  }

  if (target.finishDay !== null && target.finishDay < input.days) {
    addAllDayEvent(
      'first-pass-done',
      target.finishDay - 1,
      'TusAnkiM: İlk Tur Bitişi — Yalnız Tekrar + Deneme Fazı',
      `Tüm ${formatTrInt(target.remainingCards)} kart açıldı. Kalan ${target.reviewOnlyTailDays} gün yalnız FSRS-6 tekrarları ve deneme çözümü.`,
    );
  }

  addAllDayEvent(
    'exam-target',
    input.days,
    'TUS Hedef Günü (TusAnkiM Planı)',
    `Tahmini hafızadaki kart oranı: ${formatTrPct(target.memorizedPct)} (${formatTrInt(target.memorized)} / ${formatTrInt(target.remainingCards)} kart, FSRS-6 %${input.retention}).`,
  );

  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}
