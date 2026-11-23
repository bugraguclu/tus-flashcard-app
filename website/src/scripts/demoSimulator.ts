type Part =
  | { type: 'text'; value: string }
  | { type: 'cloze'; index: number; answer: string; hint?: string };

type Bucket = 'new' | 'learning' | 'review';
type CardState = Bucket | 'done';
type Grade = 'again' | 'hard' | 'good' | 'easy';

interface DeckNode {
  id: string;
  title: string;
  parentId: string | null;
  expanded?: boolean;
  children: DeckNode[];
}

interface Card {
  id: string;
  deckId: string;
  course: string;
  ders: string;
  topic: string;
  sinav: string;
  qid: string;
  verifiedLabel: string;
  olculenBilgi: string;
  cardId: string;
  activeCloze: number;
  parts: Part[];
  extra: string;
  initialBucket: Bucket;
  intervals: { again: string; hard: string; good: string; easy: string };
}

interface Payload {
  decks: DeckNode[];
  cards: Card[];
}

interface UndoSnapshot {
  queue: string[];
  states: Map<string, CardState>;
  reviewedToday: number;
}

const LEARNING_INTERVALS = {
  again: '1 dk',
  hard: '6 dk',
  good: '10 dk',
  easy: '4 gün',
} as const;

export function initDemoSimulators(): void {
  document.querySelectorAll<HTMLElement>('[data-demo-simulator]').forEach((root) => {
    if (root.dataset.demoReady === '1') return;
    root.dataset.demoReady = '1';

    // The cards come from a separate JSON file so the home page's HTML stays small; the deck list
    // is already in the markup. A failed load offers a retry instead of a dead simulator.
    const retryBtn = root.querySelector<HTMLButtonElement>('[data-demo-retry]');
    const load = async () => {
      if (retryBtn) retryBtn.hidden = true;
      try {
        const response = await fetch(root.dataset.decksUrl!);
        if (!response.ok) throw new Error(String(response.status));
        setupDemoSimulator(root, (await response.json()) as Payload);
      } catch {
        if (retryBtn) retryBtn.hidden = false;
      }
    };
    retryBtn?.addEventListener('click', () => void load());
    void load();
  });
}

