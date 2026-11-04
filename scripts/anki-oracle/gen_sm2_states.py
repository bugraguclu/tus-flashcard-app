"""Oracle for TusAnkiM's SM-2 engine: put one card into a chosen state with FSRS off, ask Anki's
backend for the four answer outcomes and the English button labels, and record inputs + outputs.

Deck options stay inside the ranges Anki accepts (it replaces anything else with its default when
it reads the preset). Card states that Anki itself never produces are tagged in `edge`, so the
fixture can leave them out. The collection is aged by a few years so day numbers look like a real
learner's and a filtered card's original due is never 0, which Anki reads as "none".

Usage: ./run.sh gen_sm2_states.py SEED COUNT sm2_states.json (see build_sm2_fixture.py)
"""
import json
import os
import random
import sys
import tempfile
import time

import anki.lang
from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 400
OUT = sys.argv[3] if len(sys.argv) > 3 else "sm2_states.json"
rng = random.Random(SEED)
USED_IDS = set()

LEARN = [[1.0, 10.0]] * 6 + [[], [], [1.0], [10.0], [1.0, 10.0, 60.0], [0.5, 5.0], [15.0, 1440.0],
                             [1.0, 10.0, 1440.0, 4320.0], [30.0], [1.0, 2880.0], [0.5], [2.5, 25.0], [5.0, 30.0, 720.0]]
RELEARN = [[10.0]] * 6 + [[], [], [1.0], [5.0, 20.0], [10.0, 1440.0], [60.0], [1440.0], [0.5], [2.0, 30.0, 2880.0]]


def weighted(common, others, p_common=0.6):
    return common if rng.random() < p_common else rng.choice(others)


def random_config():
    """A preset inside Anki's accepted ranges (rslib deckconfig `ensure_deck_config_values_valid`)."""
    return {
        "learn": rng.choice(LEARN),
        "relearn": rng.choice(RELEARN),
        "gradGood": weighted(1, [1, 2, 3, 5, 7]),
        "gradEasy": weighted(4, [2, 3, 5, 10, 15]),
        "initialEase": weighted(2500, [1310, 1500, 2300, 2650, 2800, 3500]),
        "hardFactor": weighted(1.2, [1.0, 0.8, 1.1, 1.3, 0.5, 1.25, 1.15]),
        "easyBonus": weighted(1.3, [1.0, 1.15, 1.25, 1.5, 2.0, 1.35]),
        "ivlFct": weighted(1.0, [0.8, 0.9, 0.95, 1.1, 1.25, 1.33, 0.65, 2.0, 0.5]),
        "lapseMult": weighted(0.0, [0.1, 0.2, 0.25, 0.5, 0.7, 1.0, 0.33]),
        "minInt": weighted(1, [1, 2, 3, 7]),
        "maxIvl": weighted(36500, [7, 30, 100, 365, 1000, 3650]),
        "leechFails": weighted(8, [1, 2, 3, 5, 7]),
        "leechAction": rng.choice([0, 1]),
    }


def apply_config(col, did, cfg):
    conf = col.decks.config_dict_for_deck_id(did)
    conf["new"]["delays"] = cfg["learn"]
    conf["new"]["ints"] = [cfg["gradGood"], cfg["gradEasy"], 0]
    conf["new"]["initialFactor"] = cfg["initialEase"]
    conf["rev"]["ease4"] = cfg["easyBonus"]
    conf["rev"]["hardFactor"] = cfg["hardFactor"]
    conf["rev"]["ivlFct"] = cfg["ivlFct"]
    conf["rev"]["maxIvl"] = cfg["maxIvl"]
    conf["lapse"]["delays"] = cfg["relearn"]
    conf["lapse"]["mult"] = cfg["lapseMult"]
    conf["lapse"]["minInt"] = cfg["minInt"]
    conf["lapse"]["leechFails"] = cfg["leechFails"]
    conf["lapse"]["leechAction"] = cfg["leechAction"]
    col.decks.update_config(conf)


