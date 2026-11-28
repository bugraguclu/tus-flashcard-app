import type { DemoDeckChoice } from './demoControls';

/** Only the available sample decks: counts never imply the whole app collection is loaded. */
export function homeDemoDecks(courses: string[]): DemoDeckChoice[] {
  const groups = [
    { id: 'temel', title: 'Temel Bilimler', courses: ['Anatomi', 'Fizyoloji-Histoloji-Embriyoloji', 'Biyokimya', 'Mikrobiyoloji', 'Patoloji', 'Farmakoloji'] },
    { id: 'klinik', title: 'Klinik Bilimler', courses: ['Dahiliye', 'Pediatri', 'Genel Cerrahi', 'Küçük Stajlar', 'Kadın Doğum'] },
  ];
  const decks: DemoDeckChoice[] = [{ id: 'tus-cards', title: 'TUS Kartları', depth: 0 }];
  for (const group of groups) {
    decks.push({ id: group.id, title: group.title, depth: 1, parentId: 'tus-cards' });
    for (const title of group.courses) {
      const index = courses.indexOf(title);
      if (index !== -1) decks.push({ id: `course-${index}`, title, depth: 2, parentId: group.id });
    }
  }
  return decks;
}

export function deckContains(decks: DemoDeckChoice[], scope: string, deckId: string): boolean {
  if (scope === 'all' || scope === deckId) return true;
  let parent = decks.find((deck) => deck.id === deckId)?.parentId;
  while (parent) {
    if (parent === scope) return true;
    parent = decks.find((deck) => deck.id === parent)?.parentId;
  }
  return false;
}

/** Opening matches the app: roots and the active path expand, unrelated branches stay shut. */
export function expandedDecks(decks: DemoDeckChoice[], active: string): Set<string> {
  const expanded = new Set(decks.filter((deck) => !deck.parentId && !deck.isAll).map((deck) => deck.id));
  let deck = decks.find((item) => item.id === active);
  if (deck) expanded.add(deck.id);
  while (deck?.parentId) {
    expanded.add(deck.parentId);
    deck = decks.find((item) => item.id === deck!.parentId);
  }
  return expanded;
}
