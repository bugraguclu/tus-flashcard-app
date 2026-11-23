/** The first design: row-level last-writer-wins on device-clock seconds, usn = -1 marking as today's code does it. */
import { CARDS, DECK_NAMES, SETTING_FIELDS, LOSS_REQ, LOSS_RESP, clone, initialState, liveRevs } from './sim-common.mjs';

const wrap0 = (fields) => Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, { v, w: 0 }]));

export class V1Server {
    constructor() {
        this.usn = 0;
        this.rows = new Map();
        this.revs = new Map();
        for (const [key, fields] of initialState()) this.rows.set(key, { data: wrap0(fields), mod: 0, usn: 0, del: false });
    }

    apply(p) {
        const usn = ++this.usn;
        for (const r of p.rows) {
            const cur = this.rows.get(r.key);
            if (cur?.del) continue; // a grave always wins
            if (!cur || r.mod >= cur.mod) this.rows.set(r.key, { data: clone(r.data), mod: r.mod, usn, del: false });
        }
        for (const key of p.graves) this.rows.set(key, { data: null, mod: 0, usn, del: true });
        for (const rv of p.revs) {
            const cur = this.revs.get(rv.id);
            if (!cur) this.revs.set(rv.id, { card: rv.card, fp: rv.fp, del: rv.del, usn });
            else if (rv.del && !cur.del && cur.fp === rv.fp) this.revs.set(rv.id, { ...cur, del: true, usn });
        }
        return usn;
    }

    pull(since) {
        const rows = [];
        for (const [key, r] of this.rows) if (r.usn > since) rows.push({ key, ...clone(r) });
        const revs = [];
        for (const [id, r] of this.revs) if (r.usn > since) revs.push({ id, ...clone(r) });
        return { rows, revs, usn: this.usn };
    }
}

export class V1Device {
    constructor(world, name, skew, ideal) {
        this.w = world;
        this.name = name;
        this.skew = skew;
        this.ideal = ideal;
        this.lastId = 0;
        this.nSessions = 0;
        this.fresh(false);
    }

    fresh(seedDefaults) {
        this.rows = new Map();
        for (const [key, fields] of initialState()) this.rows.set(key, { data: wrap0(fields), mod: 0, usn: 0 });
        if (seedDefaults) {
            // A first launch seeds its defaults (built-in note types, the default preset) as new rows.
            const row = this.rows.get('settings');
            row.mod = this.mod();
            row.usn = -1;
        }
        this.revs = new Map();
        this.graves = new Set();
        this.lastPulled = 0;
        this.inflight = null;
        this.lastAnswer = null;
        this.online = true;
    }

    nowMs() {
        return this.w.T + this.skew;
    }

    mod() {
        return Math.floor(this.nowMs() / 1000);
    }

    uniqueId() {
        const now = this.w.idTime(this.nowMs());
        this.lastId = now > this.lastId ? now : this.lastId + 1;
        return this.lastId;
    }

    set(key, field, value, { markDirty = true, bumpMod = true, parentW } = {}) {
        const row = this.rows.get(key);
        const prev = row.data[field];
        row.data[field] = { v: value, w: this.w.reg.add(key, field, parentW !== undefined ? parentW : prev?.w ?? null) };
        if (bumpMod || this.ideal) row.mod = this.mod();
        if (markDirty || this.ideal) row.usn = -1;
    }

    liveDecks() {
        return [...this.rows].filter(([k]) => k.startsWith('deck:')).map(([k, r]) => ({ id: Number(k.slice(5)), name: r.data.name.v }));
    }

    pending() {
        return this.inflight || this.graves.size || [...this.rows.values()].some((r) => r.usn === -1) || [...this.revs.values()].some((r) => r.usn === -1);
    }

    answer() {
        const card = this.w.pick(CARDS);
        const key = `card:${card}`;
        const before = clone(this.rows.get(key).data.sched);
        const id = this.uniqueId();
        const fp = `${this.name}:a${++this.w.answerSeq}`;
        this.set(key, 'sched', { reps: before.v.reps + 1, last: id });
        this.revs.set(id, { card, fp, usn: -1, del: false });
        this.w.answers.set(fp, { undone: false });
        this.lastAnswer = { key, id, fp, before, ansW: this.rows.get(key).data.sched.w };
    }

    undo() {
        const a = this.lastAnswer;
        this.lastAnswer = null;
        if (!a || this.rows.get(a.key).data.sched.w !== a.ansW) return;
        // studyAnswer.undoAnswer: restored = { ...current } with the snapshot's scheduling, so the
        // row keeps the answer's mod and whatever usn it has now.
        this.set(a.key, 'sched', a.before.v, { markDirty: false, bumpMod: false, parentW: a.ansW });
        const rev = this.revs.get(a.id);
        if (rev && rev.fp === a.fp) {
            rev.del = true;
            rev.usn = -1;
        }
        this.w.answers.get(a.fp).undone = true;
    }

    flag() {
        const key = `card:${this.w.pick(CARDS)}`;
        // noteStore.setCardFlag / suspendCard: mod = now, usn as loaded.
        this.set(key, 'flag', (this.rows.get(key).data.flag.v + 1) % 4, { markDirty: false });
    }

    suspend() {
        const key = `card:${this.w.pick(CARDS)}`;
        this.set(key, 'susp', this.rows.get(key).data.susp.v ? 0 : 1, { markDirty: false });
    }

    move() {
        this.set(`card:${this.w.pick(CARDS)}`, 'place', this.w.pick(this.liveDecks()).id);
    }

