/** The revised design: captured writes, hybrid logical clock, per-field last-writer-wins, identity check, derived repairs. */
import { CARDS, DECK_NAMES, SETTING_FIELDS, LOSS_REQ, LOSS_RESP, T0, MUTANTS, STATS, clone, initialState, liveRevs } from './sim-common.mjs';

/** Field versions compare by hybrid clock, then by device: a total order every replica shares. */
const newer = (a, b) => {
    if (!b) return true;
    if (!a) return false;
    if (a.h !== b.h) return a.h > b.h;
    return a.d > b.d;
};

const wrapH0 = (fields) => Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, { v, w: 0, h: 0, d: '' }]));
const identOf0 = (key) => key;

export class V2Server {
    constructor(world) {
        this.w = world;
        this.usn = 0;
        this.objs = new Map();
        this.revs = new Map();
        for (const [key, fields] of initialState()) this.objs.set(key, { fields: wrapH0(fields), usn: 0, ident: identOf0(key) });
    }

    apply(p) {
        const usn = this.usn + 1;
        let changed = false;
        const conflicts = [];
        const revConflicts = [];
        const winners = [];
        for (const o of p.objs) {
            let cur = this.objs.get(o.key);
            if (cur && cur.ident !== o.ident && !MUTANTS.has('no-ident')) {
                conflicts.push(o.key); // same id, different object: the device must re-id its own
                continue;
            }
            if (!cur) {
                cur = { fields: {}, usn, ident: o.ident };
                this.objs.set(o.key, cur);
                changed = true;
            }
            for (const [f, val] of Object.entries(o.fields)) {
                if (newer(val, cur.fields[f])) {
                    cur.fields[f] = clone(val);
                    cur.usn = usn;
                    changed = true;
                } else if (cur.fields[f].w !== val.w && !MUTANTS.has('no-winners')) {
                    winners.push({ key: o.key, ident: cur.ident, field: f, val: clone(cur.fields[f]) });
                }
            }
        }
        for (const r of p.revs) {
            const cur = this.revs.get(r.id);
            if (cur && cur.fp !== r.fp) {
                revConflicts.push(r.id);
                continue;
            }
            if (!cur) {
                this.revs.set(r.id, { card: r.card, fp: r.fp, del: r.del, usn });
                changed = true;
            } else if (r.del && !cur.del) {
                cur.del = true;
                cur.usn = usn;
                changed = true;
            }
        }
        if (changed) this.usn = usn;
        return { usn: this.usn, conflicts, revConflicts, winners, now: this.w.T };
    }

    pull(since) {
        const objs = [];
        for (const [key, o] of this.objs) if (o.usn > since) objs.push({ key, ident: o.ident, fields: clone(o.fields) });
        const revs = [];
        for (const [id, r] of this.revs) if (r.usn > since) revs.push({ id, ...clone(r) });
        return { objs, revs, usn: this.usn, now: this.w.T };
    }
}

export class V2Device {
    constructor(world, name, skew) {
        this.w = world;
        this.name = name;
        this.skew = skew;
        this.lastId = 0;
        this.nSessions = 0;
        this.nDecks = 0;
        this.fresh();
    }

    fresh() {
        this.objs = new Map();
        this.idents = new Map();
        for (const [key, fields] of initialState()) {
            this.objs.set(key, wrapH0(fields)); // defaults sit at clock 0 and never beat a real edit
            this.idents.set(key, identOf0(key));
        }
        this.revs = new Map();
        this.outbox = new Map();
        this.revOut = new Map();
        this.seq = 0;
        this.hlc = 0;
        this.offset = 0;
        this.lastPulled = 0;
        this.inflight = null;
        this.lastAnswer = null;
        this.online = true;
        if (MUTANTS.has('defaults-now') && this.w.T > T0) {
            for (const f of SETTING_FIELDS) Object.assign(this.objs.get('settings')[f], { h: this.tick(), d: this.name });
            this.outbox.set('settings', ++this.seq);
        }
    }

    deviceMs() {
        return this.w.T + this.skew;
    }

