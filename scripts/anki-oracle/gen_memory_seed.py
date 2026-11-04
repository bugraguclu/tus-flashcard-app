"""Oracle for the SM-2 seed of a truncated review log (Anki's compute_memory_state).

A log without a learning run starts FSRS from the first surviving review's interval and ease. A
factor of 1100 or less is one FSRS wrote (the shifted difficulty), so the seed difficulty comes from
it directly; the cases sit on both sides of that boundary, 1100 itself included. The SM-2 formula
already reaches the difficulty ceiling for many presets, so long intervals, a high historical
retention and a small w10 are included: only there does the boundary change the result.

Usage: ./run.sh gen_memory_seed.py ../../test/fixtures/anki-26.09-fsrs-seed.json
"""
import json
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection

OUT = sys.argv[1] if len(sys.argv) > 1 else "memory_seed.json"
rng = random.Random(1100)
DAY_MS = 86_400_000

DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
PARAM_SETS = [
    [],
    [0.4, 1.1, 3.1, 15.7, 7.1, 0.6, 1.9, 0.01, 1.4, 0.15, 0.25, 1.9, 0.1, 0.3, 2.2, 0.25, 2.9, 0.5, 0.3, 0.1, 0.2],
    [48.2496, 49.1894, 88.169, 94.4442, 3.7683, 2.8839, 3.0194, 0.001, 1.8722, 0.1666, 0.4004, 1.4835, 0.2143,
     0.2629, 2.7599, 0.6014, 5.6387, 0.5425, 1.7833],
]
SEED_FACTORS = [0, 100, 1000, 1099, 1100, 1101, 1300, 2500]


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    col.set_config("fsrs", True)
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    timing = col._backend.sched_timing_today()
    now_ms = int(time.time() * 1000)
    next_day_ms = timing.next_day_at * 1000
    cases = []
    next_id = now_ms - 1400 * DAY_MS
    for params, retention in [(p, r) for p in PARAM_SETS for r in (0.9, 0.97)]:
        conf = col.decks.config_dict_for_deck_id(did)
        conf["fsrsParams6"] = params if len(params) == 21 else []
        conf["fsrsParams5"] = params if len(params) == 19 else []
        conf["sm2Retention"] = retention
        col.decks.update_config(conf)
        for factor in SEED_FACTORS:
            for first_ivl in (10, 1000):
                note = col.new_note(model)
                note["Front"] = f"seed {factor} {first_ivl}"
                col.add_note(note, did)
                cid = note.card_ids()[0]
                col.db.execute("update cards set type=2, queue=2, ivl=40, factor=2500, due=? where id=?",
                               timing.days_elapsed, cid)
                # No learning run: the log was truncated, so the first review seeds the state.
                start = next_id
                next_id += DAY_MS // 7
                entries = [
                    {"id": start, "ease": 3, "ivl": first_ivl, "lastIvl": max(1, first_ivl // 2), "factor": factor, "type": 1},
                    {"id": start + 11 * DAY_MS + rng.randrange(0, 3_600_000), "ease": 3, "ivl": 26,
                     "lastIvl": first_ivl, "factor": rng.choice([2500, 1100, 640]), "type": 1},
                    {"id": start + 38 * DAY_MS + rng.randrange(0, 3_600_000), "ease": rng.choice([1, 2, 4]),
                     "ivl": 40, "lastIvl": 26, "factor": rng.choice([2350, 1100, 870]), "type": 1},
                ]
                for e in entries:
                    col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)",
                                   e["id"], cid, -1, e["ease"], e["ivl"], e["lastIvl"], e["factor"], 1000, e["type"])
                res = col._backend.compute_memory_state(cid)
                cases.append({
                    "params": params, "historicalRetention": retention, "nextDayAtMs": next_day_ms,
                    "card": {"type": 2, "ivl": 40, "factor": 2500}, "entries": entries,
                    "state": [res.state.stability, res.state.difficulty] if res.HasField("state") else None,
                })
    import anki.buildinfo as buildinfo
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"meta": {"anki": buildinfo.version, "buildhash": buildinfo.buildhash}, "cases": cases},
                  handle, separators=(",", ":"))
    print(f"wrote {len(cases)} cases to {OUT}")


main()
