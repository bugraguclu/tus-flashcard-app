import {
  ALL_COURSE_IDS,
  DEFAULT_PLANNER_INPUT,
  MEGA_DECK_CARDS,
  PLANNER_EXAMS,
  PLANNER_LIMITS,
  PLANNER_PRESETS,
  buildShareSummaryText,
  buildSvgChartGeometry,
  clampPlannerInput,
  daysBetweenUtc,
  daysUntilExamIso,
  decodePlannerQuery,
  encodePlannerQuery,
  formatDurationTr,
  formatIsoDateUtc,
  formatTrCalendarDate,
  formatTrCalendarDateWithWeekday,
  formatTrInt,
  formatTrPct,
  parseIsoCalendarUtcMs,
  runPlanner,
  todayUtcMs,
  type ChartUnit,
  type CourseOrder,
  type PlannerInput,
  type PlannerResult,
  type PlannerRetention,
  type PlannerScope,
  type StudyDaysPerWeek,
} from './studyPlanner';
import {
  bindActionFeedback,
  queryChartRefs,
  renderChartSvg,
  renderDayInspectorDom,
  renderRoadmapTableDom,
  syncRangeCssVars,
} from './studyPlannerDom';

export function initStudyPlanner(): void {
  const roots = document.querySelectorAll<HTMLElement>('[data-study-planner]');
  roots.forEach((root) => {
    if (root.dataset.plannerReady === '1') return;
    root.dataset.plannerReady = '1';
    mountPlanner(root);
  });
}

