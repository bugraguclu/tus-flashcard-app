"""Generate next-state vectors from the installed Anki (oracle for TusAnkiM's FSRS engine).

Every case puts one card into a chosen state, asks Anki's backend for the four answer outcomes
and records inputs + outputs. No queue is built, so the load balancer is off and plain fuzz
applies (the load balancer is covered by a separate generator).
"""
import json
import math
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection
from anki.config import Config

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 400
OUT = sys.argv[3] if len(sys.argv) > 3 else "states.json"

rng = random.Random(SEED)
DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
BOUNDS = [(0.001, 100)] * 4 + [(1, 10), (0.001, 4), (0.001, 4), (0.001, 0.75), (0, 4.5), (0, 0.8),
          (0.001, 3.5), (0.001, 5), (0.001, 0.25), (0.001, 0.9), (0, 4), (0, 1), (1, 6), (0, 2),
          (0, 2), (0, 0.8), (0.1, 0.8)]


def random_params():
    roll = rng.random()
    if roll < 0.25:
        return []  # preset never optimized: Anki uses the defaults
    if roll < 0.35:
        return list(DEFAULT)
    params = []
    for (lo, hi), d in zip(BOUNDS, DEFAULT):
        if rng.random() < 0.5:
            params.append(round(rng.uniform(lo, hi), 4))
        else:
            params.append(d)
    params[0:4] = sorted(params[0:4])
    if rng.random() < 0.05:
        params[rng.randrange(21)] = rng.choice([-1.0, 50.0, 200.0])  # out of bounds: clamped
    if rng.random() < 0.08:
        params = params[:19]  # FSRS-5 list
    elif rng.random() < 0.05:
        params = params[:17]  # FSRS-4.5 list
    return params


def random_steps(kind):
    roll = rng.random()
    if roll < 0.2:
        return []
    if kind == "learn":
        return rng.choice([[1.0, 10.0], [1.0], [10.0], [1.0, 10.0, 60.0], [0.5, 5.0], [15.0, 1440.0],
                           [1.0, 10.0, 1440.0, 4320.0], [30.0]])
    return rng.choice([[10.0], [1.0], [5.0, 20.0], [10.0, 1440.0], [60.0]])


def set_config(col, did, params, dr, max_ivl, learn, relearn, hist):
    conf = col.decks.config_dict_for_deck_id(did)
    conf["fsrsParams6"] = params if len(params) == 21 else []
    conf["fsrsParams5"] = params if len(params) == 19 else []
    conf["fsrsWeights"] = params if len(params) == 17 else []
    conf["desiredRetention"] = dr
    conf["sm2Retention"] = hist
    conf["rev"]["maxIvl"] = max_ivl
    conf["new"]["delays"] = learn
    conf["lapse"]["delays"] = relearn
    col.decks.update_config(conf)


