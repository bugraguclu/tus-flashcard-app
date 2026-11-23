#!/usr/bin/env node
/**
 * Randomized sync fuzzer for the TusAnkiM account-sync design.
 *
 * Three devices (an iPhone and two browsers) edit one collection: answers and undos, flags,
 * suspensions, deck moves, settings, decks (create / rename / delete with clashing names) and
 * Kronometre sessions. Clocks may be skewed, requests and responses get lost, devices go offline
 * and a browser can lose its local copy (cache eviction) and start fresh. At the end every device
 * syncs until nothing changes, then the invariants are checked.
 *
 *   V1-code  : the first design on today's write paths (flag/suspend keep the loaded usn, answer
 *              undo keeps the answer's mod and usn, a fresh install seeds defaults with mod = now).
 *   V1-ideal : the first design with every write marked dirty and stamped now; only the protocol
 *              is tested (row-level last-writer-wins on device-clock seconds, usn tiebreak).
 *   V2       : the revised design: every write captured, hybrid logical clock corrected by the
 *              server's time, last-writer-wins per field, sticky tombstones, identity check on ids,
 *              defaults at clock 0, deterministic repairs as derived writes.
 *
 * Invariants after every run: all devices and the server hold the same data; no edit is lost to
 * a value it was based on (causal order, per field); the answer log equals the answers minus the
 * undone ones; every Kronometre session survives exactly once; deck names are unique and no card
 * points at a deleted deck.
 *
 *   node sync-sim.mjs [runs=2000] [seed=1] [mutant] [modes=none,mixed,ids]
 *
 * modes: none = correct clocks, mixed = skewed device clocks (up to 90 min), ids = skewed clocks
 * and ids rounded to the minute so devices collide on ids. A mutant switches off one V2 mechanism
 * (no-observe, no-offset, no-winners, defaults-now, ack-all, no-ident, no-repair, row-lww; join
 * several with +) and runs V2 only, to show the checker notices; only-v2 runs V2 unchanged.
 */

import { STEPS, MUTANT, STATS, CARDS, World } from './sim-common.mjs';
import { V1Server, V1Device, v1ServerSnapshot } from './sim-v1.mjs';
import { V2Server, V2Device, v2ServerSnapshot } from './sim-v2.mjs';

const RUNS = Number(process.argv[2] ?? 2000);
const SEED0 = Number(process.argv[3] ?? 1);

const OPS = [
    ['answer', 30], ['undo', 7], ['flag', 6], ['suspend', 4], ['move', 5], ['setting', 4],
    ['createDeck', 3], ['renameDeck', 2], ['deleteDeck', 1.5], ['addSession', 3], ['deleteSession', 1.5],
    ['push', 14], ['pull', 14], ['toggle', 2], ['evict', 0.4],
];
const OP_TOTAL = OPS.reduce((s, [, w]) => s + w, 0);

function pickOp(world) {
    let r = world.rand() * OP_TOTAL;
    for (const [name, weight] of OPS) {
        r -= weight;
        if (r <= 0) return name;
    }
    return 'pull';
}

function runOnce(seed, variant, skewMode) {
    const world = new World(seed, variant, skewMode);
    world.server = variant === 'V2' ? new V2Server(world) : new V1Server();
    const names = ['ios', 'webA', 'webB'];
    world.devices = names.map((n, i) => {
        const skew = i === 0 ? 0 : world.skew();
        return variant === 'V2' ? new V2Device(world, n, skew) : new V1Device(world, n, skew, variant === 'V1-ideal');
    });
    for (let step = 0; step < STEPS; step++) {
        world.T += world.dt();
        const dev = world.pick(world.devices);
        if (dev.inflight && world.chance(0.3)) {
            dev.ack();
            continue;
        }
        const op = pickOp(world);
        if (op !== 'undo' && op !== 'push' && op !== 'pull') dev.lastAnswer = null;
        switch (op) {
            case 'push': dev.push(); break;
            case 'pull': dev.pull(); break;
            case 'toggle': dev.online = !dev.online; break;
            case 'evict':
                // A browser loses its local copy after everything was uploaded (Safari's 7-day rule).
                if (dev.name !== 'ios' && !dev.pending()) {
                    if (variant === 'V2') STATS.evict++;
                    if (variant === 'V2') dev.fresh();
                    else dev.fresh(true);
                }
                break;
            default: dev[op]();
        }
    }
    for (const d of world.devices) d.online = true;
    for (let round = 0; round < 8; round++) {
        for (const d of world.devices) {
            if (d.inflight) d.ack(true);
            d.push(true);
            d.ack(true);
            d.pull();
        }
    }
    return check(world);
}

function check(world) {
    const v = world.variant;
    const snaps = world.devices.map((d) => d.snapshot());
    const server = v === 'V2' ? v2ServerSnapshot(world.server) : v1ServerSnapshot(world.server);
    const failures = new Set();

    const comparable = (s) => JSON.stringify({ objs: s.objs, revs: s.revs });
    if (snaps.some((s) => comparable(s) !== comparable(snaps[0])) || comparable(snaps[0]) !== comparable(server)) {
        failures.add('diverged');
    }

    const superseded = world.reg.superseded();
    for (const s of snaps) {
        for (const [key, field, w] of s.prov) {
            if (superseded.has(`${key}|${field}|${w}`)) failures.add(`lost:${key.split(':')[0]}.${field}`);
        }
    }

    const expectedRevs = [...world.answers].filter(([, a]) => !a.undone).map(([fp]) => fp).sort().join();
    for (const s of [...snaps, server]) if (s.revs.join() !== expectedRevs) failures.add('revlog');

    const expectedSessions = [...world.sessions].filter(([, s]) => !s.deleted).map(([fp]) => fp).sort().join();
    for (const s of snaps) {
        const sessions = Object.entries(s.objs).filter(([k]) => k.startsWith('session:')).map(([, o]) => o.info.fp).sort().join();
        if (sessions !== expectedSessions) failures.add('sessions');
        const decks = Object.entries(s.objs).filter(([k]) => k.startsWith('deck:'));
        const names = decks.map(([, o]) => o.name);
        if (new Set(names).size !== names.length) failures.add('deck-names');
        const live = new Set(decks.map(([k]) => Number(k.slice(5))));
        for (const c of CARDS) if (!live.has(s.objs[`card:${c}`].place)) failures.add('dangling-card');
    }
    return failures;
}

export { runOnce };
const table = [];
for (const skewMode of RUNS ? (process.argv[5] ?? 'none,mixed,ids').split(',') : []) {
    for (const variant of MUTANT ? ['V2'] : ['V1-code', 'V1-ideal', 'V2']) {
        const counts = new Map();
        let failedRuns = 0;
        for (let i = 0; i < RUNS; i++) {
            const failures = runOnce(SEED0 + i, variant, skewMode);
            if (failures.size) failedRuns++;
            for (const f of failures) counts.set(f, (counts.get(f) ?? 0) + 1);
        }
        const detail = [...counts].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${((100 * n) / RUNS).toFixed(1)}%`).join(', ');
        table.push({ skew: skewMode, variant, failedRuns: `${((100 * failedRuns) / RUNS).toFixed(1)}%`, detail: detail || '-' });
    }
}
console.log(`${RUNS} random runs per row, ${STEPS} steps each, 3 devices${MUTANT ? `, V2 mutant: ${MUTANT}` : ''}`);
console.table(table);
console.log('V2 paths exercised (all V2 rows together):', STATS);