function mountPlanner(root: HTMLElement): void {
  const baseUtc = todayUtcMs();

  // Form & controls
  const form = root.querySelector<HTMLFormElement>('[data-planner-form]');
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset-btn]')];
  const examQuickBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-exam-quick]')];
  const modeRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-mode"]')];
  const scopeRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-scope"]')];
  const courseCheckboxes = [...root.querySelectorAll<HTMLInputElement>('[data-course-check]')];
  const coursePickerWrap = root.querySelector<HTMLElement>('[data-course-picker]');
  const courseSelectAllBtn = root.querySelector<HTMLButtonElement>('[data-courses-all]');
  const courseSelectTemelBtn = root.querySelector<HTMLButtonElement>('[data-courses-temel]');
  const courseSelectKlinikBtn = root.querySelector<HTMLButtonElement>('[data-courses-klinik]');

  const daysSlider = root.querySelector<HTMLInputElement>('#plan-days');
  const daysVal = root.querySelector<HTMLElement>('[data-days-val]');
  const examDateInput = root.querySelector<HTMLInputElement>('#plan-exam-date');
  const examDateHint = root.querySelector<HTMLElement>('[data-exam-date-hint]');

  const paceBlock = root.querySelector<HTMLElement>('[data-pace-block]');
  const budgetBlock = root.querySelector<HTMLElement>('[data-budget-block]');
  const paceSlider = root.querySelector<HTMLInputElement>('#plan-pace');
  const paceVal = root.querySelector<HTMLElement>('[data-pace-val]');
  const recPaceBtn = root.querySelector<HTMLButtonElement>('[data-rec-pace-btn]');
  const budgetSlider = root.querySelector<HTMLInputElement>('#plan-budget');
  const budgetVal = root.querySelector<HTMLElement>('[data-budget-val]');

  const completedInput = root.querySelector<HTMLInputElement>('#plan-completed');
  const completedHint = root.querySelector<HTMLElement>('[data-completed-hint]');
  const bufferRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-buffer"]')];
  const weekRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-week"]')];
  const retentionRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-retention"]')];
  const unitRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-unit"]')];
  const orderRadios = [...root.querySelectorAll<HTMLInputElement>('input[name="plan-order"]')];
  const megaToggle = root.querySelector<HTMLInputElement>('#plan-show-mega');

  // Output regions
  const verdictBox = root.querySelector<HTMLElement>('[data-plan-verdict]');
  const verdictBadge = root.querySelector<HTMLElement>('[data-verdict-badge]');
  const verdictTitle = root.querySelector<HTMLElement>('[data-verdict-title]');
  const verdictDetail = root.querySelector<HTMLElement>('[data-verdict-detail]');
  const verdictFixBtn = root.querySelector<HTMLButtonElement>('[data-verdict-fix]');

  const kpiPace = root.querySelector<HTMLElement>('[data-kpi-pace]');
  const kpiFinish = root.querySelector<HTMLElement>('[data-kpi-finish]');
  const kpiAvg = root.querySelector<HTMLElement>('[data-kpi-avg]');
  const kpiAvgMin = root.querySelector<HTMLElement>('[data-kpi-avg-min]');
  const kpiPeak = root.querySelector<HTMLElement>('[data-kpi-peak]');
  const kpiPeakSub = root.querySelector<HTMLElement>('[data-kpi-peak-sub]');
  const kpiPct = root.querySelector<HTMLElement>('[data-kpi-pct]');
  const kpiMem = root.querySelector<HTMLElement>('[data-kpi-mem]');

  const chartRefs = queryChartRefs(root);

  // Comparison bars
  const cmpWrap = root.querySelector<HTMLElement>('[data-cmp-wrap]');
  const cmpTargetLabel = root.querySelector<HTMLElement>('[data-cmp-target-label]');
  const cmpTargetPct = root.querySelector<HTMLElement>('[data-cmp-target-pct]');
  const cmpTargetBar = root.querySelector<HTMLElement>('[data-cmp-target-bar]');
  const cmpTargetNote = root.querySelector<HTMLElement>('[data-cmp-target-note]');
  const cmpMegaPct = root.querySelector<HTMLElement>('[data-cmp-mega-pct]');
  const cmpMegaBar = root.querySelector<HTMLElement>('[data-cmp-mega-bar]');
  const cmpMegaNote = root.querySelector<HTMLElement>('[data-cmp-mega-note]');

  // Phase bar & roadmap
  const phaseIntroBar = root.querySelector<HTMLElement>('[data-phase-intro-bar]');
  const phaseTailBar = root.querySelector<HTMLElement>('[data-phase-tail-bar]');
  const phaseIntroLabel = root.querySelector<HTMLElement>('[data-phase-intro-label]');
  const phaseTailLabel = root.querySelector<HTMLElement>('[data-phase-tail-label]');
  const roadmapBody = root.querySelector<HTMLElement>('[data-roadmap-body]');
  const roadmapCount = root.querySelector<HTMLElement>('[data-roadmap-count]');

  // Settings & copy sources
  const setNew = root.querySelector<HTMLElement>('[data-set-new]');
  const setRet = root.querySelector<HTMLElement>('[data-set-ret]');
  const setCadence = root.querySelector<HTMLElement>('[data-set-cadence]');
  const setBuffer = root.querySelector<HTMLElement>('[data-set-buffer]');
  const copyTextSource = root.querySelector<HTMLElement>('#plan-copy-source');
  const copyLinkSource = root.querySelector<HTMLElement>('#plan-link-source');
  const liveAnnounce = root.querySelector<HTMLElement>('[data-plan-announce]');

  // Enrich live countdown badges on exam buttons & preset cards (client-only so static HTML never goes stale).
  for (const exam of PLANNER_EXAMS) {
    const dLeft = daysUntilExamIso(exam.examDateIso, baseUtc);
    if (dLeft !== null && dLeft >= PLANNER_LIMITS.minDays && dLeft <= PLANNER_LIMITS.maxDays) {
      const code = exam.id.replace('-', '/');
      root.querySelectorAll<HTMLElement>(`[data-exam-days-badge="${exam.id}"]`).forEach((el) => {
        el.textContent = el.dataset.badgeStyle === 'full' ? `${code} · ${dLeft} gün` : `${dLeft} gün`;
        el.hidden = false;
      });
    }
  }

  // Date input bounds: today + minDays .. today + maxDays
  if (examDateInput) {
    examDateInput.min = formatIsoDateUtc(baseUtc + PLANNER_LIMITS.minDays * 86_400_000);
    examDateInput.max = formatIsoDateUtc(baseUtc + PLANNER_LIMITS.maxDays * 86_400_000);
  }

  // Restore state from URL query if present; otherwise start from SSR default.
  const urlPatch = decodePlannerQuery(window.location.search);
  let state: PlannerInput = clampPlannerInput(urlPatch ? { ...DEFAULT_PLANNER_INPUT, ...urlPatch } : DEFAULT_PLANNER_INPUT);
  let currentResult: PlannerResult = runPlanner(state);
  let currentGeom = buildSvgChartGeometry(currentResult);
  let inspectDay = currentResult.target.finishDay ?? Math.round(state.days * 0.6);
  let activeFixPatch: Partial<PlannerInput> | undefined;

  function findMatchingPresetId(input: PlannerInput): string | null {
    for (const p of PLANNER_PRESETS) {
      const m = p.patch;
      if (
        input.mode === (m.mode ?? 'exam') &&
        input.scope === (m.scope ?? 'all') &&
        input.days === m.days &&
        input.newPerDay === m.newPerDay &&
        input.bufferDays === m.bufferDays &&
        input.studyDaysPerWeek === m.studyDaysPerWeek &&
        input.retention === m.retention &&
        input.completedCards === 0
      ) {
        return p.id;
      }
    }
    return null;
  }

  function resolveExamQuickDays(btn: HTMLButtonElement): number | null {
    const fixed = btn.dataset.daysFixed;
    if (fixed) return Number(fixed);
    const examIso = btn.dataset.examIso;
    if (examIso) {
      const d = daysUntilExamIso(examIso, baseUtc);
      if (d !== null) {
        return Math.max(PLANNER_LIMITS.minDays, Math.min(PLANNER_LIMITS.maxDays, d));
      }
    }
    return null;
  }

  function syncControlsFromState(): void {
    modeRadios.forEach((r) => { r.checked = r.value === state.mode; });
    scopeRadios.forEach((r) => { r.checked = r.value === state.scope; });
    bufferRadios.forEach((r) => { r.checked = Number(r.value) === state.bufferDays; });
    weekRadios.forEach((r) => { r.checked = Number(r.value) === state.studyDaysPerWeek; });
    retentionRadios.forEach((r) => { r.checked = Number(r.value) === state.retention; });
    unitRadios.forEach((r) => { r.checked = r.value === state.chartUnit; });
    orderRadios.forEach((r) => { r.checked = r.value === state.courseOrder; });
    if (megaToggle) megaToggle.checked = state.showMega;

    if (coursePickerWrap) coursePickerWrap.hidden = state.scope !== 'custom';
    const pickedSet = new Set(state.selectedCourseIds);
    courseCheckboxes.forEach((cb) => { cb.checked = pickedSet.has(cb.value); });

    if (daysSlider) {
      daysSlider.value = String(state.days);
      daysSlider.setAttribute('aria-valuetext', `${state.days} gün`);
      syncRangeCssVars(daysSlider);
    }
    if (daysVal) daysVal.textContent = `${state.days} gün`;
    if (examDateInput) examDateInput.value = formatIsoDateUtc(baseUtc + state.days * 86_400_000);
    if (examDateHint) examDateHint.textContent = `Hedef: ${formatTrCalendarDateWithWeekday(baseUtc, state.days)}`;

    if (paceBlock) paceBlock.hidden = state.mode === 'time';
    if (budgetBlock) budgetBlock.hidden = state.mode !== 'time';

    if (paceSlider) {
      paceSlider.value = String(state.newPerDay);
      paceSlider.setAttribute('aria-valuetext', `Günde ${state.newPerDay} yeni kart`);
      syncRangeCssVars(paceSlider);
    }
    if (paceVal) paceVal.textContent = `${state.newPerDay} yeni / gün`;

    if (budgetSlider) {
      budgetSlider.value = String(state.maxMinutes);
      budgetSlider.setAttribute('aria-valuetext', `Günde ${formatDurationTr(state.maxMinutes)}`);
      syncRangeCssVars(budgetSlider);
    }
    if (budgetVal) budgetVal.textContent = `${formatDurationTr(state.maxMinutes)} / gün`;

    if (completedInput) {
      completedInput.max = String(Math.max(0, currentResult.target.totalCards - 1));
      if (document.activeElement !== completedInput) {
        completedInput.value = String(state.completedCards);
      }
    }
    if (completedHint) {
      completedHint.textContent = `Kalan: ${formatTrInt(currentResult.target.remainingCards)} / ${formatTrInt(currentResult.target.totalCards)} kart`;
    }

    const activePreset = findMatchingPresetId(state);
    presetBtns.forEach((btn) => {
      const isSelected = btn.dataset.presetBtn === activePreset;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      btn.textContent = isSelected ? 'Planlayıcıda seçili' : 'Bu profili uygula';
    });

    examQuickBtns.forEach((btn) => {
      const targetDays = resolveExamQuickDays(btn);
      btn.setAttribute('aria-pressed', targetDays !== null && targetDays === state.days ? 'true' : 'false');
    });
  }

  function renderAll(announceChange: boolean): void {
    const res = runPlanner(state);
    currentResult = res;
    syncControlsFromState();

    // Recommended pace quick button
    if (recPaceBtn) {
      const rec = res.recommendedPace;
      const clampedRec = Math.min(PLANNER_LIMITS.maxPace, rec);
      const showRec =
        state.mode === 'exam' &&
        res.target.remainingCards > 0 &&
        state.newPerDay !== clampedRec &&
        rec <= PLANNER_LIMITS.maxPace;
      recPaceBtn.hidden = !showRec;
      recPaceBtn.textContent = `Önerilen: ${rec} yeni/gün`;
      recPaceBtn.dataset.recPaceValue = String(rec);
    }

    // Verdict banner
    if (verdictBox) {
      verdictBox.classList.remove('verdict-good', 'verdict-warn', 'verdict-danger');
      verdictBox.classList.add(`verdict-${res.verdict.tone}`);
    }
    if (verdictBadge) verdictBadge.textContent = res.verdict.badge;
    if (verdictTitle) verdictTitle.textContent = res.verdict.title;
    if (verdictDetail) verdictDetail.textContent = res.verdict.detail;
    activeFixPatch = res.verdict.fixAction?.patch;
    if (verdictFixBtn) {
      if (res.verdict.fixAction) {
        verdictFixBtn.hidden = false;
        verdictFixBtn.textContent = res.verdict.fixAction.label;
      } else {
        verdictFixBtn.hidden = true;
      }
    }

    // 4 primary KPIs
    if (kpiPace) kpiPace.textContent = `${res.activePace}`;
    if (kpiFinish) {
      kpiFinish.textContent =
        res.target.finishDay !== null
          ? `İlk tur ${res.target.finishDay}. gün (${formatTrCalendarDate(baseUtc, res.target.finishDay)})`
          : `Sınava ${formatTrInt(res.target.introduced)} / ${formatTrInt(res.target.remainingCards)} kart açılır`;
    }
    if (kpiAvg) kpiAvg.textContent = formatTrInt(res.target.avgCards);
    if (kpiAvgMin) kpiAvgMin.textContent = `~${formatDurationTr(res.target.avgMinutes)} / gün (yeni + tekrar)`;
    if (kpiPeak) kpiPeak.textContent = formatTrInt(res.target.peakCards);
    if (kpiPeakSub) {
      kpiPeakSub.textContent = `~${formatDurationTr(res.target.peakMinutes)} · ${res.target.peakDay}. günde tepe`;
    }
    if (kpiPct) kpiPct.textContent = formatTrPct(res.target.memorizedPct);
    if (kpiMem) {
      kpiMem.textContent = `${formatTrInt(res.target.memorized)} / ${formatTrInt(res.target.remainingCards)} kart (%${res.input.retention} FSRS-6)`;
    }

    // Chart + inspector
    currentGeom = renderChartSvg(chartRefs, res);
    if (chartRefs.inspectSlider) {
      chartRefs.inspectSlider.max = String(res.input.days);
      inspectDay = Math.max(1, Math.min(res.input.days, inspectDay));
      chartRefs.inspectSlider.value = String(inspectDay);
      syncRangeCssVars(chartRefs.inspectSlider);
    }
    inspectDay = renderDayInspectorDom(chartRefs, res, currentGeom, inspectDay, baseUtc);

    // Mega-deck comparison bars
    if (cmpWrap) cmpWrap.hidden = !res.input.showMega;
    if (cmpTargetLabel) cmpTargetLabel.textContent = `TusAnkiM · ${formatTrInt(res.target.remainingCards)} kart`;
    if (cmpTargetPct) cmpTargetPct.textContent = formatTrPct(res.target.memorizedPct);
    if (cmpTargetBar) cmpTargetBar.style.width = `${Math.min(100, res.target.memorizedPct)}%`;
    if (cmpTargetNote) {
      cmpTargetNote.textContent =
        res.target.finishDay !== null
          ? `İlk tur ${res.target.finishDay}. günde biter; son gün yük ${formatDurationTr(res.target.endDayMinutes)}.`
          : `${res.input.days} günde ${formatTrInt(res.target.introduced)} kart açılır.`;
    }
    if (cmpMegaPct) cmpMegaPct.textContent = formatTrPct(res.mega.memorizedPct);
    if (cmpMegaBar) cmpMegaBar.style.width = `${Math.min(100, res.mega.memorizedPct)}%`;
    if (cmpMegaNote) {
      cmpMegaNote.textContent =
        res.mega.finishDay !== null
          ? `İlk tur ${res.mega.finishDay}. günde biter · ortalama ${formatDurationTr(res.mega.avgMinutes)}/gün.`
          : `${res.input.days} günde ilk tur bitmez (${formatTrInt(MEGA_DECK_CARDS)} kart) · son gün ${formatDurationTr(res.mega.endDayMinutes)}.`;
    }

    // Two-phase timeline bar (synced with both finishDay and effective review-only buffer)
    const introSpan = res.target.finishDay !== null ? res.target.finishDay : res.introWindowDays;
    const tailSpan = Math.max(0, res.input.days - introSpan);
    const introPct = Math.max(4, Math.round((introSpan / res.input.days) * 100));
    const tailPct = 100 - introPct;
    const seenPct = Math.round((res.target.introduced / Math.max(1, res.target.remainingCards)) * 100);
    if (phaseIntroBar) phaseIntroBar.style.flex = `${introPct} 0 0%`;
    if (phaseTailBar) {
      phaseTailBar.style.flex = `${tailPct} 0 0%`;
      phaseTailBar.hidden = tailSpan === 0;
    }
    if (phaseIntroLabel) {
      phaseIntroLabel.textContent =
        res.target.finishDay !== null
          ? `1. Faz (Yeni + Tekrar): 1–${introSpan}. gün (${formatTrCalendarDate(baseUtc, introSpan)})`
          : `1. Faz (Yeni + Tekrar): 1–${introSpan}. gün (ilk tur %${seenPct} açılır)`;
    }
    if (phaseTailLabel) {
      phaseTailLabel.textContent =
        tailSpan > 0
          ? `2. Faz (Yalnız Tekrar + Deneme): ${introSpan + 1}–${res.input.days}. gün (${tailSpan} gün)`
          : '2. Faz (Yalnız tekrar tamponu): 0 gün';
    }

    // Course roadmap
    renderRoadmapTableDom(roadmapBody, roadmapCount, res);

    // Settings strip & copy sources
    if (setNew) setNew.textContent = `${res.settings.newPerDay} kart/gün`;
    if (setRet) setRet.textContent = `%${res.settings.retentionPct}`;
    if (setCadence) setCadence.textContent = `${res.input.studyDaysPerWeek} gün/hafta`;
    if (setBuffer) setBuffer.textContent = res.effectiveBufferDays > 0 ? `Son ${res.effectiveBufferDays} gün` : 'Yok';

    if (copyTextSource) copyTextSource.textContent = buildShareSummaryText(res, baseUtc);
    if (copyLinkSource) {
      const q = encodePlannerQuery(res.input);
      copyLinkSource.textContent = `${window.location.origin}${window.location.pathname}?${q}#calisma-plani`;
    }

    if (announceChange && liveAnnounce) {
      liveAnnounce.textContent = `Plan güncellendi: ${res.input.days} gün, günde ${res.activePace} yeni kart, ortalama ${formatTrInt(res.target.avgCards)} kart ve ${formatDurationTr(res.target.avgMinutes)}. ${res.verdict.badge}.`;
    }
  }

  function applyPatch(patch: Partial<PlannerInput>, announce = true): void {
    state = clampPlannerInput({ ...state, ...patch });
    if (patch.days !== undefined) {
      const nextPreview = runPlanner(state);
      inspectDay = nextPreview.target.finishDay ?? Math.round(state.days * 0.6);
    }
    renderAll(announce);
  }

  // Prevent form submission (respects CSP form-action 'none')
  form?.addEventListener('submit', (e) => e.preventDefault());

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PLANNER_PRESETS.find((p) => p.id === btn.dataset.presetBtn);
      if (!preset) return;
      applyPatch({ ...preset.patch, selectedCourseIds: [...ALL_COURSE_IDS] });
    });
  });

  examQuickBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = resolveExamQuickDays(btn);
      if (days === null) return;
      const patch: Partial<PlannerInput> = { days };
      if (state.mode === 'exam') {
        const preview = runPlanner({ ...state, days });
        patch.newPerDay = Math.min(PLANNER_LIMITS.maxPace, preview.recommendedPace);
      }
      applyPatch(patch);
    });
  });

  modeRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ mode: r.value === 'time' ? 'time' : 'exam' });
    });
  });

  scopeRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ scope: r.value as PlannerScope, completedCards: 0 });
    });
  });

  courseCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = courseCheckboxes.filter((c) => c.checked).map((c) => c.value);
      if (checked.length === 0) {
        cb.checked = true;
        return;
      }
      applyPatch({ scope: 'custom', selectedCourseIds: checked, completedCards: 0 });
    });
  });

  courseSelectAllBtn?.addEventListener('click', () => {
    applyPatch({ scope: 'custom', selectedCourseIds: [...ALL_COURSE_IDS], completedCards: 0 });
  });
  courseSelectTemelBtn?.addEventListener('click', () => {
    const ids = courseCheckboxes.filter((c) => c.dataset.courseGroup === 'temel').map((c) => c.value);
    applyPatch({ scope: 'custom', selectedCourseIds: ids, completedCards: 0 });
  });
  courseSelectKlinikBtn?.addEventListener('click', () => {
    const ids = courseCheckboxes.filter((c) => c.dataset.courseGroup === 'klinik').map((c) => c.value);
    applyPatch({ scope: 'custom', selectedCourseIds: ids, completedCards: 0 });
  });

  daysSlider?.addEventListener('input', () => {
    syncRangeCssVars(daysSlider);
    applyPatch({ days: Number(daysSlider.value) }, false);
  });
  daysSlider?.addEventListener('change', () => {
    applyPatch({ days: Number(daysSlider.value) }, true);
  });

  examDateInput?.addEventListener('change', () => {
    const parsed = parseIsoCalendarUtcMs(examDateInput.value);
    if (parsed === null) return;
    const diff = daysBetweenUtc(baseUtc, parsed);
    const clamped = Math.max(PLANNER_LIMITS.minDays, Math.min(PLANNER_LIMITS.maxDays, diff));
    applyPatch({ days: clamped });
  });

  paceSlider?.addEventListener('input', () => {
    syncRangeCssVars(paceSlider);
    applyPatch({ mode: 'exam', newPerDay: Number(paceSlider.value) }, false);
  });
  paceSlider?.addEventListener('change', () => {
    applyPatch({ mode: 'exam', newPerDay: Number(paceSlider.value) }, true);
  });

  recPaceBtn?.addEventListener('click', () => {
    const rec = Number(recPaceBtn.dataset.recPaceValue);
    if (Number.isFinite(rec)) applyPatch({ mode: 'exam', newPerDay: rec });
  });

  budgetSlider?.addEventListener('input', () => {
    syncRangeCssVars(budgetSlider);
    applyPatch({ mode: 'time', maxMinutes: Number(budgetSlider.value) }, false);
  });
  budgetSlider?.addEventListener('change', () => {
    applyPatch({ mode: 'time', maxMinutes: Number(budgetSlider.value) }, true);
  });

  completedInput?.addEventListener('input', () => {
    const v = Number(completedInput.value);
    if (Number.isFinite(v) && v >= 0) applyPatch({ completedCards: v }, false);
  });
  completedInput?.addEventListener('blur', () => {
    const v = Number(completedInput.value);
    applyPatch({ completedCards: Number.isFinite(v) ? v : 0 }, true);
  });

  bufferRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ bufferDays: Number(r.value) });
    });
  });
  weekRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ studyDaysPerWeek: Number(r.value) as StudyDaysPerWeek });
    });
  });
  retentionRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ retention: Number(r.value) as PlannerRetention });
    });
  });
  unitRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ chartUnit: r.value as ChartUnit });
    });
  });
  orderRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) applyPatch({ courseOrder: r.value as CourseOrder });
    });
  });
  megaToggle?.addEventListener('change', () => {
    applyPatch({ showMega: megaToggle.checked });
  });

  verdictFixBtn?.addEventListener('click', () => {
    if (activeFixPatch) applyPatch(activeFixPatch);
  });

  // Interactive Day Scrubber (slider + SVG pointer scrubbing)
  chartRefs.inspectSlider?.addEventListener('input', () => {
    inspectDay = renderDayInspectorDom(chartRefs, currentResult, currentGeom, Number(chartRefs.inspectSlider!.value), baseUtc);
  });

  if (chartRefs.chartSvg) {
    const svg = chartRefs.chartSvg;
    let dragging = false;
    const dayFromPointer = (clientX: number): number => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return inspectDay;
      const svgX = ((clientX - rect.left) / rect.width) * currentGeom.width;
      const plotW = currentGeom.width - currentGeom.pad.l - currentGeom.pad.r;
      const ratio = Math.max(0, Math.min(1, (svgX - currentGeom.pad.l) / Math.max(1, plotW)));
      return Math.round(1 + ratio * (currentResult.input.days - 1));
    };
    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      inspectDay = renderDayInspectorDom(chartRefs, currentResult, currentGeom, dayFromPointer(e.clientX), baseUtc);
    });
    svg.addEventListener('pointermove', (e) => {
      if (dragging || e.pointerType === 'mouse') {
        inspectDay = renderDayInspectorDom(chartRefs, currentResult, currentGeom, dayFromPointer(e.clientX), baseUtc);
      }
    });
    window.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  bindActionFeedback(root, () => currentResult, baseUtc);

  // Silent initial sync (fills live exam dates & restores URL query if present, never triggers aria-live on boot).
  renderAll(false);
}