    setting() {
        const f = this.w.pick(SETTING_FIELDS);
        const cur = this.rows.get('settings').data[f].v;
        this.set('settings', f, f === 'fsrs' ? !cur : f === 'lang' ? (cur === 'tr' ? 'en' : 'tr') : (cur + 1) % 24);
    }

    createDeck() {
        const name = this.w.pick(DECK_NAMES);
        if (this.liveDecks().some((d) => d.name === name)) return;
        const key = `deck:${this.uniqueId()}`;
        this.rows.set(key, { data: {}, mod: this.mod(), usn: -1 });
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
        for (const c of CARDS) if (this.rows.get(`card:${c}`).data.place.v === id) this.set(`card:${c}`, 'place', 1);
        this.rows.delete(`deck:${id}`);
        this.graves.add(`deck:${id}`);
    }

    addSession() {
        let max = 0;
        for (const k of this.rows.keys()) if (k.startsWith('session:')) max = Math.max(max, Number(k.slice(8)));
        // stopwatchStore.nextSessionId: creation time, moved past the newest id.
        const key = `session:${Math.max(this.w.idTime(this.nowMs()), max + 1)}`;
        const fp = `${this.name}:s${++this.nSessions}`;
        this.rows.set(key, { data: {}, mod: this.mod(), usn: -1 });
        this.set(key, 'info', { fp }, { parentW: null });
        this.w.sessions.set(fp, { deleted: false });
    }

    deleteSession() {
        const keys = [...this.rows.keys()].filter((k) => k.startsWith('session:'));
        if (!keys.length) return;
        const key = this.w.pick(keys);
        this.w.sessions.get(this.rows.get(key).data.info.v.fp).deleted = true;
        this.rows.delete(key);
        this.graves.add(key);
    }

    push(force = false) {
        if (this.inflight || !this.online) return;
        const rows = [];
        for (const [key, r] of this.rows) if (r.usn === -1) rows.push({ key, data: clone(r.data), mod: r.mod });
        const revs = [];
        for (const [id, r] of this.revs) if (r.usn === -1) revs.push({ id, card: r.card, fp: r.fp, del: r.del });
        const graves = [...this.graves];
        if (!rows.length && !revs.length && !graves.length) return;
        const usn = !force && this.w.chance(LOSS_REQ) ? null : this.w.server.apply({ rows, revs, graves });
        this.inflight = { rows, revs, graves, usn };
    }

    ack(force = false) {
        const f = this.inflight;
        this.inflight = null;
        if (!f || f.usn == null || (!force && this.w.chance(LOSS_RESP))) return;
        // Mark a row clean only if it was not edited after the push left (same mod).
        for (const r of f.rows) {
            const cur = this.rows.get(r.key);
            if (cur && cur.usn === -1 && cur.mod === r.mod) cur.usn = f.usn;
        }
        for (const r of f.revs) {
            const cur = this.revs.get(r.id);
            if (cur && cur.usn === -1 && cur.del === r.del) cur.usn = f.usn;
        }
        for (const g of f.graves) this.graves.delete(g);
    }

    pull() {
        if (!this.online) return;
        const res = this.w.server.pull(this.lastPulled);
        for (const r of res.rows) {
            if (r.del) {
                this.rows.delete(r.key);
                this.graves.delete(r.key);
                continue;
            }
            const cur = this.rows.get(r.key);
            // A clean row takes the server's copy; a dirty one keeps its edit unless the server's is newer.
            if (!cur || cur.usn !== -1 || r.mod > cur.mod) this.rows.set(r.key, { data: clone(r.data), mod: r.mod, usn: r.usn });
        }
        for (const r of res.revs) {
            const cur = this.revs.get(r.id);
            if (!cur) this.revs.set(r.id, { card: r.card, fp: r.fp, usn: r.usn, del: r.del });
            else if (r.del && !cur.del && cur.fp === r.fp) {
                cur.del = true;
                cur.usn = r.usn;
            }
        }
        this.lastPulled = res.usn;
        this.mergeSameNamedDecks();
    }

    /** First design: "same-named decks merge: the old id stays, cards move to it". */
    mergeSameNamedDecks() {
        const byName = new Map();
        for (const d of this.liveDecks()) byName.set(d.name, [...(byName.get(d.name) ?? []), d.id]);
        for (const ids of byName.values()) {
            if (ids.length < 2) continue;
            ids.sort((a, b) => a - b);
            for (const loser of ids.slice(1)) {
                for (const c of CARDS) if (this.rows.get(`card:${c}`).data.place.v === loser) this.set(`card:${c}`, 'place', ids[0]);
                this.rows.delete(`deck:${loser}`);
                this.graves.add(`deck:${loser}`);
            }
        }
    }

    snapshot() {
        const objs = {};
        for (const [k, r] of [...this.rows].sort(([a], [b]) => (a < b ? -1 : 1))) {
            objs[k] = Object.fromEntries(Object.entries(r.data).map(([f, x]) => [f, x.v]));
        }
        return { objs, prov: this.provenance(), revs: liveRevs(this.revs) };
    }

    provenance() {
        const out = [];
        for (const [k, r] of this.rows) for (const [f, x] of Object.entries(r.data)) out.push([k, f, x.w]);
        return out;
    }
}

export function v1ServerSnapshot(server) {
    const objs = {};
    for (const [k, r] of [...server.rows].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!r.del) objs[k] = Object.fromEntries(Object.entries(r.data).map(([f, x]) => [f, x.v]));
    }
    return { objs, revs: liveRevs(server.revs) };
}


