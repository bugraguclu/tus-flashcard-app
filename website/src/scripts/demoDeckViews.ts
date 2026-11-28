import type { DemoDeckChoice } from './demoControls';
import { deckContains } from './demoDeckTree';

export function demoElement<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

export function demoButton(text: string, action: () => void, className = 'demo-tool-button') {
  const node = demoElement('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function demoIcon(root: HTMLElement, name: string): SVGElement {
  const template = root.querySelector<HTMLTemplateElement>(`[data-demo-icon="${name}"]`)!;
  return template.content.firstElementChild!.cloneNode(true) as SVGElement;
}

export function renderDemoDeckTree(options: {
  root: HTMLElement;
  list: HTMLElement;
  decks: DemoDeckChoice[];
  selected: string;
  expanded: Set<string>;
  select: (id: string) => void;
  query?: string;
  sidebar?: boolean;
}) {
  const { root, list, decks, selected, expanded, select, sidebar = false } = options;
  const query = options.query?.trim().toLocaleLowerCase('tr') ?? '';
  list.replaceChildren();
  const visible = new Set<string>();
  if (query) {
    for (const deck of decks) {
      const path = [deck.title];
      let item = deck;
      while (item.parentId) {
        item = decks.find((parent) => parent.id === item.parentId)!;
        if (!item) break;
        path.unshift(item.title);
      }
      if (!path.join(' ').toLocaleLowerCase('tr').includes(query)) continue;
      visible.add(deck.id);
      let parent = deck.parentId;
      while (parent) { visible.add(parent); parent = decks.find((item) => item.id === parent)?.parentId; }
    }
  }
  function append(parentId?: string | null) {
    const children = decks.filter((deck) => !deck.isAll && (deck.parentId ?? null) === (parentId ?? null));
    // The app prioritizes the active path when opening its picker. The sidebar keeps deck order.
    if (!sidebar) children.sort((a, b) => Number(deckContains(decks, b.id, selected)) - Number(deckContains(decks, a.id, selected)));
    for (const deck of children) {
      if (query && !visible.has(deck.id)) continue;
      const hasChildren = decks.some((item) => item.parentId === deck.id);
      const isExpanded = Boolean(query) || expanded.has(deck.id);
      const row = demoElement('div', '', sidebar ? 'demo-sidebar-row' : 'demo-picker-row');
      row.style.setProperty('--deck-depth', String(deck.depth ?? 0));
      row.dataset.deckId = deck.id;
      if (sidebar && !deck.parentId) row.classList.add('demo-sidebar-root');
      if (hasChildren) {
        const toggle = demoButton('', () => {
          expanded.has(deck.id) ? expanded.delete(deck.id) : expanded.add(deck.id);
          renderDemoDeckTree(options);
          list.querySelector<HTMLButtonElement>(`[data-deck-id="${deck.id}"] .demo-picker-toggle`)?.focus({ preventScroll: true });
        }, 'demo-picker-toggle');
        toggle.append(demoIcon(root, 'chevron-down'));
        toggle.setAttribute('aria-label', `${deck.title} alt destelerini ${isExpanded ? 'gizle' : 'göster'}`);
        toggle.setAttribute('aria-expanded', String(isExpanded));
        // Search shows every matching branch, as the app does, independent of stored expansion.
        toggle.disabled = Boolean(query);
        row.append(toggle);
      } else row.append(demoElement('span', '', 'demo-picker-spacer'));
      const active = selected === deck.id;
      const option = demoButton('', () => select(deck.id), sidebar ? 'demo-sidebar-option' : 'demo-picker-option');
      option.setAttribute('aria-label', deck.title);
      if (sidebar) {
        if (active) { row.classList.add('is-active'); option.setAttribute('aria-current', 'true'); }
        const icon = demoElement('span', '', 'demo-sidebar-deck-icon');
        icon.append(demoIcon(root, deck.parentId ? 'folder' : 'deck'));
        option.append(icon, demoElement('span', deck.title), demoElement('small', String(deck.cardCount ?? 0)));
      } else {
        option.setAttribute('role', 'radio');
        option.setAttribute('aria-checked', String(active));
        option.append(demoElement('span', deck.title));
        if (active) { const mark = demoIcon(root, 'check'); mark.classList.add('demo-picker-selected'); option.append(mark); }
      }
      row.append(option); list.append(row);
      if (hasChildren && isExpanded) append(deck.id);
    }
  }
  const all = decks.find((deck) => deck.isAll);
  if (all && !query && !sidebar) {
    const option = demoButton('', () => select(all.id), 'demo-picker-option demo-picker-all');
    option.setAttribute('role', 'radio'); option.setAttribute('aria-checked', String(selected === all.id));
    option.append(demoIcon(root, 'cards'), demoElement('span', all.title));
    if (selected === all.id) { const mark = demoIcon(root, 'check'); mark.classList.add('demo-picker-selected'); option.append(mark); }
    list.append(option);
  }
  append();
  if (!list.children.length) list.append(demoElement('p', 'Eşleşen deste bulunamadı.', 'demo-tool-muted'));
}
