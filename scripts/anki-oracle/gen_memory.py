"""Oracle for memory states derived from a review log (Anki's compute_memory_state)."""
import json
import math
import os
import random
import sys
import tempfile
import time
from datetime import datetime, timezone

from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 300
OUT = sys.argv[3] if len(sys.argv) > 3 else "memory.json"
rng = random.Random(SEED)
USED_IDS = set()

DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
BOUNDS = [(0.001, 100)] * 4 + [(1, 10), (0.001, 4), (0.001, 4), (0.001, 0.75), (0, 4.5), (0, 0.8),
          (0.001, 3.5), (0.001, 5), (0.001, 0.25), (0.001, 0.9), (0, 4), (0, 1), (1, 6), (0, 2),
          (0, 2), (0, 0.8), (0.1, 0.8)]


def random_params():
    if rng.random() < 0.3:
        return []
    params = [round(rng.uniform(lo, hi), 4) if rng.random() < 0.4 else d for (lo, hi), d in zip(BOUNDS, DEFAULT)]
    params[0:4] = sorted(params[0:4])
    if rng.random() < 0.1:
        params = params[:19]
    return params


def history(now_ms, next_day_ms):
    """A plausible-but-adversarial review log, oldest first."""
    entries = []
    t = now_ms - rng.randrange(1, 900) * 86_400_000 - rng.randrange(0, 86_400_000)

    def add(ease, ivl, last_ivl, factor, kind, gap_ms):
        nonlocal t
        t += gap_ms
        if t >= now_ms:
            return False
        entries.append({"id": t, "ease": ease, "ivl": ivl, "lastIvl": last_ivl, "factor": factor, "type": kind})
        return True

    def fsrs_factor():
        return rng.randrange(100, 1101)

    if rng.random() < 0.75:  # learning run
        for _ in range(rng.randrange(1, 5)):
            ease = rng.choice([1, 1, 3, 3, 3, 2, 4])
            factor = rng.choice([0, 0, 2500, fsrs_factor()])
            ivl = rng.choice([-60, -600, -1800, -86400, 1, 3])
            if not add(ease, ivl, rng.choice([0, -60, -600]), factor, 0, rng.randrange(30_000, 3_600_000)):
                break
    ivl = rng.randrange(1, 30)
    for _ in range(rng.randrange(0, 18)):
        roll = rng.random()
        gap_days = rng.choice([0, 0, 1, 1, 2, 3, 5, 8, 13, 21, 40, 90])
        gap = gap_days * 86_400_000 + rng.randrange(-7_200_000, 7_200_000)
        if gap_days == 0:
            gap = rng.randrange(60_000, 7_200_000)
        if roll < 0.06:
            ok = add(0, 0, ivl, 0, 4, gap)  # reset (Forget)
        elif roll < 0.11:
            ok = add(0, ivl + 3, ivl, rng.choice([2500, fsrs_factor()]), 4, gap)  # set due date
        elif roll < 0.15:
            ok = add(0, ivl, ivl, fsrs_factor(), 5, gap)  # rescheduled
        elif roll < 0.20:
            ok = add(rng.randrange(1, 5), -600, ivl, 0, 3, gap)  # cramming
        elif roll < 0.25:
            ok = add(rng.randrange(1, 5), ivl + 2, ivl, fsrs_factor(), 3, gap)  # early review in filtered deck
        elif roll < 0.38:
            ease = 1
            ok = add(ease, rng.choice([-600, -60, 1, -86400]), ivl, rng.choice([1300, 2100, fsrs_factor()]), 1, gap)
            if ok and rng.random() < 0.7:
                ok = add(3, max(1, ivl // 3), -600, rng.choice([1300, fsrs_factor()]), 2, rng.randrange(600_000, 3_600_000))
        elif roll < 0.42:
            ok = add(rng.randrange(1, 5), rng.randrange(-3600, 0), ivl, 0, 0, gap)  # learning step later on
        else:
            ease = rng.choice([2, 3, 3, 3, 4])
            new_ivl = max(1, int(ivl * rng.uniform(1.2, 3.0)))
            ok = add(ease, new_ivl, ivl, rng.choice([2500, 2300, 2800, fsrs_factor()]), 1, gap)
            ivl = new_ivl
        if not ok:
            break
    # sometimes put an answer in the last second before a rollover boundary
    if entries and rng.random() < 0.15:
        e = rng.choice(entries)
        boundary = next_day_ms - rng.randrange(1, 60) * 86_400_000
        e["id"] = boundary - rng.randrange(1, 999)
        entries.sort(key=lambda x: x["id"])
    unique = []
    for e in entries:
        while e["id"] in USED_IDS:
            e["id"] += 1
        USED_IDS.add(e["id"])
        unique.append(e)
    unique.sort(key=lambda x: x["id"])
    return unique


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    col.set_config("fsrs", True)
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    cases = []
    for index in range(COUNT):
        params = random_params()
        hist = round(rng.uniform(0.75, 0.99), 2)
        timing = col._backend.sched_timing_today()
        now_ms = int(time.time() * 1000)
        next_day_ms = timing.next_day_at * 1000
        entries = history(now_ms, next_day_ms)
        ignore = ""
        if entries and rng.random() < 0.2:
            pivot = rng.choice(entries)["id"]
            ignore = datetime.fromtimestamp(pivot / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        conf = col.decks.config_dict_for_deck_id(did)
        conf["fsrsParams6"] = params if len(params) == 21 else []
        conf["fsrsParams5"] = params if len(params) == 19 else []
        conf["sm2Retention"] = hist
        conf["ignoreRevlogsBeforeDate"] = ignore
        col.decks.update_config(conf)

        note = col.new_note(model)
        note["Front"] = f"m{index}"
        col.add_note(note, did)
        cid = note.card_ids()[0]
        ctype = rng.choice([2, 2, 2, 1, 3, 0])
        ivl = rng.choice([0, 1, 5, 30, 200]) if ctype != 0 else 0
        factor = rng.choice([0, 1300, 2500, 3100])
        col.db.execute("update cards set type=?, queue=?, ivl=?, factor=?, due=? where id=?",
                       ctype, {0: 0, 1: 1, 2: 2, 3: 1}[ctype], ivl, factor, 0 if ctype == 0 else timing.days_elapsed, cid)
        for e in entries:
            col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)",
                           e["id"], cid, -1, e["ease"], e["ivl"], e["lastIvl"], e["factor"], 1000, e["type"])
        try:
            res = col._backend.compute_memory_state(cid)
            out = {"state": [res.state.stability, res.state.difficulty] if res.HasField("state") else None,
                   "dr": res.desired_retention, "decay": res.decay}
        except Exception as err:  # noqa: BLE001
            out = {"error": str(err)}
        cases.append({"index": index, "params": params, "historicalRetention": hist, "ignore": ignore,
                      "nextDayAtMs": next_day_ms, "card": {"type": ctype, "ivl": ivl, "factor": factor},
                      "entries": entries, "out": out})
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


main()
