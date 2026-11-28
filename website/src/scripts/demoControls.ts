import { dialogMotion } from '../lib/dialogMotion';
import { expandedDecks } from './demoDeckTree';
import { demoElement as el, demoButton as button, demoIcon, renderDemoDeckTree } from './demoDeckViews';

export type DemoGrade = 'again' | 'hard' | 'good' | 'easy';
export interface DemoDeckChoice { id: string; title: string; depth?: number; parentId?: string | null; counts?: string; cardCount?: number; isAll?: boolean }
export interface DemoCardChoice { id: string; deckId: string; title: string }
interface Adapter {
  decks: () => DemoDeckChoice[];
  selectedDeck: () => string;
  selectDeck: (id: string) => void;
  cards: () => DemoCardChoice[];
  selectCard: (id: string) => void;
  addCard: (deckId: string, front: string, back: string) => void;
  createDeck: (name: string) => string;
  openDecks?: () => void;
}

/** Browser-only sandbox. Never writes to the visitor's app collection or localStorage. */
export function setupDemoControls(root: HTMLElement, adapter: Adapter) {
  const dialog = root.querySelector<HTMLDialogElement>('[data-demo-dialog]')!;
  const heading = dialog.querySelector<HTMLElement>('[data-demo-dialog-title]')!;
  const body = dialog.querySelector<HTMLElement>('[data-demo-dialog-body]')!;
  const leading = dialog.querySelector<HTMLElement>('[data-demo-dialog-leading]')!;
  const headerField = dialog.querySelector<HTMLElement>('[data-demo-dialog-field]')!;
  const tools = dialog.querySelector<HTMLElement>('[data-demo-dialog-tools]')!;
  const footer = dialog.querySelector<HTMLElement>('[data-demo-dialog-footer]')!;
  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-demo-dialog-close]')!;
  const motion = dialogMotion(dialog);
  const viewport = root.querySelector<HTMLElement>('.demo-viewport');
  const menus = [...root.querySelectorAll<HTMLButtonElement>('[data-demo-menu]')];
  dialog.id = `${heading.id}-dialog`;
  const syncMenus = () => menus.forEach((menu) => menu.setAttribute('aria-expanded', String(dialog.open && dialog.dataset.demoView === 'sidebar')));
  // Native modal focus/keyboard behavior, visually contained in the simulated device.
  function fitDialog() {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const gap = 8;
    const top = Math.max(gap, rect.top + gap);
    const bottom = Math.min(window.innerHeight - gap, rect.bottom - gap);
    const availableHeight = Math.max(0, bottom - top);
    const picker = dialog.dataset.demoView === 'picker';
    const sidebar = dialog.dataset.demoView === 'sidebar';
    const width = picker ? Math.min(420, rect.width - 32) : sidebar ? Math.min(292, rect.width - gap * 2) : rect.width - gap * 2;
    const height = picker ? Math.min(680, availableHeight * .86) : availableHeight;
    dialog.style.setProperty('--demo-dialog-left', `${sidebar ? rect.left + gap : rect.left + (rect.width - width) / 2}px`);
    dialog.style.setProperty('--demo-dialog-top', `${top + (availableHeight - height) / 2}px`);
    dialog.style.setProperty('--demo-dialog-width', `${width}px`);
    dialog.style.setProperty('--demo-dialog-height', `${height}px`);
  }
  if (viewport) {
    dialog.classList.add('demo-screen-dialog');
    new ResizeObserver(() => { if (dialog.open) fitDialog(); }).observe(viewport);
    window.addEventListener('resize', () => { if (dialog.open) fitDialog(); });
    window.addEventListener('scroll', () => { if (dialog.open) fitDialog(); }, { passive: true });
  }
  let opener: HTMLElement | null = null;
  let trigger: HTMLElement | null = null;
  let handleBack = () => motion.close();
  const icon = (name: string) => demoIcon(root, name);
  function iconButton(name: string, label: string, action: () => void) {
    const control = button('', action, 'demo-icon-button');
    control.append(icon(name)); control.dataset.icon = name; control.setAttribute('aria-label', label);
    return control;
  }
  function open(title: string, view = 'tool') {
    dialog.dataset.demoView = view;
    heading.textContent = title;
    heading.classList.remove('sr-only');
    headerField.replaceChildren(); headerField.hidden = true;
    leading.replaceChildren(); leading.hidden = true;
    tools.replaceChildren(); footer.replaceChildren(); footer.hidden = true;
    closeButton.hidden = false;
    handleBack = () => motion.close();
    body.replaceChildren();
    body.scrollTop = 0;
    if (!dialog.open) {
      opener = trigger ?? document.activeElement as HTMLElement | null;
      trigger = null;
      // Bring the device into view only after an explicit user action.
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) viewport.scrollIntoView({ block: 'center', behavior: 'instant' });
        fitDialog();
      }
      motion.open();
      fitDialog();
    }
    fitDialog();
    syncMenus();
  }
  dialog.querySelector('[data-demo-dialog-close]')?.addEventListener('click', () => motion.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    syncMenus();
    const target = opener?.isConnected && opener.getClientRects().length ? opener : menus.find((menu) => menu.getClientRects().length);
    target?.focus({ preventScroll: true });
  });
  // Modal keystrokes belong to the modal, never the reviewer behind it.
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); handleBack(); }
  });

  function picker(title = 'Deste seç', previousExpansion?: Set<string>) {
    open(title, 'picker');
    const expanded = previousExpansion ?? expandedDecks(adapter.decks(), adapter.selectedDeck());
    const returnToPicker = () => picker(title, expanded);
    const startCreate = () => createDeck(returnToPicker);
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Deste ara';
    search.setAttribute('aria-label', 'Deste ara');
    const list = el('div', '', 'demo-picker-list');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Desteler');
    body.append(list);
    footer.hidden = false;
    footer.append(button('İptal', () => motion.close(), 'demo-picker-cancel'));
    function render() {
      renderDemoDeckTree({ root, list, decks: adapter.decks(), selected: adapter.selectedDeck(), expanded, query: search.value, select: (id) => { adapter.selectDeck(id); refreshSidebar(); motion.close(); } });
    }
    const startSearch = () => {
      heading.classList.add('sr-only');
      headerField.hidden = false; headerField.append(search);
      leading.hidden = false; leading.append(iconButton('back', 'Deste listesine dön', returnToPicker));
      tools.replaceChildren(iconButton('add', 'Yeni deste', startCreate));
      closeButton.hidden = true;
      handleBack = returnToPicker;
      search.focus({ preventScroll: true });
    };
    tools.append(iconButton('search', 'Deste ara', startSearch), iconButton('add', 'Yeni deste', startCreate));
    search.addEventListener('input', render);
    render();
    // Opening the list does not summon a keyboard. Search is a separate header step.
    closeButton.focus({ preventScroll: true });
  }
  function createDeck(returnToPicker: () => void) {
    open('Yeni deste', 'picker');
    const form = el('form');
    form.id = `${heading.id}-create`;
    const input = el('input'); input.required = true; input.maxLength = 80; input.placeholder = 'Yeni deste adı'; input.setAttribute('aria-label', 'Deste adı'); input.setAttribute('form', form.id);
    const message = el('p', '', 'demo-tool-muted'); message.setAttribute('role', 'status');
    const submit = el('button', 'Oluştur', 'demo-picker-cancel'); submit.type = 'submit'; submit.setAttribute('form', form.id);
    heading.classList.add('sr-only');
    headerField.hidden = false; headerField.append(input);
    leading.hidden = false; leading.append(iconButton('back', 'Deste listesine dön', returnToPicker));
    closeButton.hidden = true; tools.append(submit);
    form.append(el('h3', 'Yeni deste oluştur', 'demo-create-title'), el('p', 'Deste burada oluşturulur ve mevcut işleminiz için otomatik seçilir. Bu ekrandan ayrılmazsınız.', 'demo-tool-muted'), message);
    footer.hidden = false; footer.append(button('İptal', () => motion.close(), 'demo-picker-cancel'));
    handleBack = returnToPicker;
    form.addEventListener('submit', (event) => {
      event.preventDefault(); const name = input.value.trim();
      if (!name) { input.setCustomValidity('Bir deste adı yaz.'); input.reportValidity(); return; }
      if (adapter.decks().some((deck) => deck.title.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
        message.textContent = 'Bu adda bir deste var. Başka bir ad seç.'; return;
      }
      const id = adapter.createDeck(name); adapter.selectDeck(id); refreshSidebar(); motion.close();
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    body.append(form); input.focus({ preventScroll: true });
  }
  const sidebarExpanded = expandedDecks(adapter.decks(), adapter.selectedDeck());
  let sidebarSelection = adapter.selectedDeck();
  function refreshSidebar() {
    if (sidebarSelection !== adapter.selectedDeck()) {
      expandedDecks(adapter.decks(), adapter.selectedDeck()).forEach((id) => sidebarExpanded.add(id));
      sidebarSelection = adapter.selectedDeck();
    }
    root.querySelectorAll<HTMLElement>('[data-demo-sidebar-tree]').forEach((list) => renderDemoDeckTree({
      root, list, decks: adapter.decks(), selected: adapter.selectedDeck(), expanded: sidebarExpanded, sidebar: true,
      select: (id) => { adapter.selectDeck(id); refreshSidebar(); if (dialog.open) motion.close(); },
    }));
  }
  function goToDecks() {
    if (!adapter.openDecks) { picker('Desteler'); return; }
    adapter.openDecks(); motion.close();
  }
  function buildSidebar(container: HTMLElement) {
    container.replaceChildren();
    container.append(el('p', 'Aralıklı tekrar', 'demo-sidebar-subtitle'));
    const tree = el('nav', '', 'demo-sidebar-tree');
    tree.dataset.demoSidebarTree = ''; tree.setAttribute('aria-label', 'Deneme desteleri');
    container.append(tree);
    const nav = el('nav', '', 'demo-sidebar-actions'); nav.setAttribute('aria-label', 'Uygulama araçları');
    const control = button('', goToDecks, 'demo-sidebar-action');
    control.append(icon('cards'), el('span', 'Desteler'));
    control.dataset.demoSidebarAction = 'Desteler';
    nav.append(control); container.append(nav);
    refreshSidebar();
  }
  for (const menu of menus) {
    menu.disabled = false;
    menu.setAttribute('aria-controls', dialog.id);
    menu.setAttribute('aria-expanded', 'false');
    menu.addEventListener('click', () => {
      if (dialog.open && dialog.dataset.demoView === 'sidebar') { motion.close(); return; }
      trigger = menu; open('TusAnkiM', 'sidebar'); buildSidebar(body);
      closeButton.focus({ preventScroll: true });
    });
  }
  root.querySelector<HTMLButtonElement>('[data-demo-scope]')?.addEventListener('click', (event) => { trigger = event.currentTarget as HTMLElement; picker(); });
  return {
    refreshSidebar,
  };
}
