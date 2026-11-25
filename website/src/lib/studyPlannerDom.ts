import {
  buildPlannerIcs,
  buildSvgChartGeometry,
  formatDurationTr,
  formatTrCalendarDate,
  formatTrInt,
  formatTrPct,
  scopeDisplayLabel,
  type ChartGeometry,
  type PlannerResult,
} from './studyPlanner';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function syncRangeCssVars(input: HTMLInputElement | null): void {
  if (!input) return;
  input.style.setProperty('--attr-min', input.min || '0');
  input.style.setProperty('--attr-max', input.max || '100');
  input.style.setProperty('--control-value', input.value);
}

export interface ChartDomRefs {
  chartSvg: SVGSVGElement | null;
  chartGrid: SVGGElement | null;
  chartXAxis: SVGGElement | null;
  chartBuffer: SVGRectElement | null;
  chartArea: SVGPathElement | null;
  chartMega: SVGPathElement | null;
  chartTarget: SVGPathElement | null;
  chartFinishGroup: SVGGElement | null;
  chartFinishLine: SVGLineElement | null;
  chartFinishLabel: SVGTextElement | null;
  chartCursorLine: SVGLineElement | null;
  chartCursorTarget: SVGCircleElement | null;
  chartCursorMega: SVGCircleElement | null;
  chartLegendMega: HTMLElement | null;
  chartTitle: HTMLElement | null;
  chartSmoothNote: HTMLElement | null;
  inspectSlider: HTMLInputElement | null;
  dayReadout: HTMLElement | null;
}

export function queryChartRefs(root: HTMLElement): ChartDomRefs {
  return {
    chartSvg: root.querySelector<SVGSVGElement>('[data-plan-chart]'),
    chartGrid: root.querySelector<SVGGElement>('[data-chart-grid]'),
    chartXAxis: root.querySelector<SVGGElement>('[data-chart-xaxis]'),
    chartBuffer: root.querySelector<SVGRectElement>('[data-chart-buffer]'),
    chartArea: root.querySelector<SVGPathElement>('[data-chart-area]'),
    chartMega: root.querySelector<SVGPathElement>('[data-chart-mega]'),
    chartTarget: root.querySelector<SVGPathElement>('[data-chart-target]'),
    chartFinishGroup: root.querySelector<SVGGElement>('[data-chart-finish-group]'),
    chartFinishLine: root.querySelector<SVGLineElement>('[data-chart-finish-line]'),
    chartFinishLabel: root.querySelector<SVGTextElement>('[data-chart-finish-label]'),
    chartCursorLine: root.querySelector<SVGLineElement>('[data-chart-cursor-line]'),
    chartCursorTarget: root.querySelector<SVGCircleElement>('[data-chart-cursor-target]'),
    chartCursorMega: root.querySelector<SVGCircleElement>('[data-chart-cursor-mega]'),
    chartLegendMega: root.querySelector<HTMLElement>('[data-legend-mega]'),
    chartTitle: root.querySelector<HTMLElement>('[data-chart-title]'),
    chartSmoothNote: root.querySelector<HTMLElement>('[data-chart-smooth-note]'),
    inspectSlider: root.querySelector<HTMLInputElement>('#plan-inspect-day'),
    dayReadout: root.querySelector<HTMLElement>('[data-day-readout]'),
  };
}