    tick() {
        const physical = Math.floor(this.deviceMs() + this.offset) * 1000;
        this.hlc = Math.max(this.hlc + 1, physical);
        return this.hlc;
    }

    observe(h) {
        if (MUTANTS.has('no-observe')) return;
        if (h > this.hlc) this.hlc = h;
    }

    uniqueId() {
        const now = this.w.idTime(this.deviceMs());
        this.lastId = now > this.lastId ? now : this.lastId + 1;
        return this.lastId;
    }

    /** Captured write. A derived write (a repair every replica would make) sits one tick above its base. */
    set(key, field, value, { parentW, derived = false } = {}) {
        const obj = this.objs.get(key);
        const prev = obj[field];
        const h = derived ? (prev?.h ?? 0) + 1 : this.tick();
        obj[field] = { v: value, w: this.w.reg.add(key, field, parentW !== undefined ? parentW : prev?.w ?? null), h, d: this.name };
        if (MUTANTS.has('row-lww')) for (const other of Object.values(obj)) Object.assign(other, { h, d: this.name });
        this.outbox.set(key, ++this.seq);
    }

    liveDecks() {
        return [...this.objs].filter(([k, o]) => k.startsWith('deck:') && !o.del?.v).map(([k, o]) => ({ id: Number(k.slice(5)), name: o.name.v }));
    }

    pending() {
        return this.inflight || this.outbox.size || this.revOut.size;
    }

    answer() {
        const card = this.w.pick(CARDS);
        const key = `card:${card}`;
        const before = clone(this.objs.get(key).sched);
        let id = this.uniqueId();
        while (this.revs.has(id)) id++;
        const fp = `${this.name}:a${++this.w.answerSeq}`;
        this.set(key, 'sched', { reps: before.v.reps + 1, last: id });
        this.revs.set(id, { card, fp, del: false });
        this.revOut.set(id, ++this.seq);
        this.w.answers.set(fp, { undone: false });
        this.lastAnswer = { key, fp, before, ansW: this.objs.get(key).sched.w };
    }

    undo() {
        const a = this.lastAnswer;
        this.lastAnswer = null;
        if (!a || this.objs.get(a.key).sched.w !== a.ansW) return;
        this.set(a.key, 'sched', a.before.v, { parentW: a.ansW }); // a new version, stamped now
        for (const [id, r] of this.revs) {
            if (r.fp !== a.fp) continue;
            r.del = true;
            this.revOut.set(id, ++this.seq);
        }
        this.w.answers.get(a.fp).undone = true;
    }

    flag() {
        const key = `card:${this.w.pick(CARDS)}`;
        this.set(key, 'flag', (this.objs.get(key).flag.v + 1) % 4);
    }

    suspend() {
        const key = `card:${this.w.pick(CARDS)}`;
        this.set(key, 'susp', this.objs.get(key).susp.v ? 0 : 1);
    }

    move() {
        this.set(`card:${this.w.pick(CARDS)}`, 'place', this.w.pick(this.liveDecks()).id);
    }

    setting() {
        const f = this.w.pick(SETTING_FIELDS);
        const cur = this.objs.get('settings')[f].v;
        this.set('settings', f, f === 'fsrs' ? !cur : f === 'lang' ? (cur === 'tr' ? 'en' : 'tr') : (cur + 1) % 24);
    }

    createDeck() {
        const name = this.w.pick(DECK_NAMES);
        if (this.liveDecks().some((d) => d.name === name)) return;
        const key = `deck:${this.uniqueId()}`;
        if (this.objs.has(key)) return;
        this.objs.set(key, {});
        this.idents.set(key, `${this.name}:d${++this.nDecks}`);
        this.set(key, 'name', name, { parentW: null });
    }

    renameDeck() {
        const decks = this.liveDecks().filter((d) => d.id !== 1);
        const name = this.w.pick(DECK_NAMES);
        if (!decks.length || this.liveDecks().some((d) => d.name === name)) return;
        this.set(`deck:${this.w.pick(decks).id}`, 'name', name);
    }

