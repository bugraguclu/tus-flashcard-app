/**
 * A web tab that opened while another tab held the collection is read-only, and when that other
 * tab closes this one reloads to take over as the writer (lib/webDb.ts). The reload used to drop
 * a note being typed in this tab's editor, although Save had just told the learner to close the
 * other tab and reload. The editor now hands its unsaved draft here; it is kept in this tab's
 * sessionStorage across the reload and given back to the editor that opens at the same address.
 */

export interface TakeoverDraft {
    fields: string[];
    tags: string[];
    deckId: number | null;
    cardTypeId: number;
}

interface StoredDraft extends TakeoverDraft {
    /** The page the draft was typed on: the editor that reopens there takes it. */
    page: string;
}

/** The part of `sessionStorage` this module uses; tests hand in their own. */
export interface DraftStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const STORAGE_KEY = 'tus-takeover-draft-v1';

let provider: (() => TakeoverDraft | null) | null = null;

/** The editor registers what it would lose; null while it has nothing unsaved. */
export function registerTakeoverDraft(next: () => TakeoverDraft | null): () => void {
    provider = next;
    return () => {
        if (provider === next) provider = null;
    };
}

function sessionStore(): DraftStorage | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

/** The address an editor reopens at after a reload: the path and the query. */
export function currentPageKey(): string {
    if (typeof window === 'undefined' || !window.location) return '';
    return `${window.location.pathname ?? ''}${window.location.search ?? ''}`;
}

/** Keep the registered draft for the reload that is about to happen. Never throws. */
export function stashTakeoverDraft(storage: DraftStorage | null = sessionStore(), page: string = currentPageKey()): void {
    try {
        const draft = provider?.();
        if (!storage || !draft) return;
        const stored: StoredDraft = { ...draft, page };
        storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // Storage full or blocked: the reload goes ahead, as it did before.
    }
}

/** The draft kept for `page`, removed as it is taken; null when there is none for this page. */
export function takeTakeoverDraft(page: string = currentPageKey(), storage: DraftStorage | null = sessionStore()): TakeoverDraft | null {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw || !storage) return null;
        storage.removeItem(STORAGE_KEY);
        const stored = JSON.parse(raw) as Partial<StoredDraft>;
        if (stored.page !== page || !Array.isArray(stored.fields) || !stored.fields.every((field) => typeof field === 'string')) return null;
        if (typeof stored.cardTypeId !== 'number') return null;
        return {
            fields: stored.fields,
            tags: Array.isArray(stored.tags) ? stored.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            deckId: typeof stored.deckId === 'number' ? stored.deckId : null,
            cardTypeId: stored.cardTypeId,
        };
    } catch {
        return null;
    }
}