def open_aged_collection(prefix):
    """A collection created years ago, so day numbers are large like a real learner's."""
    path = os.path.join(tempfile.mkdtemp(prefix=prefix), "col.anki2")
    col = Collection(path)
    col.db.execute("update col set crt = crt - ?", rng.randrange(800, 3000) * 86400)
    col.close()
    return Collection(path)


def normal_to_dict(normal):
    which = normal.WhichOneof("kind")
    inner = getattr(normal, which)
    out = {"kind": which}
    if which == "review":
        out.update(days=inner.scheduled_days, elapsed=inner.elapsed_days, ease=inner.ease_factor,
                   lapses=inner.lapses, leeched=inner.leeched)
    elif which == "learning":
        out.update(secs=inner.scheduled_secs, remaining=inner.remaining_steps)
    elif which == "relearning":
        out.update(secs=inner.learning.scheduled_secs, remaining=inner.learning.remaining_steps,
                   days=inner.review.scheduled_days, ease=inner.review.ease_factor,
                   lapses=inner.review.lapses, leeched=inner.review.leeched)
    else:
        out.update(position=inner.position)
    return out


def state_to_dict(state):
    kind = state.WhichOneof("kind")
    if kind == "normal":
        return normal_to_dict(state.normal)
    filtered = state.filtered
    which = filtered.WhichOneof("kind")
    if which == "rescheduling":
        out = normal_to_dict(filtered.rescheduling.original_state)
        out["wrapped"] = True
        return out
    return {"kind": "preview", "secs": filtered.preview.scheduled_secs, "finished": filtered.preview.finished}


def unique_id():
    while True:
        value = rng.choice([rng.randrange(1_600_000_000_000, 1_800_000_000_000), rng.randrange(1, 10**9),
                            rng.randrange(2**40, 2**52)])
        if value not in USED_IDS:
            USED_IDS.add(value)
            return value


def random_card(cfg, index, today, now):
    """One card row, plus the reasons it is a state Anki itself would not produce."""
    edge = []
    kind = rng.choices(["new", "learning", "review", "relearning"], [1, 3, 7, 3])[0]
    reps = rng.randrange(0, 200)
    factor = rng.choice([2500] * 6 + [1300, 1310, 1850, 2350, 2650, 3100, 4000])
    if rng.random() < 0.04:
        factor = rng.choice([0, 1100, 1200])
    ivl = rng.choice([1, 1, 2, 3, 4, 5, 7, 10, 13, 21, 40, 60, 100, 365, 1000, rng.randrange(1, 4000)])
    if rng.random() < 0.03:
        ivl = 0
    lapses = rng.choice([0, 0, 1, 2, 3, rng.randrange(0, 25)])
    filtered = False
    left, odue = 0, 0
    if kind in ("new", "learning"):
        # a forgotten card keeps its lapse count unless the reset asked to clear it
        lapses = 0 if rng.random() < 0.7 else rng.randrange(1, 12)
    if kind == "new":
        ctype, queue, due, ivl, left, factor = 0, 0, index + 1, 0, 0, 0
        if lapses == 0:
            reps = 0
    elif kind == "learning":
        steps = len(cfg["learn"])
        ctype, ivl = 1, 0
        if steps == 0:
            remaining = 0
        else:
            remaining = rng.randrange(1, steps + 1)
            if rng.random() < 0.06:
                remaining = rng.choice([0, steps + 1, steps + 2])
                edge.append("left out of range")
        left = remaining + (1000 * rng.randrange(0, remaining + 1) if rng.random() < 0.2 else 0)
        factor = 0
        if rng.random() < 0.05:
            factor = rng.choice([2500, 2300])
            edge.append("learning card with ease")
        if rng.random() < 0.8:
            queue, due = 1, now + rng.randrange(-3600, 3600)
        else:
            queue, due = 3, today + rng.randrange(-2, 1)
    elif kind == "review":
        ctype, queue = 2, 2
        filtered = rng.random() < 0.3
        if filtered:
            # early (due later), on time or overdue, as a filtered deck may hold it
            odue = today + rng.randrange(-max(2, ivl), max(2, ivl) + 1)
            due = -100000 + index
        else:
            due = today - rng.choice([0, 0, 0, 1, 2, 5, 30, rng.randrange(0, 400)])
    else:
        steps = len(cfg["relearn"])
        ctype = 3
        ivl = rng.choice([1, 1, 2, 3, 5, 8, 20, 100, rng.randrange(1, 500)])
        if rng.random() < 0.03:
            ivl = 0
        if steps == 0:
            remaining = 0
        else:
            remaining = rng.randrange(1, steps + 1)
            if rng.random() < 0.06:
                remaining = rng.choice([0, steps + 1, steps + 2])
                edge.append("left out of range")
        left = remaining + (1000 * rng.randrange(0, remaining + 1) if rng.random() < 0.2 else 0)
        if rng.random() < 0.8:
            queue, due = 1, now + rng.randrange(-3600, 3600)
        else:
            queue, due = 3, today + rng.randrange(-2, 1)
    if kind in ("review", "relearning"):
        # Set Due Date under FSRS leaves a review card at interval 0; a relearning card never is.
        if ivl == 0 and kind == "relearning":
            edge.append("interval 0")
        if factor == 0:
            edge.append("ease 0")
        elif factor < 1300:
            edge.append("ease below 1.3")
    return {"kind": kind, "type": ctype, "queue": queue, "due": due, "odue": odue, "filtered": filtered,
            "ivl": ivl, "factor": factor, "reps": reps, "lapses": lapses, "left": left, "edge": edge}