    deleteDeck() {
        const decks = this.liveDecks().filter((d) => d.id !== 1);
        if (!decks.length) return;
        const id = this.w.pick(decks).id;
        for (const c of CARDS) if (this.objs.get(`card:${c}`).place.v === id) this.set(`card:${c}`, 'place', 1);
        this.set(`deck:${id}`, 'del', true);
    }

    addSession() {
        let max = 0;
        for (const k of this.objs.keys()) if (k.startsWith('session:')) max = Math.max(max, Number(k.slice(8)));
        const key = `session:${Math.max(this.w.idTime(this.deviceMs()), max + 1)}`;
        const fp = `${this.name}:s${++this.nSessions}`;
        this.objs.set(key, {});
        this.idents.set(key, fp);
        this.set(key, 'info', { fp }, { parentW: null });
        this.w.sessions.set(fp, { deleted: false });
    }

    deleteSession() {
        const keys = [...this.objs].filter(([k, o]) => k.startsWith('session:') && !o.del?.v).map(([k]) => k);
        if (!keys.length) return;
        const key = this.w.pick(keys);
        this.w.sessions.get(this.objs.get(key).info.v.fp).deleted = true;
        this.set(key, 'del', true);
    }

    /** The server holds another object under this id: move ours to a fresh id. */
    reid(oldKey) {
        const obj = this.objs.get(oldKey);
        if (!obj) return;
        STATS.reid++;
        const prefix = oldKey.slice(0, oldKey.indexOf(':') + 1);
        let id = this.uniqueId();
        while (this.objs.has(prefix + id)) id = this.uniqueId();
        const newKey = prefix + id;
        this.objs.set(newKey, obj);
        this.idents.set(newKey, this.idents.get(oldKey));
        this.objs.delete(oldKey);
        this.idents.delete(oldKey);
        this.outbox.delete(oldKey);
        this.outbox.set(newKey, ++this.seq);
        if (prefix === 'deck:') {
            const oldId = Number(oldKey.slice(5));
            for (const c of CARDS) if (this.objs.get(`card:${c}`).place.v === oldId) this.set(`card:${c}`, 'place', id, { derived: true });
        }
    }

    reidRev(oldId) {
        const rev = this.revs.get(oldId);
        if (!rev) return;
        STATS.revReid++;
        let id = oldId + 1;
        while (this.revs.has(id)) id++;
        this.revs.set(id, rev);
        this.revs.delete(oldId);
        this.revOut.delete(oldId);
        this.revOut.set(id, ++this.seq);
    }

    push(force = false) {
        if (this.inflight || !this.online) return;
        if (!this.outbox.size && !this.revOut.size) return;
        const upTo = this.seq;
        const objs = [...this.outbox.keys()].map((key) => ({ key, ident: this.idents.get(key), fields: clone(this.objs.get(key)) }));
        const revs = [...this.revOut.keys()].map((id) => ({ id, ...clone(this.revs.get(id)) }));
        const res = !force && this.w.chance(LOSS_REQ) ? null : this.w.server.apply({ objs, revs });
        if (!res) STATS.lostReq++;
        const offset = res ? res.now - this.deviceMs() + (this.w.rand() - 0.5) * 2_000 : null;
        this.inflight = { upTo, objs, revs, res, offset };
    }

    ack(force = false) {
        const f = this.inflight;
        this.inflight = null;
        const lost = !!(f && f.res && !force && this.w.chance(LOSS_RESP));
        if (lost) STATS.lostResp++;
        if (!f || !f.res || lost) return;
        if (!MUTANTS.has('no-offset')) this.offset = f.offset;
        if (MUTANTS.has('ack-all')) {
            for (const o of f.objs) this.outbox.delete(o.key);
            for (const r of f.revs) this.revOut.delete(r.id);
        }
        const conflicted = new Set(f.res.conflicts);
        const revConflicted = new Set(f.res.revConflicts);
        // Only entries not touched again since the push left are clean now.
        for (const o of f.objs) if (!conflicted.has(o.key) && (this.outbox.get(o.key) ?? Infinity) <= f.upTo) this.outbox.delete(o.key);
        for (const r of f.revs) if (!revConflicted.has(r.id) && (this.revOut.get(r.id) ?? Infinity) <= f.upTo) this.revOut.delete(r.id);
        for (const win of f.res.winners) {
            const cur = this.objs.get(win.key);
            if (!cur || this.idents.get(win.key) !== win.ident) continue;
            this.observe(win.val.h);
            if (newer(win.val, cur[win.field])) cur[win.field] = win.val;
        }
        for (const key of conflicted) if (this.objs.has(key) && this.idents.get(key) === f.objs.find((o) => o.key === key).ident) this.reid(key);
        for (const id of revConflicted) if (this.revs.get(id)?.fp === f.revs.find((r) => r.id === id).fp) this.reidRev(id);
    }

