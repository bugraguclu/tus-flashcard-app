import type { DemoDeckChoice } from './demoControls';
import { demoButton, demoElement, demoIcon } from './demoDeckViews';

/** The home sandbox uses the same deck-list rows and columns as the larger tablet demo. */
export function renderDemoDeckList(options: {
  root: HTMLElement;
  decks: DemoDeckChoice[];
  expanded: Set<string>;
  counts: (id: string) => { new: number; learning: number; review: number };
  select: (id: string) => void;
}) {
  const { root, decks, expanded, counts, select } = options;
  const list = root.querySelector<HTMLElement>('[data-demo-deck-rows]')!;
  list.replaceChildren();
  for (const deck of decks.filter((deck) => !deck.isAll)) {
    let parent = deck.parentId;
    let visible = true;
    while (parent) {
      if (!expanded.has(parent)) visible = false;
      parent = decks.find((item) => item.id === parent)?.parentId;
    }
    if (!visible) continue;
    const row = demoElement('div', '', 'demo-deck-row');
    row.dataset.deckRow = deck.id;
    row.style.setProperty('--depth', String(deck.depth ?? 0));
    if (decks.some((item) => item.parentId === deck.id)) {
      const toggle = demoButton('', () => {
        expanded.has(deck.id) ? expanded.delete(deck.id) : expanded.add(deck.id);
        renderDemoDeckList(options);
        list.querySelector<HTMLButtonElement>(`[data-demo-toggle="${deck.id}"]`)?.focus({ preventScroll: true });
      }, 'demo-deck-toggle');
      toggle.dataset.demoToggle = deck.id;
      toggle.setAttribute('aria-label', `${deck.title} alt destelerini aç veya kapat`);
      toggle.setAttribute('aria-expanded', String(expanded.has(deck.id)));
      const chevron = demoIcon(root, 'chevron-down'); chevron.classList.add('demo-chevron');
      toggle.append(chevron); row.append(toggle);
    } else {
      const spacer = demoElement('span', '', 'demo-deck-leaf-spacer'); spacer.setAttribute('aria-hidden', 'true');
      spacer.append(demoElement('span')); row.append(spacer);
    }
    const study = demoButton('', () => select(deck.id), 'demo-deck-study-btn');
    study.dataset.demoStudy = deck.id;
    study.setAttribute('aria-label', `${deck.title} destesini çalış`);
    study.append(demoElement('span', deck.title, 'demo-deck-title'));
    const totals = demoElement('span', '', 'demo-deck-counts');
    const values = counts(deck.id);
    for (const [column, value, color] of [['new', values.new, 'text-gradeEasy'], ['learn', values.learning, 'text-gradeHard'], ['review', values.review, 'text-gradeGood']] as const) {
      const count = demoElement('span', String(value), `demo-col-${column} ${value ? color : 'text-inkMuted'}`);
      count.setAttribute(`data-count-${column}`, deck.id); totals.append(count);
    }
    study.append(totals); row.append(study); list.append(row);
  }
}
