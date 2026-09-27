"""End-to-end oracle: answer cards with Anki's own answer_card and record every field it writes."""
import json
import math
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection
from anki.config import Config
from anki.scheduler.v3 import CardAnswer

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 300
OUT = sys.argv[3] if len(sys.argv) > 3 else "answers.json"
rng = random.Random(SEED)
USED_IDS = set()

DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
BOUNDS = [(0.001, 100)] * 4 + [(1, 10), (0.001, 4), (0.001, 4), (0.001, 0.75), (0, 4.5), (0, 0.8),
          (0.001, 3.5), (0.001, 5), (0.001, 0.25), (0.001, 0.9), (0, 4), (0, 1), (1, 6), (0, 2),
          (0, 2), (0, 0.8), (0.1, 0.8)]


def random_params():
    if rng.random() < 0.35:
        return []
    params = [round(rng.uniform(lo, hi), 4) if rng.random() < 0.4 else d for (lo, hi), d in zip(BOUNDS, DEFAULT)]
    params[0:4] = sorted(params[0:4])
    return params


def row(col, cid):
    r = col.db.first("select type, queue, due, ivl, factor, reps, lapses, left, odue, odid, data from cards where id=?", cid)
    keys = ["type", "queue", "due", "ivl", "factor", "reps", "lapses", "left", "odue", "odid", "data"]
    out = dict(zip(keys, r))
    out["data"] = json.loads(out["data"]) if out["data"] else {}
    return out


def unique_id(value):
    while value in USED_IDS:
        value += 1
    USED_IDS.add(value)
    return value


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    col.set_config("fsrs", True)
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    cases = []
    for index in range(COUNT):
        params = random_params()
        learn = rng.choice([[1.0, 10.0], [1.0, 10.0], [], [10.0], [1.0, 10.0, 60.0], [0.5, 5.0], [15.0, 1440.0], [1.0, 2880.0]])
        relearn = rng.choice([[10.0], [10.0], [], [1.0, 10.0], [1440.0], [5.0, 20.0]])
        conf = col.decks.config_dict_for_deck_id(did)
        conf["fsrsParams6"] = params
        conf["desiredRetention"] = round(rng.uniform(0.75, 0.97), 2)
        conf["sm2Retention"] = round(rng.uniform(0.8, 0.95), 2)
        conf["rev"]["maxIvl"] = rng.choice([36500] * 5 + [30, 180])
        conf["new"]["delays"] = learn
        conf["lapse"]["delays"] = relearn
        conf["new"]["initialFactor"] = rng.choice([2500, 2500, 2300, 2800])
        col.decks.update_config(conf)
        short_term = rng.random() < 0.3
        col.set_config_bool(Config.Bool.FSRS_SHORT_TERM_WITH_STEPS_ENABLED, short_term)

        note = col.new_note(model)
        note["Front"] = f"a{index}"
        col.add_note(note, did)
        cid = note.card_ids()[0]
        timing = col._backend.sched_timing_today()
        today, next_day_at = timing.days_elapsed, timing.next_day_at
        now = int(time.time())

        kind = rng.choices(["new", "learning", "review", "relearning"], [2, 2, 5, 2])[0]
        stability = math.exp(rng.uniform(math.log(0.05), math.log(1500)))
        data = {}
        if kind != "new" and rng.random() < 0.85:
            data["s"] = round(stability, 4)
            data["d"] = round(rng.uniform(1, 10), 3)
        elapsed = rng.choice([0, 0, 1, 2, int(stability * rng.uniform(0.2, 2.5)), rng.randrange(0, 200)])
        lrt = next_day_at - elapsed * 86400 - rng.randrange(1, 86400)
        lrt = min(lrt, now - 30)
        if kind != "new" and rng.random() < 0.8:
            data["lrt"] = lrt
        reps = rng.randrange(0, 40) if kind != "new" else 0
        lapses = rng.randrange(0, 9) if kind in ("review", "relearning") else 0
        factor = rng.choice([1300, 1850, 2500, 2500, 2900]) if kind in ("review", "relearning") else 0
        if kind == "new":
            ctype, queue, due, ivl, left = 0, 0, index + 1, 0, 0
        elif kind == "learning":
            steps = max(1, len(learn))
            remaining = rng.randrange(1, steps + 1)
            ctype, ivl, left = 1, 0, remaining
            if rng.random() < 0.8:
                queue, due = 1, now - rng.randrange(0, 3000)
            else:
                queue, due = 3, today - rng.randrange(0, 2)
        elif kind == "review":
            ctype, queue = 2, 2
            ivl = max(1, int(stability * rng.uniform(0.4, 1.4)))
            due = today - elapsed + ivl
            due = min(due, today)  # due or overdue, as the reviewer would show it
            left = 0
        else:
            steps = max(1, len(relearn))
            remaining = rng.randrange(1, steps + 1)
            ctype, ivl, left = 3, max(1, int(stability * rng.uniform(0.1, 0.9))), remaining
            if rng.random() < 0.8:
                queue, due = 1, now - rng.randrange(0, 3000)
            else:
                queue, due = 3, today - rng.randrange(0, 2)
        col.db.execute("update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, data=? where id=?",
                       ctype, queue, due, ivl, factor, reps, lapses, left, json.dumps(data) if data else "", cid)
        revlog = []
        if kind != "new" and rng.random() < 0.5:
            t = (lrt if "lrt" in data else now - elapsed * 86400) * 1000 - rng.randrange(1, 10) * 86_400_000
            for step in range(rng.randrange(1, 4)):
                t += rng.randrange(1, 5) * 86_400_000
                entry = {"id": unique_id(min(t, now * 1000 - 60_000)), "ease": rng.choice([3, 3, 1, 4, 2]),
                         "ivl": rng.randrange(1, 30), "lastIvl": rng.randrange(0, 20),
                         "factor": rng.choice([2500, 2300]), "type": 0 if step == 0 else 1}
                revlog.append(entry)
            revlog.sort(key=lambda e: e["id"])
            for e in revlog:
                col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)",
                               e["id"], cid, -1, e["ease"], e["ivl"], e["lastIvl"], e["factor"], 1000, e["type"])

        before = row(col, cid)
        rating = rng.choice([1, 2, 3, 3, 3, 4])
        card = col.get_card(cid)
        card.start_timer()
        states = col._backend.get_scheduling_states(cid)
        t0 = time.time()
        answer = col.sched.build_answer(card=card, states=states, rating=rating - 1 + CardAnswer.AGAIN)
        answered_at_ms = answer.answered_at_millis
        col.sched.answer_card(answer)
        t1 = time.time()
        after = row(col, cid)
        new_rev = col.db.first("select id, ease, ivl, lastIvl, factor, time, type from revlog where cid=? order by id desc limit 1", cid)
        USED_IDS.add(new_rev[0])
        cases.append({
            "index": index,
            "config": {"params": params, "desiredRetention": conf["desiredRetention"], "historicalRetention": conf["sm2Retention"],
                       "maxInterval": conf["rev"]["maxIvl"], "learnSteps": learn, "relearnSteps": relearn,
                       "initialEase": conf["new"]["initialFactor"], "shortTermWithSteps": short_term},
            "timing": {"today": today, "nextDayAt": next_day_at, "t0": t0, "t1": t1, "answeredAtMs": answered_at_ms},
            "cardId": cid, "noteId": note.id, "rating": rating, "before": before, "revlog": revlog,
            "after": after,
            "newRevlog": dict(zip(["id", "ease", "ivl", "lastIvl", "factor", "time", "type"], new_rev)),
        })
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


main()