    pull() {
        if (!this.online) return;
        const res = this.w.server.pull(this.lastPulled);
        for (const o of res.objs) {
            if (this.objs.has(o.key) && this.idents.get(o.key) !== o.ident && !MUTANTS.has('no-ident')) this.reid(o.key);
            let cur = this.objs.get(o.key);
            if (!cur) {
                cur = {};
                this.objs.set(o.key, cur);
                this.idents.set(o.key, o.ident);
            }
            for (const [f, val] of Object.entries(o.fields)) {
                this.observe(val.h);
                if (newer(val, cur[f])) cur[f] = clone(val);
                else if (cur[f] && cur[f].w !== val.w) STATS.staleField++;
            }
        }
        for (const r of res.revs) {
            if (this.revs.has(r.id) && this.revs.get(r.id).fp !== r.fp) this.reidRev(r.id);
            const cur = this.revs.get(r.id);
            if (!cur) this.revs.set(r.id, { card: r.card, fp: r.fp, del: r.del });
            else if (r.del) cur.del = true;
        }
        this.lastPulled = res.usn;
        this.repair();
    }

    /** Deterministic repairs every replica makes the same way, as derived writes. */
    repair() {
        if (MUTANTS.has('no-repair')) return;
        const byName = new Map();
        for (const d of this.liveDecks()) byName.set(d.name, [...(byName.get(d.name) ?? []), d.id]);
        for (const ids of byName.values()) {
            if (ids.length < 2) continue;
            ids.sort((a, b) => a - b);
            for (const loser of ids.slice(1)) {
                STATS.deckMerge++;
                this.set(`deck:${loser}`, 'mergedInto', ids[0], { derived: true });
                this.set(`deck:${loser}`, 'del', true, { derived: true });
            }
        }
        for (const c of CARDS) {
            const key = `card:${c}`;
            const deck = this.objs.get(`deck:${this.objs.get(key).place.v}`);
            if (!deck || !deck.del?.v) continue;
            STATS.cardRepair++;
            this.set(key, 'place', this.resolveDeck(this.objs.get(key).place.v), { derived: true });
        }
    }

    resolveDeck(id) {
        const seen = new Set();
        for (;;) {
            const deck = this.objs.get(`deck:${id}`);
            if (!deck) return 1;
            if (!deck.del?.v) return id;
            if (seen.has(id) || deck.mergedInto?.v == null) return 1;
            seen.add(id);
            id = deck.mergedInto.v;
        }
    }

    snapshot() {
        const objs = {};
        for (const [k, o] of [...this.objs].sort(([a], [b]) => (a < b ? -1 : 1))) {
            if (o.del?.v) continue;
            objs[k] = Object.fromEntries(Object.entries(o).filter(([f]) => f !== 'mergedInto').map(([f, x]) => [f, x.v]));
        }
        return { objs, prov: this.provenance(), revs: liveRevs(this.revs) };
    }

    provenance() {
        const out = [];
        for (const [k, o] of this.objs) {
            if (o.del?.v) continue;
            for (const [f, x] of Object.entries(o)) if (f !== 'mergedInto') out.push([k, f, x.w]);
        }
        return out;
    }
}

export function v2ServerSnapshot(server) {
    const objs = {};
    for (const [k, o] of [...server.objs].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (o.fields.del?.v) continue;
        objs[k] = Object.fromEntries(Object.entries(o.fields).filter(([f]) => f !== 'mergedInto').map(([f, x]) => [f, x.v]));
    }
    return { objs, revs: liveRevs(server.revs) };
}

