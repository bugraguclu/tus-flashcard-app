import { getParentDeckName, type Deck } from './models';
import { getTodayLimitUsageByDeck } from './reviewLogger';
import { compareDeckDisplayOrder } from './deckStore';
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

export function buildDeckTree(
    decks: Deck[],
    cardCounts?: Map<number, { new: number; learn: number; review: number; total: number }>,
    rolloverHour: number = 4,
): DeckTreeNode[] {
    // Legacy collections without a manual position stay alphabetical. As soon as the user
    // reorders siblings, their persisted sortOrder takes precedence.
    const sorted = [...decks].sort(compareDeckDisplayOrder);

    // Build tree
    const nodeMap = new Map<string, DeckTreeNode>();

    for (const deck of sorted) {
        const counts = cardCounts?.get(deck.id) || { new: 0, learn: 0, review: 0, total: 0 };
        const node: DeckTreeNode = {
            deck,
            children: [],
            depth: deck.name.split('::').length - 1,
            newCount: counts.new,
            learnCount: counts.learn,
            reviewCount: counts.review,
            totalCards: counts.total,
        };
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
            const childUsed = spent.get(child.deck.name);
            if (childUsed) {
                used.newIntroduced += childUsed.newIntroduced;
                used.reviewsAnswered += childUsed.reviewsAnswered;
            }
        }

        // When the parent is selected, its own limits cap the total drawn from all children.
        // This keeps the deck-list number aligned with the overview/study queue instead of
        // advertising the uncapped sum of every subdeck. The cap is what today's limits still
        // allow: Anki does not hand out a deck's full allowance twice in one day.
        if (!node.deck.isFiltered) {
            const config = getDeckConfigForDeck(node.deck.id, rolloverHour);
            node.newCount = Math.min(node.newCount, Math.max(0, config.newPerDay - used.newIntroduced));
            node.reviewCount = Math.min(node.reviewCount, Math.max(0, config.maxReviewsPerDay - used.reviewsAnswered));
        }
    }
    roots.forEach(aggregateCounts);

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
