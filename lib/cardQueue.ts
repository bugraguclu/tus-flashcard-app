// ============================================================
// TUS Flashcard - Incremental Scheduling Indexes (D2)
// Min-heap priority queues for O(log N) card scheduling
// ============================================================

import type { Card, CardState } from './types';

// ---------- MinHeap ----------
class MinHeap<T> {
    private items: T[] = [];
    private comparator: (a: T, b: T) => number;

    constructor(comparator: (a: T, b: T) => number) {
        this.comparator = comparator;
    }

    get size(): number { return this.items.length; }
    peek(): T | undefined { return this.items[0]; }

    push(item: T): void {
        this.items.push(item);
        this._bubbleUp(this.items.length - 1);
    }

    pop(): T | undefined {
        if (this.items.length === 0) return undefined;
        const top = this.items[0];
        const last = this.items.pop()!;
        if (this.items.length > 0) {
            this.items[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    remove(predicate: (item: T) => boolean): boolean {
        const idx = this.items.findIndex(predicate);
        if (idx === -1) return false;
        const last = this.items.pop()!;
        if (idx < this.items.length) {
            this.items[idx] = last;
            this._bubbleUp(idx);
            this._sinkDown(idx);
        }
        return true;
    }

    toArray(): T[] { return [...this.items]; }
    clear(): void { this.items = []; }

    private _bubbleUp(idx: number): void {
        while (idx > 0) {
            const parent = Math.floor((idx - 1) / 2);
            if (this.comparator(this.items[idx], this.items[parent]) >= 0) break;
            [this.items[idx], this.items[parent]] = [this.items[parent], this.items[idx]];
            idx = parent;
        }
    }

    private _sinkDown(idx: number): void {
        const length = this.items.length;
        while (true) {
            let smallest = idx;
            const left = 2 * idx + 1;
            const right = 2 * idx + 2;
            if (left < length && this.comparator(this.items[left], this.items[smallest]) < 0) smallest = left;
            if (right < length && this.comparator(this.items[right], this.items[smallest]) < 0) smallest = right;
            if (smallest === idx) break;
            [this.items[idx], this.items[smallest]] = [this.items[smallest], this.items[idx]];
            idx = smallest;
        }
    }
}

// ---------- Queue Entry ----------
export interface QueueEntry {
    cardId: number;
    dueDate: string;
    dueTime: number;
    status: string;
}

// ---------- CardQueue ----------
export class CardQueue {
    private learningHeap: MinHeap<QueueEntry>;
    private reviewHeap: MinHeap<QueueEntry>;
    private newCardIds: number[] = [];

    private _newCount = 0;
    private _learningCount = 0;
    private _reviewCount = 0;

    constructor() {
        // Learning: dueTime en yakın önce
        this.learningHeap = new MinHeap<QueueEntry>((a, b) => a.dueTime - b.dueTime);
        // Review: dueDate en eski önce
        this.reviewHeap = new MinHeap<QueueEntry>((a, b) => a.dueDate.localeCompare(b.dueDate));
    }

    // DB'den veya state'den bir kere yükle
    build(cards: Card[], getState: (id: number) => CardState, today: string, now: number): void {
        this.learningHeap.clear();
        this.reviewHeap.clear();
        this.newCardIds = [];
        this._newCount = 0;
        this._learningCount = 0;
        this._reviewCount = 0;

        for (const card of cards) {
            const cs = getState(card.id);
            if (cs.suspended || cs.buried) continue;
            this._addToQueue(card.id, cs, today, now);
        }
    }

    // Tek kart güncelle — O(log N)
    updateCard(cardId: number, state: CardState, today: string, now: number): void {
        // Eski entry'leri kaldır
        this.learningHeap.remove(e => e.cardId === cardId);
        this.reviewHeap.remove(e => e.cardId === cardId);
        this.newCardIds = this.newCardIds.filter(id => id !== cardId);

        // Yeni duruma göre ekle
        if (!state.suspended && !state.buried) {
            this._addToQueue(cardId, state, today, now);
        }

        // Sayaçları yeniden hesapla
        this._recount();
    }

    // Sıradaki kartı al — O(1)
    getNextCardId(newCardsLimit: number): number | null {
        // Öncelik: learning → review → new
        const learning = this.learningHeap.peek();
        if (learning) return learning.cardId;

        const review = this.reviewHeap.peek();
        if (review) return review.cardId;

        if (this.newCardIds.length > 0 && newCardsLimit > 0) {
            return this.newCardIds[0];
        }

        return null;
    }

    // Kuyruk bilgilerini O(1) döndür
    getQueue(newCardsLimit: number): number[] {
        const result: number[] = [];

        // Learning kartları (dueTime sıralı)
        const learningItems = this.learningHeap.toArray()
            .sort((a, b) => a.dueTime - b.dueTime);
        result.push(...learningItems.map(e => e.cardId));

        // Review kartları (dueDate sıralı)
        const reviewItems = this.reviewHeap.toArray()
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        result.push(...reviewItems.map(e => e.cardId));

        // New kartları (limit kadar)
        result.push(...this.newCardIds.slice(0, Math.max(0, newCardsLimit)));

        return result;
    }

    getStats(): { newCount: number; learningCount: number; reviewCount: number } {
        return {
            newCount: this._newCount,
            learningCount: this._learningCount,
            reviewCount: this._reviewCount,
        };
    }

    get totalDue(): number {
        return this.learningHeap.size + this.reviewHeap.size + this.newCardIds.length;
    }

    private _addToQueue(cardId: number, cs: CardState, today: string, now: number): void {
        if (cs.status === 'new') {
            this.newCardIds.push(cardId);
            this._newCount++;
        } else if (cs.status === 'learning') {
            if (!cs.dueTime || cs.dueTime <= now) {
                this.learningHeap.push({ cardId, dueDate: cs.dueDate, dueTime: cs.dueTime || 0, status: 'learning' });
                this._learningCount++;
            }
        } else if (cs.status === 'review' && cs.dueDate <= today) {
            this.reviewHeap.push({ cardId, dueDate: cs.dueDate, dueTime: 0, status: 'review' });
            this._reviewCount++;
        }
    }

    private _recount(): void {
        this._newCount = this.newCardIds.length;
        this._learningCount = this.learningHeap.size;
        this._reviewCount = this.reviewHeap.size;
    }
}
