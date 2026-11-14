import { afterEach, describe, expect, it } from 'vitest';
import { registerTakeoverDraft, stashTakeoverDraft, takeTakeoverDraft, type DraftStorage, type TakeoverDraft } from './webTakeoverDraft';

function memoryStorage(): DraftStorage & { items: Map<string, string> } {
    const items = new Map<string, string>();
    return {
        items,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => { items.set(key, value); },
        removeItem: (key) => { items.delete(key); },
    };
}

const draft: TakeoverDraft = { fields: ['Kalp', 'Heart'], tags: ['kardiyo'], deckId: 3, cardTypeId: 1 };
let unregister: (() => void) | null = null;
afterEach(() => { unregister?.(); unregister = null; });

describe('the unsaved draft of a web tab that reloads to take over', () => {
    it('is kept across the reload and given back once, to the editor at the same address', () => {
        const storage = memoryStorage();
        unregister = registerTakeoverDraft(() => draft);
        stashTakeoverDraft(storage, '/editor?deckId=3');

        expect(takeTakeoverDraft('/editor?cardId=9', storage)).toBeNull();
        // Taken (and dropped) by the first editor that asks, so a later page never gets it.
        stashTakeoverDraft(storage, '/editor?deckId=3');
        expect(takeTakeoverDraft('/editor?deckId=3', storage)).toEqual(draft);
        expect(takeTakeoverDraft('/editor?deckId=3', storage)).toBeNull();
    });

    it('keeps nothing when the editor has nothing unsaved or no editor is open', () => {
        const storage = memoryStorage();
        stashTakeoverDraft(storage, '/editor');
        unregister = registerTakeoverDraft(() => null);
        stashTakeoverDraft(storage, '/editor');
        expect(storage.items.size).toBe(0);
    });

    it('never throws on blocked or damaged storage', () => {
        unregister = registerTakeoverDraft(() => draft);
        const blocked: DraftStorage = {
            getItem: () => { throw new Error('blocked'); },
            setItem: () => { throw new Error('quota'); },
            removeItem: () => {},
        };
        expect(() => stashTakeoverDraft(blocked, '/editor')).not.toThrow();
        expect(takeTakeoverDraft('/editor', blocked)).toBeNull();
        const damaged = memoryStorage();
        damaged.items.set('tus-takeover-draft-v1', '{not json');
        expect(takeTakeoverDraft('/editor', damaged)).toBeNull();
        damaged.items.set('tus-takeover-draft-v1', JSON.stringify({ page: '/editor', fields: [1], cardTypeId: 1 }));
        expect(takeTakeoverDraft('/editor', damaged)).toBeNull();
    });
});
