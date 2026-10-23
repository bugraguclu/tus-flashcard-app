import { getParentDeckName, type Deck } from './models';
import { getTodayLimitUsageByDeck } from './reviewLogger';
import { compareDeckDisplayOrder, type DeckDueCounts } from './deckStore';
import { getDeckConfigForDeck } from './deckLimits';

/**
 * The deck list as a tree for a scope, in display order.
 */

// ---- Deck Hierarchy Helpers ----

export interface DeckTreeNode {
    deck: Deck;
    children: DeckTreeNode[];
    depth: number;
    // Aggregated counts
    newCount: number;
    learnCount: number;
    reviewCount: number;
    totalCards: number;
}

/**
 * Deck shortcuts for a collection/deck scope. Collection scope exposes root decks;
 * a deck scope exposes only its immediate children. Each returned deck can then be
 * treated as the root of its complete subtree by consumers such as Browser/Stats.
 */
export function getDirectDecksForScope(
    decks: Deck[],
    scopeName: string | null,
    includeFiltered = false,
): Deck[] {
    return decks
        .filter((deck) => (includeFiltered || !deck.isFiltered)
            && getParentDeckName(deck.name) === scopeName)
        .sort(compareDeckDisplayOrder);
}

/**
 * Return only deck branches that actually contain at least one card in the requested scope.
 *
 * Browser shortcuts used to include every persisted descendant. An early Ders/Konu migration
 * created empty descendants, so those rows surfaced as "ghost" chips even though the selected
 * deck correctly reported zero cards. Keeping the empty decks themselves is intentional (users
 * may have created them), but an empty branch is not a useful card filter.
 */
export function getPopulatedDecksForScope(
    decks: Deck[],
    cardCounts: Map<number, { total: number }>,
    scopeName: string | null,
): Deck[] {
    const candidates = decks.filter((deck) => !deck.isFiltered && (
        scopeName ? deck.name.startsWith(`${scopeName}::`) : true
    ));
    const candidateNames = new Set(candidates.map((deck) => deck.name));
    const populatedNames = new Set<string>();

    for (const deck of candidates) {
        if ((cardCounts.get(deck.id)?.total ?? 0) <= 0) continue;

        let branchName: string | null = deck.name;
        while (branchName) {
            if (candidateNames.has(branchName)) populatedNames.add(branchName);
            branchName = getParentDeckName(branchName);
        }
    }

    return candidates.filter((deck) => populatedNames.has(deck.name));
}

/**
 * Every deck in the order the deck list shows it, collapsed branches included: siblings by
 * `compareDeckDisplayOrder`, each deck straight after its parent and before the parent's next
 * sibling. A deck whose parent is missing stands among the roots, as in `buildDeckTree`.
 */
export function decksInDisplayOrder(decks: readonly Deck[]): Deck[] {
    const sorted = [...decks].sort(compareDeckDisplayOrder);
    const names = new Set(sorted.map((deck) => deck.name));
    const childrenOf = new Map<string | null, Deck[]>();
    for (const deck of sorted) {
        const parent = getParentDeckName(deck.name);
        const key = parent && names.has(parent) ? parent : null;
        const siblings = childrenOf.get(key);
        if (siblings) siblings.push(deck);
        else childrenOf.set(key, [deck]);
    }
    const ordered: Deck[] = [];
    const walked = new Set<string>();
    const walk = (parent: string | null) => {
        for (const deck of childrenOf.get(parent) ?? []) {
            ordered.push(deck);
            // Two rows sharing a name must not list the same subdecks twice.
            if (walked.has(deck.name)) continue;
            walked.add(deck.name);
            walk(deck.name);
        }
    };
    walk(null);
    return ordered;
}

export interface DeckTreeOptions {
    /**
     * Anki's "limits start from top": a subdeck's row also answers to the limits of the decks
     * above it, as studying it would.
     */
    limitsStartFromTop?: boolean;
}

