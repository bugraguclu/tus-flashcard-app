import { setupDemoControls, type DemoGrade, type DemoDeckChoice } from './demoControls';
import { homeDemoDecks, deckContains } from './demoDeckTree';
import { renderDemoDeckList } from './demoDeckList';
type Part = { type: 'text'; value: string } | { type: 'cloze'; index: number; answer: string; hint?: string };
type Card = { qid: string; sinav: string; ders: string; activeCloze?: number; parts: Part[]; extra: string; id: string; deckId: string; personal?: boolean };

export function initLiveCardDemos() {
  document.querySelectorAll<HTMLElement>('[data-live-demo]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    const body = find<HTMLElement>('[data-demo-body]');
    const extra = find<HTMLElement>('[data-demo-extra]');
    const revealWrap = find<HTMLElement>('[data-demo-reveal-wrap]');
    const revealButton = find<HTMLButtonElement>('[data-demo-reveal]');
    const grades = find<HTMLElement>('[data-demo-grades]');
    const live = find<HTMLElement>('[data-demo-live]');
    const status = find<HTMLElement>('[data-demo-status]');
    const retry = find<HTMLButtonElement>('[data-demo-retry]');
    const undo = find<HTMLButtonElement>('[data-home-undo]');
    let cards: Card[] = [];
    let scope = 'tus-cards';
    let current = 0;
    let revealed = false;
    let page: 'decks' | 'study' = 'decks';
    const expanded = new Set(['tus-cards']);
    const reviewed = new Set<string>();
    const learning = new Set<string>();
    const customDecks: DemoDeckChoice[] = [];
    let sampleDecks: DemoDeckChoice[] = [];
    const history: { scope: string; current: number; reviewed: Set<string>; learning: Set<string> }[] = [];
    let controls: ReturnType<typeof setupDemoControls>;
    const inScope = (id: string, deckId: string) => deckContains([...sampleDecks, ...customDecks], id, deckId);
    const visible = () => cards.filter((card) => inScope(scope, card.deckId));
    const active = () => visible()[current];
    const newCount = (id: string) => cards.filter((card) => inScope(id, card.deckId) && !reviewed.has(card.id)).length;
    const learnCount = (id: string) => cards.filter((card) => inScope(id, card.deckId) && learning.has(card.id)).length;
    const countLabel = (id: string) => `${newCount(id)} yeni · ${learnCount(id)} öğrenme`;
    const decks = (): DemoDeckChoice[] => [
      { id: 'all', title: 'Tüm desteler', isAll: true },
      ...[...sampleDecks, ...customDecks].map((deck) => ({ ...deck, counts: countLabel(deck.id), cardCount: cards.filter((card) => inScope(deck.id, card.deckId)).length })),
    ];
    function renderDecks() {
      renderDemoDeckList({ root, decks: decks(), expanded, counts: (id) => ({ new: newCount(id), learning: learnCount(id), review: 0 }), select: selectDeck });
    }
    function showPage(next: 'decks' | 'study', focus = false) {
      page = next;
      root.dataset.demoPage = next;
      find('[data-demo-screen=decks]').hidden = next !== 'decks';
      find('[data-demo-screen=study]').hidden = next !== 'study';
      if (next === 'decks') renderDecks();
      if (focus) {
        const target = next === 'decks'
          ? root.querySelector<HTMLElement>(`[data-demo-study="${scope}"]`) ?? find('[data-demo-deck-heading]')
          : body;
        target.focus({ preventScroll: true });
      }
    }
    function render() {
      const card = active();
      body.replaceChildren();
      find('[data-demo-deck-title]').textContent = decks().find((deck) => deck.id === scope)?.title ?? 'TUS Kartları';
      find('[data-demo-course]').textContent = card?.ders ?? 'Kendi kartların';
      controls?.refreshSidebar();
      renderDecks();
      find('[data-demo-new-count]').textContent = String(newCount(scope));
      find('[data-demo-learn-count]').textContent = String(learnCount(scope));
      find('[data-demo-new-count]').classList.toggle('is-current', Boolean(card && !reviewed.has(card.id)));
      find('[data-demo-learn-count]').classList.toggle('is-current', Boolean(card && learning.has(card.id)));
      undo.disabled = history.length === 0;
      revealButton.disabled = !card;
      revealWrap.hidden = revealed || !card;
      grades.hidden = !revealed || !card;
      if (!card) {
        body.textContent = 'Bu destede henüz kart yok. Örnek kartları çalışmak için başka bir deste seçebilirsin.';
        extra.hidden = true; return;
      }
      for (const part of card.parts) {
        if (part.type === 'cloze' && part.index === (card.activeCloze ?? 1)) {
          const span = document.createElement('span');
          span.className = revealed ? 'demo-cloze-revealed' : 'demo-cloze';
          span.textContent = revealed ? part.answer : part.hint ? `[${part.hint}]` : '[…]';
          body.append(span);
        } else body.append(document.createTextNode(part.type === 'cloze' ? part.answer : part.value));
      }
      if (revealed && card.personal) {
        const answer = document.createElement('p'); answer.className = 'demo-personal-answer'; answer.textContent = card.extra; body.append(answer);
      }
      extra.textContent = card.personal ? '' : card.extra;
      extra.hidden = !revealed || !card.extra || Boolean(card.personal);
    }
    function select(index: number) {
      const size = visible().length;
      current = size ? (index + size) % size : 0;
      revealed = false; render();
      root.querySelector('[data-demo-scroll]')?.scrollTo({ top: 0 });
      live.textContent = active() ? `${active().ders}. Kart ${current + 1} / ${size}.` : 'Yeni deste hazır. İlk kartını ekleyebilirsin.';
    }
    function selectDeck(id: string) { scope = id; select(0); showPage('study', !root.querySelector('dialog[open]')); }
    function reveal() {
      if (revealed || !active()) return;
      const moveFocus = document.activeElement === revealButton || document.activeElement === body;
      revealed = true; render();
      live.textContent = active().personal ? `Cevap: ${active().extra}` : `Cevap: ${active().parts.filter((part) => part.type === 'cloze' && part.index === (active().activeCloze ?? 1)).map((part) => part.type === 'cloze' ? part.answer : '').join(', ')}.`;
      if (moveFocus) find<HTMLButtonElement>('[data-demo-grade="good"]').focus({ preventScroll: true });
    }
    function grade(rating: DemoGrade) {
      if (!revealed || !active()) return;
      history.push({ scope, current, reviewed: new Set(reviewed), learning: new Set(learning) });
      reviewed.add(active().id);
      if (rating === 'again') learning.add(active().id); else learning.delete(active().id);
      select(current + 1); revealButton.focus({ preventScroll: true });
    }
    undo.addEventListener('click', () => {
      const previous = history.pop(); if (!previous) return;
      scope = previous.scope; current = previous.current; reviewed.clear(); previous.reviewed.forEach((id) => reviewed.add(id));
      learning.clear(); previous.learning.forEach((id) => learning.add(id));
      revealed = false; render(); live.textContent = 'Son değerlendirme geri alındı.';
      revealButton.focus({ preventScroll: true });
    });
    revealButton.addEventListener('click', reveal);
    find('[data-demo-back]').addEventListener('click', () => showPage('decks', true));
    find('[data-demo-reset]').addEventListener('click', () => {
      reviewed.clear(); learning.clear(); history.length = 0; select(0);
      live.textContent = 'Deneme ilerlemesi sıfırlandı.';
    });
    root.querySelectorAll<HTMLButtonElement>('[data-demo-grade]').forEach((button) => button.addEventListener('click', () => grade(button.dataset.demoGrade as DemoGrade)));
    root.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (page !== 'study') return;
      if (event.key === 'Escape') { event.preventDefault(); showPage('decks', true); return; }
      if (event.target === body && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault(); select(current + (event.key === 'ArrowLeft' ? -1 : 1));
      } else if ((event.key === ' ' || event.key === 'Enter') && event.target === body && !revealed) {
        event.preventDefault(); reveal();
      } else if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault(); grade((['again', 'hard', 'good', 'easy'] as DemoGrade[])[Number(event.key) - 1]);
      }
    });
    async function loadCards() {
      retry.hidden = true; status.textContent = 'Kartlar yükleniyor…';
      try {
        const response = await fetch(root.dataset.cardsUrl!);
        if (!response.ok) throw new Error('Demo request failed');
        const data: Card[] = await response.json();
        if (!Array.isArray(data) || data.length !== Number(root.dataset.cardCount) || data.some((card) => !Array.isArray(card.parts) || !card.qid || !card.ders)) throw new Error('Invalid demo data');
        cards = data.map((card, index) => ({ ...card, id: `sample-${index}`, deckId: `course-${index}` }));
        sampleDecks = homeDemoDecks(data.map((card) => card.ders));
        controls = setupDemoControls(root, {
          decks, selectedDeck: () => scope, selectDeck,
          openDecks: () => showPage('decks'),
          cards: () => cards.map((card) => ({ id: card.id, deckId: card.deckId, title: card.parts.map((part) => part.type === 'text' ? part.value : '[…]').join('') })),
          selectCard: (id) => { const card = cards.find((item) => item.id === id)!; scope = card.deckId; select(visible().findIndex((item) => item.id === id)); showPage('study'); },
          createDeck: (title) => { const id = `personal-${customDecks.length}`; customDecks.push({ id, title }); return id; },
          addCard: (deckId, front, back) => {
            const id = `personal-card-${cards.length}`;
            cards.push({ id, deckId, qid: id, ders: decks().find((deck) => deck.id === deckId)?.title ?? '', sinav: '', personal: true, parts: [{ type: 'text', value: front }], extra: back });
            scope = deckId; select(visible().findIndex((card) => card.id === id)); showPage('study');
          },
        });
        find<HTMLButtonElement>('[data-demo-scope]').disabled = false;
        render(); showPage(page); status.hidden = true;
      } catch {
        status.textContent = 'Kartlar yüklenemedi. Yeniden deneyebilir veya referans kayıtlarını inceleyebilirsin.'; retry.hidden = false;
      }
    }
    retry.addEventListener('click', loadCards); void loadCards();
  });
}