export function renderChartSvg(refs: ChartDomRefs, res: PlannerResult): ChartGeometry {
  const geom = buildSvgChartGeometry(res);
  const isMin = res.input.chartUnit === 'minutes';

  if (refs.chartTitle) {
    refs.chartTitle.textContent = isMin
      ? 'Günlük çalışma süresi (dakika · yeni + tekrar)'
      : 'Günlük kart sayısı (yeni + tekrar)';
  }
  if (refs.chartLegendMega) refs.chartLegendMega.hidden = !res.input.showMega;
  if (refs.chartSmoothNote) refs.chartSmoothNote.hidden = res.input.studyDaysPerWeek === 7;

  if (refs.chartGrid) {
    refs.chartGrid.replaceChildren();
    for (const v of geom.yTicks) {
      const yy = geom.yAt(v);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(geom.pad.l));
      line.setAttribute('x2', String(geom.width - geom.pad.r));
      line.setAttribute('y1', yy.toFixed(1));
      line.setAttribute('y2', yy.toFixed(1));
      line.setAttribute('stroke', '#dde1e4');
      if (v !== 0) line.setAttribute('stroke-dasharray', '3 4');
      refs.chartGrid.appendChild(line);

      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', String(geom.pad.l - 8));
      txt.setAttribute('y', (yy + 4).toFixed(1));
      txt.setAttribute('text-anchor', 'end');
      txt.setAttribute('font-size', '12.5');
      txt.setAttribute('fill', '#596166');
      txt.textContent = isMin ? `${v} dk` : formatTrInt(v);
      refs.chartGrid.appendChild(txt);
    }
  }

  if (refs.chartXAxis) {
    refs.chartXAxis.replaceChildren();
    for (const d of geom.xTicks) {
      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', geom.xAt(d).toFixed(1));
      txt.setAttribute('y', String(geom.height - 8));
      txt.setAttribute('text-anchor', d === 1 ? 'start' : d === res.input.days ? 'end' : 'middle');
      txt.setAttribute('font-size', '12.5');
      txt.setAttribute('fill', '#596166');
      txt.textContent = `${d}. gün`;
      refs.chartXAxis.appendChild(txt);
    }
  }

  if (refs.chartBuffer) {
    if (geom.bufferRect && geom.bufferRect.width > 1) {
      refs.chartBuffer.removeAttribute('display');
      refs.chartBuffer.setAttribute('x', geom.bufferRect.x.toFixed(1));
      refs.chartBuffer.setAttribute('y', String(geom.pad.t));
      refs.chartBuffer.setAttribute('width', geom.bufferRect.width.toFixed(1));
      refs.chartBuffer.setAttribute('height', String(geom.height - geom.pad.t - geom.pad.b));
    } else {
      refs.chartBuffer.setAttribute('display', 'none');
    }
  }

  if (refs.chartArea) refs.chartArea.setAttribute('d', geom.targetAreaPath);
  if (refs.chartTarget) refs.chartTarget.setAttribute('d', geom.targetPath);
  if (refs.chartMega) {
    refs.chartMega.setAttribute('d', geom.megaPath);
    if (res.input.showMega) refs.chartMega.removeAttribute('display');
    else refs.chartMega.setAttribute('display', 'none');
  }

  if (refs.chartFinishGroup && refs.chartFinishLine && refs.chartFinishLabel) {
    if (geom.finishX !== null && res.target.finishDay !== null) {
      refs.chartFinishGroup.removeAttribute('display');
      const fx = geom.finishX.toFixed(1);
      refs.chartFinishLine.setAttribute('x1', fx);
      refs.chartFinishLine.setAttribute('x2', fx);
      refs.chartFinishLine.setAttribute('y1', String(geom.pad.t));
      refs.chartFinishLine.setAttribute('y2', String(geom.height - geom.pad.b));
      const alignRight = geom.finishX > geom.pad.l + (geom.width - geom.pad.l - geom.pad.r) * 0.35;
      refs.chartFinishLabel.setAttribute('x', (geom.finishX + (alignRight ? -6 : 6)).toFixed(1));
      refs.chartFinishLabel.setAttribute('text-anchor', alignRight ? 'end' : 'start');
      refs.chartFinishLabel.textContent = `İlk tur biter (${res.target.finishDay}. gün)`;
    } else {
      refs.chartFinishGroup.setAttribute('display', 'none');
    }
  }

  if (refs.chartSvg) {
    const scopeName = scopeDisplayLabel(res.input.scope, res.activeCourses.length);
    refs.chartSvg.setAttribute(
      'aria-label',
      `${res.input.days} gün boyunca ${scopeName} için günlük FSRS-6 ${isMin ? 'süre' : 'kart'} eğrisi. Ortalama ${formatTrInt(res.target.avgCards)} kart (${formatDurationTr(res.target.avgMinutes)}), en yoğun gün ${formatTrInt(res.target.peakCards)} kart (${res.target.peakDay}. gün).`,
    );
  }

  return geom;
}