export function buildDeckTree(
    decks: Deck[],
    cardCounts?: Map<number, DeckDueCounts>,
    rolloverHour: number = 4,
    options: DeckTreeOptions = {},
): DeckTreeNode[] {
    // Legacy collections without a manual position stay alphabetical. As soon as the user
    // reorders siblings, their persisted sortOrder takes precedence.
    const sorted = [...decks].sort(compareDeckDisplayOrder);

    // Build tree
    const nodeMap = new Map<string, DeckTreeNode>();
    /** Interday learning inside each node's learn count; it spends the review limit. */
    const interdayOf = new Map<DeckTreeNode, number>();

    for (const deck of sorted) {
        const counts: DeckDueCounts = cardCounts?.get(deck.id) || { new: 0, learn: 0, review: 0, total: 0 };
        const node: DeckTreeNode = {
            deck,
            children: [],
            depth: deck.name.split('::').length - 1,
            newCount: counts.new,
            learnCount: counts.learn,
            reviewCount: counts.review,
            totalCards: counts.total,
        };
        interdayOf.set(node, Math.max(0, Math.min(counts.learn, counts.interdayLearn ?? 0)));
        nodeMap.set(deck.name, node);
    }

    // Link children to parents
    const roots: DeckTreeNode[] = [];
    for (const [name, node] of nodeMap) {
        const parentName = getParentDeckName(name);
        if (parentName && nodeMap.has(parentName)) {
            nodeMap.get(parentName)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    const sortBranch = (nodes: DeckTreeNode[]) => {
        nodes.sort((a, b) => compareDeckDisplayOrder(a.deck, b.deck));
        nodes.forEach((node) => sortBranch(node.children));
    };
    sortBranch(roots);

    // What each deck already spent of today's allowance, so the tree shows what is still to come
    // rather than the full daily allotment all over again (Anki's per-deck newToday/revToday).
    const usageByDeckId = getTodayLimitUsageByDeck(rolloverHour);
    const spent = new Map<string, { newIntroduced: number; reviewsAnswered: number }>();

    // Aggregate counts from children up
    function aggregateCounts(node: DeckTreeNode): void {
        const own = usageByDeckId.get(node.deck.id);
        const used = { newIntroduced: own?.newIntroduced ?? 0, reviewsAnswered: own?.reviewsAnswered ?? 0 };
        spent.set(node.deck.name, used);

        for (const child of node.children) {
            aggregateCounts(child);
            // Filtered decks reference cards from their home decks. In this app they are gathered
            // virtually, so adding their counts to a parent would count the same cards twice.
            if (child.deck.isFiltered) continue;
            node.newCount += child.newCount;
            node.learnCount += child.learnCount;
            node.reviewCount += child.reviewCount;
            node.totalCards += child.totalCards;
            interdayOf.set(node, (interdayOf.get(node) ?? 0) + (interdayOf.get(child) ?? 0));
            const childUsed = spent.get(child.deck.name);
            if (childUsed) {
                used.newIntroduced += childUsed.newIntroduced;
                used.reviewsAnswered += childUsed.reviewsAnswered;
            }
        }

        // Review counts reflect the parent's remaining daily allowance across its children.
        // Interday learning cards spend that allowance first, as the study queue gathers them
        // (Anki: they are "subject to the review limit"). New cards stay uncapped, matching the
        // overview and study queue.
        if (!node.deck.isFiltered) {
            const config = getDeckConfigForDeck(node.deck.id, rolloverHour);
            capReviewWork(node, Math.max(0, config.maxReviewsPerDay - used.reviewsAnswered));
        }
    }

    /** Fit a node's interday learning and reviews, in that order, into `allowance`. */
    function capReviewWork(node: DeckTreeNode, allowance: number): void {
        const interday = interdayOf.get(node) ?? 0;
        const shownInterday = Math.min(interday, allowance);
        node.learnCount -= interday - shownInterday;
        node.reviewCount = Math.min(node.reviewCount, allowance - shownInterday);
        interdayOf.set(node, shownInterday);
    }
    roots.forEach(aggregateCounts);

    // With "limits start from top" a subdeck can never offer more review work than the deck above
    // it, because studying the subdeck spends the parent's limits as well.
    if (options.limitsStartFromTop) {
        const capFromTop = (node: DeckTreeNode, parent: DeckTreeNode | null) => {
            if (parent && !node.deck.isFiltered) {
                capReviewWork(node, (interdayOf.get(parent) ?? 0) + parent.reviewCount);
            }
            node.children.forEach((child) => capFromTop(child, node.deck.isFiltered ? parent : node));
        };
        roots.forEach((root) => capFromTop(root, null));
    }

    return roots;
}

/** Flatten deck tree for rendering (with depth info) */
export function flattenDeckTree(nodes: DeckTreeNode[], includeCollapsed = false): DeckTreeNode[] {
    const result: DeckTreeNode[] = [];
    function walk(nodeList: DeckTreeNode[]) {
        for (const node of nodeList) {
            result.push(node);
            if (!node.deck.collapsed || includeCollapsed) {
                walk(node.children);
            }
        }
    }
    walk(nodes);
    return result;
}