def state_to_dict(state):
    kind = state.WhichOneof("kind")
    if kind == "normal":
        normal = state.normal
    else:
        filtered = state.filtered
        return {"filtered": str(filtered)}
    which = normal.WhichOneof("kind")
    inner = getattr(normal, which)
    out = {"kind": which}
    if which == "review":
        out.update(days=inner.scheduled_days, elapsed=inner.elapsed_days, ease=inner.ease_factor,
                   lapses=inner.lapses, leeched=inner.leeched)
        mem = inner.memory_state if inner.HasField("memory_state") else None
    elif which == "learning":
        out.update(secs=inner.scheduled_secs, remaining=inner.remaining_steps)
        mem = inner.memory_state if inner.HasField("memory_state") else None
    elif which == "relearning":
        out.update(secs=inner.learning.scheduled_secs, remaining=inner.learning.remaining_steps,
                   days=inner.review.scheduled_days, ease=inner.review.ease_factor,
                   lapses=inner.review.lapses, leeched=inner.review.leeched)
        mem = inner.learning.memory_state if inner.learning.HasField("memory_state") else None
    else:
        mem = None
        out.update(position=inner.position)
    if mem is not None:
        out["s"] = mem.stability
        out["d"] = mem.difficulty
    return out


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    col.set_config("fsrs", True)
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")

    cases = []
    for index in range(COUNT):
        params = random_params()
        dr = round(rng.uniform(0.7, 0.99), 2)
        max_ivl = rng.choice([36500] * 6 + [30, 100, 365, 7])
        learn = random_steps("learn")
        relearn = random_steps("relearn")
        hist = round(rng.uniform(0.75, 0.97), 2)
        short_term = rng.random() < 0.3
        set_config(col, did, params, dr, max_ivl, learn, relearn, hist)
        col.set_config_bool(Config.Bool.FSRS_SHORT_TERM_WITH_STEPS_ENABLED, short_term)

        note = col.new_note(model)
        note["Front"] = f"case {index}"
        col.add_note(note, did)
        cid = note.card_ids()[0]

        timing = col._backend.sched_timing_today()
        today = timing.days_elapsed
        next_day_at = timing.next_day_at
        now = int(time.time())

        kind = rng.choices(["new", "learning", "review", "relearning"], [1, 2, 6, 2])[0]
        reps = rng.randrange(0, 60)
        lapses = rng.randrange(0, 8)
        factor = rng.choice([1300, 1800, 2500, 2500, 2800, 3500])
        stability = math.exp(rng.uniform(math.log(0.05), math.log(4000)))
        difficulty = rng.uniform(1, 10)
        has_memory = rng.random() < 0.9
        has_lrt = rng.random() < 0.85
        elapsed_days = rng.choice([0, 0, 1, 2, 3, int(stability * rng.uniform(0, 3)),
                                   rng.randrange(0, 400)])
        lrt = None
        if has_lrt:
            # a time `elapsed_days` study days back, somewhere inside that day
            lrt = next_day_at - elapsed_days * 86400 - rng.randrange(1, 86400)
            lrt = min(lrt, now)
        data = {}
        if has_memory and kind != "new":
            data["s"] = round(stability, 4)
            data["d"] = round(difficulty, 3)
        if lrt is not None and kind != "new":
            data["lrt"] = lrt

        card = {"kind": kind, "reps": reps, "lapses": lapses, "factor": factor}
        if kind == "new":
            ctype, queue, due, ivl, left = 0, 0, index + 1, 0, 0
            reps, lapses, factor = 0, 0, 0
        elif kind == "learning":
            factor = 0
            steps_total = max(1, len(learn))
            remaining = rng.randrange(1, steps_total + 1)
            ctype, ivl = 1, 0
            if rng.random() < 0.8:
                queue, due = 1, now + rng.randrange(-3600, 3600)
            else:
                queue, due = 3, today + rng.randrange(-2, 2)
            left = remaining + 1000 * rng.randrange(0, remaining + 1)
        elif kind == "review":
            ivl = max(0, int(stability * rng.uniform(0.3, 1.6))) if rng.random() < 0.9 else rng.randrange(0, 5)
            ctype, queue = 2, 2
            due = today + ivl - elapsed_days if ivl > 0 else today - rng.randrange(0, 5)
            left = 0
        else:
            steps_total = max(1, len(relearn))
            remaining = rng.randrange(1, steps_total + 1)
            ctype = 3
            ivl = max(1, int(stability * rng.uniform(0.1, 0.8)))
            if rng.random() < 0.8:
                queue, due = 1, now + rng.randrange(-3600, 3600)
            else:
                queue, due = 3, today + rng.randrange(-2, 2)
            left = remaining + 1000 * rng.randrange(0, remaining + 1)

        col.db.execute(
            "update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, data=? where id=?",
            ctype, queue, due, ivl, factor, reps, lapses, left, json.dumps(data) if data else "", cid,
        )
        states = col._backend.get_scheduling_states(cid)
        card.update(id=cid, type=ctype, queue=queue, due=due, ivl=ivl, left=left, reps=reps,
                    lapses=lapses, factor=factor, data=data)
        cases.append({
            "index": index,
            "config": {"params": params, "desiredRetention": dr, "maxInterval": max_ivl,
                       "learnSteps": learn, "relearnSteps": relearn, "historicalRetention": hist,
                       "shortTermWithSteps": short_term},
            "timing": {"now": now, "today": today, "nextDayAt": next_day_at},
            "card": card,
            "out": {name: state_to_dict(getattr(states, name))
                    for name in ("current", "again", "hard", "good", "easy")},
        })
    import anki.buildinfo as buildinfo
    meta = {"anki": buildinfo.version, "buildhash": buildinfo.buildhash, "seed": SEED,
            "tzOffsetSecs": -time.timezone if not time.daylight else -time.altzone,
            "rolloverHour": col.get_config("rollover", 4)}
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"meta": meta, "cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


main()