export function renderDayInspectorDom(
  refs: ChartDomRefs,
  res: PlannerResult,
  geom: ChartGeometry,
  day: number,
  baseUtc: number,
): number {
  const clamped = Math.max(1, Math.min(res.input.days, Math.round(day)));
  const pt = res.series[clamped - 1];
  if (!pt) return clamped;

  const cx = geom.xAt(clamped).toFixed(1);
  const ty = geom.targetYAtDay(clamped).toFixed(1);
  const my = geom.megaYAtDay(clamped).toFixed(1);

  if (refs.chartCursorLine) {
    refs.chartCursorLine.setAttribute('x1', cx);
    refs.chartCursorLine.setAttribute('x2', cx);
  }
  if (refs.chartCursorTarget) {
    refs.chartCursorTarget.setAttribute('cx', cx);
    refs.chartCursorTarget.setAttribute('cy', ty);
  }
  if (refs.chartCursorMega) {
    if (res.input.showMega) {
      refs.chartCursorMega.removeAttribute('display');
      refs.chartCursorMega.setAttribute('cx', cx);
      refs.chartCursorMega.setAttribute('cy', my);
    } else {
      refs.chartCursorMega.setAttribute('display', 'none');
    }
  }

  if (refs.inspectSlider) {
    if (refs.inspectSlider.value !== String(clamped)) refs.inspectSlider.value = String(clamped);
    refs.inspectSlider.setAttribute(
      'aria-valuetext',
      `${clamped}. gün: ${formatTrInt(pt.totalCards)} kart, ${formatDurationTr(pt.minutes)}`,
    );
    syncRangeCssVars(refs.inspectSlider);
  }

  if (refs.dayReadout) {
    const dateStr = formatTrCalendarDate(baseUtc, clamped);
    const inTailBuffer = clamped > res.introWindowDays;
    const finishedBefore = res.target.finishDay !== null && clamped > res.target.finishDay;
    const phaseNote =
      finishedBefore || inTailBuffer
        ? 'yalnız tekrar'
        : pt.newCards === 0
          ? 'mola/nöbet günü · 0 yeni'
          : `${pt.newCards} yeni + ${formatTrInt(pt.reviews)} tekrar`;

    const megaPart = res.input.showMega
      ? ` · Mega deste: ${formatTrInt(pt.megaTotalCards)} kart (~${formatDurationTr(pt.megaMinutes)})`
      : '';

    refs.dayReadout.textContent = `${clamped}. gün (${dateStr}) · TusAnkiM: ${formatTrInt(pt.totalCards)} kart (${phaseNote}, ~${formatDurationTr(pt.minutes)})${megaPart}`;
  }

  return clamped;
}

