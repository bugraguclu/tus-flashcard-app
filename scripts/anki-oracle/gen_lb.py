"""Load balancer oracle: build Anki's study queue so its load balancer is active, then record
the scheduling states of cards against a known snapshot of due counts, siblings and easy days."""
import json
import math
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 10
OUT = sys.argv[3] if len(sys.argv) > 3 else "lb.json"
rng = random.Random(SEED)


def state_dict(state):
    normal = state.normal
    which = normal.WhichOneof("kind")
    inner = getattr(normal, which)
    if which == "review":
        return {"kind": "review", "days": inner.scheduled_days}
    if which == "relearning":
        return {"kind": "relearning", "days": inner.review.scheduled_days, "secs": inner.learning.scheduled_secs}
    if which == "learning":
        return {"kind": "learning", "secs": inner.scheduled_secs}
    return {"kind": which}


def main():
    rounds = []
    for round_index in range(ROUNDS):
        work = tempfile.mkdtemp(prefix="anki-oracle-")
        col = Collection(os.path.join(work, "col.anki2"))
        col.set_config("fsrs", True)
        did = col.decks.id("Default")
        conf = col.decks.config_dict_for_deck_id(did)
        easy_days = [rng.choice([1.0, 1.0, 1.0, 0.5, 0.0]) for _ in range(7)]
        if rng.random() < 0.3:
            easy_days = [1.0] * 7
        conf["easyDaysPercentages"] = easy_days
        conf["rev"]["bury"] = rng.random() < 0.5
        conf["desiredRetention"] = round(rng.uniform(0.8, 0.95), 2)
        conf["rev"]["perDay"] = 9999
        col.decks.update_config(conf)
        timing = col._backend.sched_timing_today()
        today, next_day_at = timing.days_elapsed, timing.next_day_at
        now = int(time.time())

        model = col.models.by_name("Basic (and reversed card)")
        cards = []
        # background load: cards spread over the next hundred days, some notes with two cards
        for n in range(rng.randrange(20, 250)):
            note = col.new_note(model)
            note["Front"] = f"r{round_index}n{n}"
            note["Back"] = "b"
            col.add_note(note, did)
            for cid in note.card_ids():
                due = today + rng.choice([rng.randrange(1, 30), rng.randrange(1, 99), rng.randrange(99, 200)])
                ivl = max(1, rng.randrange(1, 60))
                col.db.execute("update cards set type=2, queue=?, due=?, ivl=?, factor=2500, reps=5, data=? where id=?",
                               rng.choice([2, 2, 2, 2, -1, -3]), due, ivl, json.dumps({"s": ivl, "d": 5.0}), cid)
        # targets: review cards due today with a memory state
        targets = []
        for t in range(rng.randrange(10, 40)):
            note = col.new_note(model)
            note["Front"] = f"r{round_index}t{t}"
            note["Back"] = "b"
            col.add_note(note, did)
            cid = note.card_ids()[0]
            stability = math.exp(rng.uniform(math.log(1), math.log(80)))
            elapsed = max(1, int(stability * rng.uniform(0.5, 1.5)))
            lrt = next_day_at - elapsed * 86400 - rng.randrange(1, 86400)
            data = {"s": round(stability, 4), "d": round(rng.uniform(1, 10), 3), "lrt": min(lrt, now - 60)}
            reps = rng.randrange(1, 30)
            ivl = max(1, int(stability * rng.uniform(0.6, 1.2)))
            col.db.execute("update cards set type=2, queue=2, due=?, ivl=?, factor=2500, reps=?, data=? where id=?",
                           today, ivl, reps, json.dumps(data), cid)
            for other in note.card_ids()[1:]:
                col.db.execute("update cards set type=2, queue=2, due=?, ivl=10, factor=2500, reps=3 where id=?",
                               today + rng.randrange(1, 40), other)
            targets.append({"cid": cid, "nid": note.id, "reps": reps, "ivl": ivl, "data": data})

        col.sched.get_queued_cards()  # builds the queue and, with it, the load balancer
        snapshot = [dict(zip(["id", "nid", "did", "due", "type", "queue"], row))
                    for row in col.db.all("select id, nid, did, due, type, queue from cards")]
        results = []
        for target in targets:
            states = col._backend.get_scheduling_states(target["cid"])
            results.append({**target, "out": {name: state_dict(getattr(states, name))
                                             for name in ("again", "hard", "good", "easy")}})
        rounds.append({"today": today, "nextDayAt": next_day_at, "now": now, "easyDays": easy_days,
                       "bury": conf["rev"]["bury"], "desiredRetention": conf["desiredRetention"],
                       "snapshot": snapshot, "targets": results})
        col.close()
    with open(OUT, "w") as handle:
        json.dump({"rounds": rounds}, handle)
    print(f"wrote {len(rounds)} rounds to {OUT}")


main()
