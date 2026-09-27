"""Oracle for rescheduling after a preset change (update_deck_configs with fsrs_reschedule)."""
import json
import math
import os
import random
import sys
import tempfile
import time

from anki import deck_config_pb2
from anki.collection import Collection
from anki.config import Config

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
LB = (sys.argv[3] if len(sys.argv) > 3 else "off") == "on"
OUT = sys.argv[4] if len(sys.argv) > 4 else "resched.json"
# Most cards per round; larger rounds exercise more of the order Anki visits cards in.
MAX_CARDS = int(sys.argv[5]) if len(sys.argv) > 5 else 120
rng = random.Random(SEED)
USED = set()


def uid(value):
    while value in USED:
        value += 1
    USED.add(value)
    return value


def card_row(col, cid):
    r = col.db.first("select type, queue, due, ivl, factor, reps, lapses, left, data from cards where id=?", cid)
    out = dict(zip(["type", "queue", "due", "ivl", "factor", "reps", "lapses", "left", "data"], r))
    out["data"] = json.loads(out["data"]) if out["data"] else {}
    return out


def main():
    rounds = []
    for round_index in range(ROUNDS):
        work = tempfile.mkdtemp(prefix="anki-oracle-")
        col = Collection(os.path.join(work, "col.anki2"))
        col.set_config("fsrs", True)
        col.set_config_bool(Config.Bool.LOAD_BALANCER_ENABLED, LB)
        did = col.decks.id("Default")
        conf = col.decks.config_dict_for_deck_id(did)
        conf["desiredRetention"] = 0.9
        conf["easyDaysPercentages"] = [rng.choice([1.0, 1.0, 0.5, 0.0]) for _ in range(7)] if rng.random() < 0.5 else [1.0] * 7
        col.decks.update_config(conf)
        timing = col._backend.sched_timing_today()
        today, next_day_at = timing.days_elapsed, timing.next_day_at
        now_ms = int(time.time() * 1000)
        model = col.models.by_name("Basic")
        cards = []
        for n in range(rng.randrange(min(30, MAX_CARDS - 1), MAX_CARDS)):
            note = col.new_note(model)
            note["Front"] = f"r{round_index}n{n}"
            col.add_note(note, did)
            cid = note.card_ids()[0]
            # a complete history: learning steps, then spaced reviews
            t = now_ms - rng.randrange(20, 400) * 86_400_000
            entries = []
            for step in range(rng.randrange(1, 3)):
                t += rng.randrange(60_000, 900_000)
                entries.append({"id": uid(t), "ease": 3, "ivl": -600 if step == 0 else 1, "lastIvl": 0, "factor": 0, "type": 0})
            ivl = 1
            while True:
                gap = max(1, int(ivl * rng.uniform(0.6, 1.8)))
                if t + gap * 86_400_000 >= now_ms - 3_600_000:
                    break
                t += gap * 86_400_000 + rng.randrange(-3_600_000, 3_600_000)
                ease = rng.choice([3, 3, 3, 2, 4, 1])
                new_ivl = max(1, int(ivl * (0.3 if ease == 1 else rng.uniform(1.5, 3.0))))
                entries.append({"id": uid(t), "ease": ease, "ivl": new_ivl, "lastIvl": ivl, "factor": 2500, "type": 1})
                ivl = new_ivl
            last = entries[-1]
            elapsed_days = (next_day_at * 1000 - last["id"]) // 86_400_000
            due = today - elapsed_days + ivl
            queue = rng.choice([2, 2, 2, 2, -1])
            reps = len(entries)
            col.db.execute("update cards set type=2, queue=?, due=?, ivl=?, factor=2500, reps=?, data=? where id=?",
                           queue, due, ivl, reps, json.dumps({"lrt": last["id"] // 1000}), cid)
            for e in entries:
                col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)",
                               e["id"], cid, -1, e["ease"], e["ivl"], e["lastIvl"], e["factor"], 1000, e["type"])
            cards.append({"cid": cid, "nid": note.id, "entries": entries})
        # first save: compute memory states without rescheduling (FSRS toggled on)
        before = {c["cid"]: card_row(col, c["cid"]) for c in cards}
        update = col.decks.get_deck_configs_for_update(did)
        config = update.all_config[0].config
        config.config.desired_retention = rng.choice([0.8, 0.85, 0.95])
        request = deck_config_pb2.UpdateDeckConfigsRequest(
            target_deck_id=did,
            configs=[config],
            mode=deck_config_pb2.UpdateDeckConfigsMode.UPDATE_DECK_CONFIGS_MODE_NORMAL,
            card_state_customizer=update.card_state_customizer,
            limits=update.current_deck.limits,
            new_cards_ignore_review_limit=update.new_cards_ignore_review_limit,
            apply_all_parent_limits=update.apply_all_parent_limits,
            fsrs=True,
            fsrs_reschedule=True,
            fsrs_health_check=False,
        )
        run_at = int(time.time() * 1000)
        col.decks.update_deck_configs(request)
        after = {c["cid"]: card_row(col, c["cid"]) for c in cards}
        revlog = {c["cid"]: col.db.all("select id, ease, ivl, lastIvl, factor, type from revlog where cid=? and type=5", c["cid"]) for c in cards}
        rounds.append({"today": today, "nextDayAt": next_day_at, "runAtMs": run_at, "lb": LB,
                       "easyDays": conf["easyDaysPercentages"], "desiredRetention": config.config.desired_retention,
                       "cards": [{**c, "before": before[c["cid"]], "after": after[c["cid"]], "rescheduled": revlog[c["cid"]]}
                                 for c in cards]})
        col.close()
    with open(OUT, "w") as handle:
        json.dump({"rounds": rounds}, handle)
    print(f"wrote {len(rounds)} rounds to {OUT}")


main()
