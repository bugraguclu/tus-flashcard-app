/** Shared pieces of the sync fuzzer: constants, random numbers, the starting collection, the write registry. */
export const STEPS = 160;
export const LOSS_REQ = 0.08;
export const LOSS_RESP = 0.1;
export const T0 = 1_780_000_000_000;
/** Break one V2 mechanism on purpose to prove the checker notices: node sync-sim.mjs 1000 1 <mutant>. */
export const MUTANT = process.argv[4] ?? '';
export const MUTANTS = new Set(MUTANT.split('+').filter(Boolean));
export const STATS = { reid: 0, revReid: 0, deckMerge: 0, cardRepair: 0, evict: 0, lostReq: 0, lostResp: 0, staleField: 0 };

export const CARDS = ['c1', 'c2', 'c3', 'c4', 'c5'];
export const DECK_NAMES = ['Anatomi', 'Farma', 'Patoloji'];
export const SETTING_FIELDS = ['lang', 'rollover', 'fsrs'];

export function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function initialState() {
    const objs = new Map();
    for (const c of CARDS) objs.set(`card:${c}`, { sched: { reps: 0, last: 0 }, place: 1, flag: 0, susp: 0 });
    objs.set('deck:1', { name: 'Default' });
    objs.set('settings', { lang: 'tr', rollover: 4, fsrs: false });
    return objs;
}

/** Every intended write, with the writes it was based on (its causal ancestors). */
export class Registry {
    constructor() {
        this.writes = new Map();
        this.next = 1;
    }

    add(key, field, parentW) {
        const w = this.next++;
        const anc = new Set();
        if (parentW != null) {
            anc.add(parentW);
            const parent = this.writes.get(parentW);
            if (parent) for (const a of parent.anc) anc.add(a);
        }
        this.writes.set(w, { key, field, anc });
        return w;
    }

    /** "key|field|w" for every value some later write was based on, so it must not be final. */
    superseded() {
        const out = new Set();
        for (const write of this.writes.values()) for (const a of write.anc) out.add(`${write.key}|${write.field}|${a}`);
        return out;
    }
}

export class World {
    constructor(seed, variant, skewMode) {
        this.rand = makeRng(seed);
        this.variant = variant;
        this.skewMode = skewMode;
        this.T = T0;
        this.reg = new Registry();
        this.answers = new Map(); // fp -> { undone }
        this.sessions = new Map(); // fp -> { deleted }
        this.answerSeq = 0;
    }

    pick(list) {
        return list[Math.floor(this.rand() * list.length)];
    }

    chance(p) {
        return this.rand() < p;
    }

    /** Ids are creation times; the 'ids' mode rounds them to the minute so devices collide on purpose. */
    idTime(ms) {
        return this.skewMode === 'ids' ? Math.floor(ms / 60_000) * 60_000 : Math.floor(ms);
    }

    skew() {
        if (this.skewMode === 'none') return 0;
        const r = this.rand();
        const sign = this.rand() < 0.5 ? -1 : 1;
        if (r < 0.6) return 0;
        if (r < 0.85) return sign * Math.floor(this.rand() * 120_000);
        return sign * Math.floor(600_000 + this.rand() * 4_800_000);
    }

    dt() {
        const r = this.rand();
        if (r < 0.7) return 200 + this.rand() * 3_800;
        if (r < 0.95) return 4_000 + this.rand() * 116_000;
        return 1_800_000 + this.rand() * 12_600_000;
    }
}


export function liveRevs(revs) {
    return [...revs.values()].filter((r) => !r.del).map((r) => r.fp).sort();
}