function setupDemoSimulator(root: HTMLElement, payload: Payload): void {
  {

    const decksScreen = root.querySelector<HTMLElement>('[data-demo-screen="decks"]');
    const studyScreen = root.querySelector<HTMLElement>('[data-demo-screen="study"]');
    const statusBarEl = root.querySelector<HTMLElement>('[data-demo-statusbar]');
    const homeBarEl = root.querySelector<HTMLElement>('[data-demo-homebar]');
    const resetBtn = root.querySelector<HTMLButtonElement>('[data-demo-reset]');
    const backBtn = root.querySelector<HTMLButtonElement>('[data-demo-back]');
    const scopeBtn = root.querySelector<HTMLButtonElement>('[data-demo-scope]');
    const undoBtn = root.querySelector<HTMLButtonElement>('[data-demo-undo]');
    const deckTitleEl = root.querySelector<HTMLElement>('[data-demo-deck-title]');
    const scopeNewEl = root.querySelector<HTMLElement>('[data-scope-new]');
    const scopeLearnEl = root.querySelector<HTMLElement>('[data-scope-learn]');
    const scopeReviewEl = root.querySelector<HTMLElement>('[data-scope-review]');
    const activeStage = root.querySelector<HTMLElement>('[data-demo-active-stage]');
    const completeStage = root.querySelector<HTMLElement>('[data-demo-complete-stage]');
    const completeDescEl = root.querySelector<HTMLElement>('[data-demo-complete-desc]');
    const completeSubEl = root.querySelector<HTMLElement>('[data-demo-complete-sub]');
    const completeBackBtn = root.querySelector<HTMLButtonElement>('[data-demo-complete-back]');
    const completeReplayBtn = root.querySelector<HTMLButtonElement>('[data-demo-complete-replay]');
    const crumbCourseEl = root.querySelector<HTMLElement>('[data-demo-crumb-course]');
    const crumbTopicEl = root.querySelector<HTMLElement>('[data-demo-crumb-topic]');
    const streakCountEl = root.querySelector<HTMLElement>('[data-demo-streak-count]');
    const cardBodyEl = root.querySelector<HTMLElement>('[data-demo-card-body]');
    const cardBackEl = root.querySelector<HTMLElement>('[data-demo-card-back]');
    const extraWrapEl = root.querySelector<HTMLElement>('[data-demo-extra-wrap]');
    const extraEl = root.querySelector<HTMLElement>('[data-demo-extra]');
    const measuredEl = root.querySelector<HTMLElement>('[data-demo-measured]');
    const refLinkEl = root.querySelector<HTMLAnchorElement>('[data-demo-ref-link]');
    const answerBarEl = root.querySelector<HTMLElement>('[data-demo-answer-bar]');
    const revealWrapEl = root.querySelector<HTMLElement>('[data-demo-reveal-wrap]');
    const revealBtn = root.querySelector<HTMLButtonElement>('[data-demo-reveal]');
    const gradesWrapEl = root.querySelector<HTMLElement>('[data-demo-grades]');
    const gradeBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-demo-grade]')];
    const intAgainEl = root.querySelector<HTMLElement>('[data-int-again]');
    const intHardEl = root.querySelector<HTMLElement>('[data-int-hard]');
    const intGoodEl = root.querySelector<HTMLElement>('[data-int-good]');
    const intEasyEl = root.querySelector<HTMLElement>('[data-int-easy]');
    const liveEl = root.querySelector<HTMLElement>('[data-demo-live]');

    const cardById = new Map<string, Card>();
    for (const card of payload.cards) {
      cardById.set(card.id, card);
    }

    interface DeckMeta {
      id: string;
      title: string;
      parentId: string | null;
      leafIds: string[];
      ancestorIds: string[];
    }

    const deckMetaMap = new Map<string, DeckMeta>();
    const expandedMap = new Map<string, boolean>();

    function collectLeaves(node: DeckNode, ancestors: string[]): string[] {
      const hasChildren = node.children.length > 0;
      if (hasChildren) {
        expandedMap.set(node.id, node.expanded ?? true);
      }
      const nextAncestors = [...ancestors, node.id];
      const leafIds = hasChildren
        ? node.children.flatMap((child) => collectLeaves(child, nextAncestors))
        : [node.id];

      deckMetaMap.set(node.id, {
        id: node.id,
        title: node.title,
        parentId: node.parentId,
        leafIds,
        ancestorIds: ancestors,
      });
      return leafIds;
    }

    for (const top of payload.decks) {
      collectLeaves(top, []);
    }

    const cardStates = new Map<string, CardState>();
    for (const card of payload.cards) {
      cardStates.set(card.id, card.initialBucket);
    }

    let currentScreen: 'decks' | 'study' = 'decks';
    let activeDeckId: string | null = null;
    let queue: string[] = [];
    let revealed = false;
    let reviewedToday = 0;
    const undoStack: UndoSnapshot[] = [];

    function announce(msg: string) {
      if (liveEl) liveEl.textContent = msg;
    }

    function syncChromeSurface(screen: 'decks' | 'study') {
      const isStudy = screen === 'study';
      for (const el of [statusBarEl, homeBarEl]) {
        if (!el) continue;
        el.classList.toggle('bg-white', !isStudy);
        el.classList.toggle('bg-surface', isStudy);
      }
    }

    function getCountsForLeafSet(leafSet: Set<string>): { new: number; learning: number; review: number } {
      const counts = { new: 0, learning: 0, review: 0 };
      for (const card of payload.cards) {
        if (!leafSet.has(card.deckId)) continue;
        const st = cardStates.get(card.id) ?? card.initialBucket;
        if (st === 'new') counts.new += 1;
        else if (st === 'learning') counts.learning += 1;
        else if (st === 'review') counts.review += 1;
      }
      return counts;
    }

    function renderDeckCounts() {
      for (const [deckId, meta] of deckMetaMap.entries()) {
        const counts = getCountsForLeafSet(new Set(meta.leafIds));
        const newEl = root.querySelector<HTMLElement>(`[data-count-new="${deckId}"]`);
        const learnEl = root.querySelector<HTMLElement>(`[data-count-learn="${deckId}"]`);
        const reviewEl = root.querySelector<HTMLElement>(`[data-count-review="${deckId}"]`);

        if (newEl) {
          newEl.textContent = String(counts.new);
          newEl.classList.toggle('text-gradeEasy', counts.new > 0);
          newEl.classList.toggle('text-inkMuted', counts.new === 0);
        }
        if (learnEl) {
          learnEl.textContent = String(counts.learning);
          learnEl.classList.toggle('text-gradeHard', counts.learning > 0);
          learnEl.classList.toggle('text-inkMuted', counts.learning === 0);
        }
        if (reviewEl) {
          reviewEl.textContent = String(counts.review);
          reviewEl.classList.toggle('text-gradeGood', counts.review > 0);
          reviewEl.classList.toggle('text-inkMuted', counts.review === 0);
        }
      }
    }

    function renderTreeVisibility() {
      for (const [deckId, meta] of deckMetaMap.entries()) {
        const rowEl = root.querySelector<HTMLElement>(`[data-deck-row="${deckId}"]`);
        if (rowEl) {
          const visible = meta.ancestorIds.every((ancId) => expandedMap.get(ancId) !== false);
          rowEl.hidden = !visible;
        }
        const toggleBtn = root.querySelector<HTMLButtonElement>(`[data-demo-toggle="${deckId}"]`);
        if (toggleBtn) {
          const isOpen = expandedMap.get(deckId) !== false;
          toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      }
    }

    function renderStudy() {
      if (!activeDeckId) return;
      const deckMeta = deckMetaMap.get(activeDeckId);
      if (!deckMeta) return;

      const leafSet = new Set(deckMeta.leafIds);
      const counts = getCountsForLeafSet(leafSet);
      const currentCardId = queue[0];
      const card = currentCardId ? cardById.get(currentCardId) : undefined;
      const currentBucket = card ? cardStates.get(card.id) ?? card.initialBucket : null;

      if (deckTitleEl) deckTitleEl.textContent = deckMeta.title;
      if (streakCountEl) streakCountEl.textContent = String(reviewedToday);
      if (undoBtn) undoBtn.disabled = undoStack.length === 0;

      if (scopeNewEl) {
        scopeNewEl.textContent = String(counts.new);
        scopeNewEl.classList.toggle('text-gradeEasy', counts.new > 0 || currentBucket === 'new');
        scopeNewEl.classList.toggle('text-inkMuted', counts.new === 0 && currentBucket !== 'new');
        scopeNewEl.classList.toggle('underline', currentBucket === 'new');
        scopeNewEl.classList.toggle('underline-offset-2', currentBucket === 'new');
      }
      if (scopeLearnEl) {
        scopeLearnEl.textContent = String(counts.learning);
        scopeLearnEl.classList.toggle('text-gradeHard', counts.learning > 0 || currentBucket === 'learning');
        scopeLearnEl.classList.toggle('text-inkMuted', counts.learning === 0 && currentBucket !== 'learning');
        scopeLearnEl.classList.toggle('underline', currentBucket === 'learning');
        scopeLearnEl.classList.toggle('underline-offset-2', currentBucket === 'learning');
      }
      if (scopeReviewEl) {
        scopeReviewEl.textContent = String(counts.review);
        scopeReviewEl.classList.toggle('text-gradeGood', counts.review > 0 || currentBucket === 'review');
        scopeReviewEl.classList.toggle('text-inkMuted', counts.review === 0 && currentBucket !== 'review');
        scopeReviewEl.classList.toggle('underline', currentBucket === 'review');
        scopeReviewEl.classList.toggle('underline-offset-2', currentBucket === 'review');
      }

      if (!card) {
        if (activeStage) activeStage.hidden = true;
        if (completeStage) completeStage.hidden = false;
        if (answerBarEl) answerBarEl.hidden = true;
        if (completeDescEl) {
          completeDescEl.textContent = `“${deckMeta.title}” destesi için bugünlük tüm kartlar tamamlandı.`;
        }
        if (completeSubEl) {
          completeSubEl.textContent = `Bugün bu denemede ${reviewedToday} kart değerlendirdin.`;
        }
        return;
      }

      if (activeStage) activeStage.hidden = false;
      if (completeStage) completeStage.hidden = true;
      if (answerBarEl) answerBarEl.hidden = false;

      if (crumbCourseEl) crumbCourseEl.textContent = card.course;
      if (crumbTopicEl) crumbTopicEl.textContent = card.verifiedLabel;

      if (cardBodyEl) {
        cardBodyEl.textContent = '';
        for (const part of card.parts) {
          if (part.type === 'cloze' && part.index === card.activeCloze) {
            const span = document.createElement('span');
            if (revealed) {
              span.className = 'inline bg-[#e6f4ec] text-[#156d3e] font-bold px-[0.25em] rounded-[0.35em] [box-decoration-break:clone]';
              span.textContent = part.answer;
            } else {
              span.className = 'inline bg-[rgba(29,95,166,0.12)] text-[#1d5fa6] font-bold px-[0.25em] rounded-[0.35em] [box-decoration-break:clone]';
              span.textContent = part.hint ? `[${part.hint}]` : '[…]';
            }
            cardBodyEl.appendChild(span);
          } else {
            cardBodyEl.appendChild(document.createTextNode(part.type === 'cloze' ? part.answer : part.value));
          }
        }
      }

      if (cardBackEl) cardBackEl.hidden = !revealed;
      if (extraWrapEl && extraEl) {
        if (revealed && card.extra) {
          extraEl.textContent = card.extra;
          extraWrapEl.hidden = false;
        } else {
          extraEl.textContent = '';
          extraWrapEl.hidden = true;
        }
      }
      if (measuredEl && refLinkEl) {
        measuredEl.textContent = card.olculenBilgi;
        const qNum = card.qid.split('-')[1] || card.qid;
        refLinkEl.href = `/referanslar/?sinav=${encodeURIComponent(card.sinav)}&ders=${encodeURIComponent(card.ders)}&q=${encodeURIComponent(qNum)}`;
      }

      const activeIntervals = currentBucket === 'learning' ? LEARNING_INTERVALS : card.intervals;
      if (intAgainEl) intAgainEl.textContent = activeIntervals.again;
      if (intHardEl) intHardEl.textContent = activeIntervals.hard;
      if (intGoodEl) intGoodEl.textContent = activeIntervals.good;
      if (intEasyEl) intEasyEl.textContent = activeIntervals.easy;

      if (revealWrapEl) revealWrapEl.hidden = revealed;
      if (gradesWrapEl) gradesWrapEl.hidden = !revealed;
    }

    function openDeck(deckId: string, { focusStudy = true } = {}) {
      const meta = deckMetaMap.get(deckId);
      if (!meta) return;

      undoStack.length = 0;
      const leafSet = new Set(meta.leafIds);
      activeDeckId = deckId;
      queue = payload.cards
        .filter((c) => leafSet.has(c.deckId) && (cardStates.get(c.id) ?? c.initialBucket) !== 'done')
        .map((c) => c.id);
      revealed = false;
      currentScreen = 'study';

      if (decksScreen) decksScreen.hidden = true;
      if (studyScreen) studyScreen.hidden = false;
      syncChromeSurface('study');

      renderStudy();
      announce(`${meta.title} destesi açıldı. ${queue.length} kart çalışılmayı bekliyor.`);

      if (focusStudy) {
        if (queue.length > 0) {
          revealBtn?.focus({ preventScroll: true });
        } else {
          completeBackBtn?.focus({ preventScroll: true });
        }
      }
    }

    function returnToDecks({ moveFocus = true } = {}) {
      const prevDeckId = activeDeckId;
      undoStack.length = 0;
      currentScreen = 'decks';
      revealed = false;

      renderDeckCounts();
      renderTreeVisibility();
      if (studyScreen) studyScreen.hidden = true;
      if (decksScreen) decksScreen.hidden = false;
      syncChromeSurface('decks');

      announce('Deste seçimi ekranına dönüldü.');
      if (moveFocus && prevDeckId) {
        const targetBtn = root.querySelector<HTMLButtonElement>(`[data-demo-study="${prevDeckId}"]`);
        targetBtn?.focus({ preventScroll: true });
      }
    }

    function reveal({ moveFocus = false } = {}) {
      if (currentScreen !== 'study' || revealed || !queue.length) return;
      const wasRevealFocused = Boolean(revealWrapEl && document.activeElement && revealWrapEl.contains(document.activeElement));
      const card = cardById.get(queue[0]);
      revealed = true;
      renderStudy();

      if (moveFocus || wasRevealFocused) {
        const goodBtn = root.querySelector<HTMLButtonElement>('[data-demo-grade="good"]') || gradeBtns[0];
        goodBtn?.focus({ preventScroll: true });
      }
      if (card) {
        announce(`${card.course} kartının cevabı açıldı. 1–4 tuşlarıyla veya düğmelerle değerlendir.`);
      }
    }

    function grade(rating: Grade, { moveFocus = false } = {}) {
      if (currentScreen !== 'study' || !revealed || !queue.length) return;
      const wasGradeFocused = Boolean(gradesWrapEl && document.activeElement && gradesWrapEl.contains(document.activeElement));
      const currentId = queue[0];
      const card = cardById.get(currentId);
      if (!card) return;

      undoStack.push({
        queue: [...queue],
        states: new Map(cardStates),
        reviewedToday,
      });

      const rest = queue.slice(1);
      if (rating === 'again') {
        cardStates.set(currentId, 'learning');
        const insertAt = Math.min(2, rest.length);
        rest.splice(insertAt, 0, currentId);
        queue = rest;
      } else {
        cardStates.set(currentId, 'done');
        queue = rest;
      }

      reviewedToday += 1;
      revealed = false;
      renderStudy();

      const gradeNames: Record<Grade, string> = {
        again: 'Tekrar',
        hard: 'Zor',
        good: 'İyi',
        easy: 'Kolay',
      };
      announce(`${card.course} kartı "${gradeNames[rating]}" olarak kaydedildi.`);

      if (moveFocus || wasGradeFocused) {
        if (queue.length > 0) {
          revealBtn?.focus({ preventScroll: true });
        } else {
          completeBackBtn?.focus({ preventScroll: true });
        }
      }
    }

    function undo() {
      if (currentScreen !== 'study' || !undoStack.length) return;
      const prev = undoStack.pop()!;
      queue = prev.queue;
      for (const [k, v] of prev.states.entries()) {
        cardStates.set(k, v);
      }
      reviewedToday = prev.reviewedToday;
      revealed = false;
      renderStudy();
      announce('Son değerlendirme geri alındı.');
      revealBtn?.focus({ preventScroll: true });
    }

    function replayActiveDeck() {
      if (!activeDeckId) return;
      const meta = deckMetaMap.get(activeDeckId);
      if (!meta) return;
      const leafSet = new Set(meta.leafIds);
      for (const card of payload.cards) {
        if (leafSet.has(card.deckId)) {
          cardStates.set(card.id, card.initialBucket);
        }
      }
      undoStack.length = 0;
      openDeck(activeDeckId, { focusStudy: true });
    }

    function resetAllDemo() {
      for (const card of payload.cards) {
        cardStates.set(card.id, card.initialBucket);
      }
      reviewedToday = 0;
      undoStack.length = 0;
      for (const [id] of expandedMap.entries()) {
        expandedMap.set(id, true);
      }
      renderDeckCounts();
      renderTreeVisibility();
      announce('Deneme desteleri ve kart sayaçları sıfırlandı.');
    }

    root.querySelectorAll<HTMLButtonElement>('[data-demo-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deckId = btn.dataset.demoToggle;
        if (!deckId) return;
        const next = expandedMap.get(deckId) === false;
        expandedMap.set(deckId, next);
        renderTreeVisibility();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-demo-study]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deckId = btn.dataset.demoStudy;
        if (deckId) openDeck(deckId, { focusStudy: true });
      });
    });

    resetBtn?.addEventListener('click', () => resetAllDemo());
    backBtn?.addEventListener('click', () => returnToDecks({ moveFocus: true }));
    scopeBtn?.addEventListener('click', () => returnToDecks({ moveFocus: true }));
    completeBackBtn?.addEventListener('click', () => returnToDecks({ moveFocus: true }));
    completeReplayBtn?.addEventListener('click', () => replayActiveDeck());
    undoBtn?.addEventListener('click', () => undo());

    revealBtn?.addEventListener('click', (e) => {
      reveal({ moveFocus: e.detail === 0 });
    });

    gradeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const g = btn.dataset.demoGrade as Grade | undefined;
        if (g) grade(g, { moveFocus: e.detail === 0 });
      });
    });

    studyScreen?.addEventListener('click', (e) => {
      if (currentScreen !== 'study') return;
      const target = e.target as Element | null;
      if (!target) return;
      const interactive = target.closest('button, a, input, select, textarea, [tabindex]');
      if (!interactive || interactive === studyScreen) {
        studyScreen.focus({ preventScroll: true });
      }
    });

    root.addEventListener('keydown', (e) => {
      if (currentScreen !== 'study') return;
      const active = document.activeElement as HTMLElement | null;
      const tag = (active?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        returnToDecks({ moveFocus: true });
        return;
      }

      if (e.key === ' ' && !revealed && queue.length > 0) {
        const onOtherInteractive = Boolean(
          active &&
          active !== studyScreen &&
          active !== revealBtn &&
          active.closest('button, a[href], [role="button"], summary')
        );
        if (!onOtherInteractive && active !== revealBtn && root.contains(active)) {
          e.preventDefault();
          reveal({ moveFocus: true });
        }
        return;
      }

      if (revealed && queue.length > 0) {
        const keyMap: Record<string, Grade> = {
          '1': 'again',
          '2': 'hard',
          '3': 'good',
          '4': 'easy',
        };
        const mapped = keyMap[e.key];
        if (mapped) {
          e.preventDefault();
          grade(mapped, { moveFocus: true });
        }
      }
    });

    renderDeckCounts();
    renderTreeVisibility();
  }
}