export function renderRoadmapTableDom(
  roadmapBody: HTMLElement | null,
  roadmapCount: HTMLElement | null,
  res: PlannerResult,
): void {
  if (roadmapCount) {
    roadmapCount.textContent = `${res.roadmap.length} ders · ${formatTrInt(res.target.remainingCards)} kart`;
  }
  if (!roadmapBody) return;
  roadmapBody.replaceChildren();

  for (const item of res.roadmap) {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-lineLight';

    const tdCourse = document.createElement('th');
    tdCourse.scope = 'row';
    tdCourse.className = 'py-2.5 px-3 font-semibold text-ink text-left';
    tdCourse.textContent = item.course.name;

    const tdCards = document.createElement('td');
    tdCards.className = 'py-2.5 px-3 tabular-nums text-inkMuted';
    tdCards.textContent = formatTrInt(item.remainingCards);

    const tdDays = document.createElement('td');
    tdDays.className = 'py-2.5 px-3 tabular-nums text-ink whitespace-nowrap';
    tdDays.textContent = `${item.startDay}–${item.endDay}. gün`;

    const tdSupport = document.createElement('td');
    tdSupport.className = 'py-2.5 px-3 tabular-nums text-right';
    if (item.course.destekOran !== null) {
      tdSupport.className += ' font-semibold text-teal';
      tdSupport.textContent = formatTrPct(item.course.destekOran);
    } else {
      tdSupport.className += ' text-inkMuted text-xs';
      tdSupport.textContent = 'Karma';
    }

    const tdStatus = document.createElement('td');
    tdStatus.className = 'py-2.5 px-3 text-right text-xs font-semibold whitespace-nowrap';
    if (item.finishesBeforeExam) {
      tdStatus.className += ' text-gradeGood';
      tdStatus.textContent = `${item.activeDays} aktif gün`;
    } else {
      tdStatus.className += ' text-gradeAgain';
      tdStatus.textContent = 'Sınava yetişmez';
    }

    tr.append(tdCourse, tdCards, tdDays, tdSupport, tdStatus);
    roadmapBody.appendChild(tr);
  }
}

function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    const exec = Reflect.get(document, 'execCommand');
    return typeof exec === 'function' ? Boolean(exec.call(document, 'copy')) : false;
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export function bindActionFeedback(
  root: HTMLElement,
  getResult: () => PlannerResult,
  baseUtc: number,
): void {
  const timers = new WeakMap<HTMLButtonElement, number>();
  let lastAnnouncement = '';

  function showTip(button: HTMLButtonElement, ok: boolean, fallbackLabel = 'Tamamlandı'): void {
    const tip = button.nextElementSibling as HTMLElement | null;
    if (!tip) return;
    window.clearTimeout(timers.get(button));
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    const okLabel = button.dataset.copyOk || fallbackLabel;
    let msg = ok ? okLabel : 'İşlem tamamlanamadı';
    if (msg === lastAnnouncement) msg += '\u00A0';
    lastAnnouncement = msg;
    tip.textContent = '';
    void button.offsetWidth;
    button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
    requestAnimationFrame(() => {
      tip.textContent = msg;
    });
    timers.set(
      button,
      window.setTimeout(() => {
        button.removeAttribute('data-copied');
        button.removeAttribute('data-failed');
        tip.textContent = '';
      }, 2200),
    );
  }

  async function executeCopy(button: HTMLButtonElement, target: HTMLElement): Promise<void> {
    const text = (target.textContent ?? '').trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!legacyCopy(text)) {
        throw new Error('Copy unsupported');
      }
      showTip(button, true, 'Kopyalandı');
    } catch {
      showTip(button, legacyCopy(text), 'Kopyalandı');
    }
  }

  // Register only ONE of native Invoker Commands or click fallback so clicks never double-fire.
  if ('CommandEvent' in window) {
    root.addEventListener(
      'command',
      (ev) => {
        const cmdEv = ev as Event & { command?: string; source?: Element | null };
        if (cmdEv.command !== '--copy') return;
        const btn = cmdEv.source instanceof HTMLButtonElement ? cmdEv.source : null;
        const target = ev.target instanceof HTMLElement ? ev.target : null;
        if (btn && target && root.contains(btn)) {
          void executeCopy(btn, target);
        }
      },
      true,
    );
  } else {
    root.addEventListener('click', (ev) => {
      const btn = (ev.target as Element | null)?.closest<HTMLButtonElement>('button[command="--copy"]');
      if (!btn) return;
      const targetId = btn.getAttribute('commandfor');
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) void executeCopy(btn, target);
    });
  }

  // Offline .ics calendar milestone download
  const icsBtn = root.querySelector<HTMLButtonElement>('[data-download-ics]');
  icsBtn?.addEventListener('click', () => {
    try {
      const icsText = buildPlannerIcs(getResult(), baseUtc);
      const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tusankim-calisma-plani.ics';
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showTip(icsBtn, true, 'Takvim dosyası indirildi');
    } catch {
      showTip(icsBtn, false);
    }
  });
}
