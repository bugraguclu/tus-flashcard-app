/**
 * The load balancer's state for the current study session, kept the way Anki keeps it with its
 * card queues: read from the collection whenever the study queue is built, then updated card by
 * card as answers move cards into review. Anki has no switch for it in its interface, so it is
 * always on here too.
 *
 * Anki counts every card whose due day falls in the window. New cards are left out here, because
 * their `due` is a queue position, and this collection numbers days from the Unix epoch rather
 * than from the collection's creation, so a position could otherwise pass for a day.
 */

import { getDB } from './db';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { ankiCardSeed } from './ankiRandom';
import { getAllDecks, getDeck } from './deckStore';
import { getAllDeckConfigs, getDeckConfig } from './deckPresets';
import {
    LOAD_BALANCE_DAYS,
    addLoadBalancedCard,
    emptyLoadBalancerDays,
    loadBalancedInterval,
    parseEasyDays,
    type LoadBalancerDay,
    type LoadBalancerState,
} from './loadBalancer';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import type { IntervalBalancer } from './schedulingIntervals';

interface LoadBalancerSession {
    state: LoadBalancerState;
    today: number;
    rolloverHour: number;
}

let session: LoadBalancerSession | null = null;

/** The preset a card is balanced under: its home deck's, even while it sits in a filtered deck. */
function homePresetId(card: Pick<AnkiCard, 'deckId' | 'odid'>): number | null {
    const deck = getDeck(card.odid || card.deckId);
    if (!deck || deck.isFiltered) return null;
    return deck.configId || DEFAULT_DECK_CONFIG.id;
}

/** Read the collection's due counts afresh, as Anki does whenever it builds the study queue. */
export function rebuildLoadBalancer(rolloverHour: number, nowMs: number = Date.now()): void {
    const today = localDayNumber(nowMs, rolloverHour);
    const presetByDeck = new Map<number, number>();
    for (const deck of getAllDecks()) {
        if (!deck.isFiltered) presetByDeck.set(deck.id, deck.configId || DEFAULT_DECK_CONFIG.id);
    }

    const daysByPreset = new Map<number, LoadBalancerDay[]>();
    const rows = getDB().getAllSync<{ id: number; noteId: number; deckId: number; due: number }>(
        'SELECT id, noteId, deckId, due FROM anki_cards WHERE due >= ? AND due < ? AND type != 0',
        today,
        today + LOAD_BALANCE_DAYS,
    );
    for (const row of rows) {
        const presetId = presetByDeck.get(row.deckId);
        if (presetId === undefined) continue;
        let days = daysByPreset.get(presetId);
        if (!days) {
            days = emptyLoadBalancerDays();
            daysByPreset.set(presetId, days);
        }
        const day = days[row.due - today];
        day.cardIds.push(row.id);
        day.noteIds.add(row.noteId);
    }

    session = {
        today,
        rolloverHour,
        state: {
            nextDayAtMs: nextRolloverMs(nowMs, rolloverHour),
            daysByPreset,
            easyDaysByPreset: new Map(getAllDeckConfigs().map((config) => [config.id, parseEasyDays(config.easyDays)])),
        },
    };
}

function liveSession(rolloverHour: number, nowMs: number): LoadBalancerSession | null {
    if (!session) return null;
    if (session.rolloverHour !== rolloverHour || session.today !== localDayNumber(nowMs, rolloverHour)) return null;
    return session;
}

/**
 * The balancer for answering `card` now, or null when no session is active (Anki balances only
 * once a study queue exists). Draws use the same `card id + reps` seed as fuzz, and siblings are
 * only considered when the preset buries review siblings.
 */
export function loadBalancerForCard(
    card: Pick<AnkiCard, 'id' | 'reps' | 'noteId' | 'deckId' | 'odid'>,
    rolloverHour: number,
    nowMs: number = Date.now(),
): IntervalBalancer | null {
    const active = liveSession(rolloverHour, nowMs);
    if (!active) return null;
    const presetId = homePresetId(card);
    if (presetId === null) return null;
    const noteId = getDeckConfig(presetId).buryReviewSiblings ? card.noteId : null;
    const seed = ankiCardSeed(card.id, card.reps);
    return {
        findInterval: (interval, minimum, maximum) => loadBalancedInterval(
            active.state, interval, minimum, maximum, presetId, seed, noteId,
        ),
    };
}

/** After an answer: a card that landed in the review queue now counts on its new day. */
export function recordLoadBalancedAnswer(card: AnkiCard, rolloverHour: number, nowMs: number = Date.now()): void {
    const active = liveSession(rolloverHour, nowMs);
    if (!active || card.queue !== 2) return;
    const presetId = homePresetId(card);
    if (presetId === null) return;
    addLoadBalancedCard(active.state, card.id, card.noteId, presetId, card.ivl);
}