def main():
    anki.lang.set_lang("en_US")
    col = open_aged_collection("anki-sm2-oracle-")
    col.set_config("fsrs", False)
    did = col.decks.id("Default")
    fid = col.decks.new_filtered("Filtered")
    model = col.models.by_name("Basic")

    cases = []
    for index in range(COUNT):
        cfg = random_config()
        apply_config(col, did, cfg)

        note = col.new_note(model)
        note["Front"] = f"case {index}"
        col.add_note(note, did)
        old_cid = note.card_ids()[0]
        cid = unique_id()
        col.db.execute("update cards set id=? where id=?", cid, old_cid)

        timing = col._backend.sched_timing_today()
        today = timing.days_elapsed
        now = int(time.time())
        card = random_card(cfg, index, today, now)

        if card["filtered"]:
            col.db.execute(
                "update cards set did=?, odid=?, type=?, queue=?, due=?, odue=?, ivl=?, factor=?, reps=?, lapses=?, left=?, data='' where id=?",
                fid, did, card["type"], card["queue"], card["due"], card["odue"], card["ivl"], card["factor"],
                card["reps"], card["lapses"], card["left"], cid,
            )
        else:
            col.db.execute(
                "update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, data='' where id=?",
                card["type"], card["queue"], card["due"], card["ivl"], card["factor"], card["reps"], card["lapses"],
                card["left"], cid,
            )
        states = col._backend.get_scheduling_states(cid)
        labels = list(col.sched.describe_next_states(states))
        card["id"] = cid
        cases.append({
            "index": index,
            "config": cfg,
            "timing": {"now": now, "today": today, "nextDayAt": timing.next_day_at},
            "card": card,
            "out": {name: state_to_dict(getattr(states, name))
                    for name in ("current", "again", "hard", "good", "easy")},
            "labels": labels,
        })
    import anki.buildinfo as buildinfo
    zone = os.path.realpath("/etc/localtime").split("zoneinfo/")[-1]
    meta = {"anki": buildinfo.version, "buildhash": buildinfo.buildhash, "seed": SEED, "timezone": zone,
            "rolloverHour": col.get_config("rollover", 4), "collapseSecs": col.get_config("collapseTime", 1200)}
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"meta": meta, "cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
