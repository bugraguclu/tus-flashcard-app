"""End-to-end SM-2 oracle: answer cards with Anki's own answer_card (FSRS off) and record every
column it writes, the review-log row, and the leech outcome. Cards and presets come from the same
sampler as gen_sm2_states.py; filtered-deck cards are left to that generator.

Usage: ./run.sh gen_sm2_answers.py SEED COUNT sm2_answers.json (see build_sm2_fixture.py)
"""
import json
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection
from anki.scheduler.v3 import CardAnswer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_sm2_states import apply_config, open_aged_collection, random_card, random_config, rng as states_rng  # noqa: E402

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 300
OUT = sys.argv[3] if len(sys.argv) > 3 else "sm2_answers.json"
states_rng.seed(SEED * 7919)
rng = random.Random(SEED)
USED_IDS = set()


def row(col, cid):
    r = col.db.first("select type, queue, due, ivl, factor, reps, lapses, left, odue, odid, data from cards where id=?", cid)
    keys = ["type", "queue", "due", "ivl", "factor", "reps", "lapses", "left", "odue", "odid", "data"]
    out = dict(zip(keys, r))
    out["data"] = json.loads(out["data"]) if out["data"] else {}
    return out


def unique_id():
    while True:
        value = rng.choice([rng.randrange(1_600_000_000_000, 1_800_000_000_000), rng.randrange(2**40, 2**52)])
        if value not in USED_IDS:
            USED_IDS.add(value)
            return value


def main():
    col = open_aged_collection("anki-sm2-answer-")
    col.set_config("fsrs", False)
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    cases = []
    for index in range(COUNT):
        cfg = random_config()
        apply_config(col, did, cfg)

        note = col.new_note(model)
        note["Front"] = f"a{index}"
        col.add_note(note, did)
        old_cid = note.card_ids()[0]
        cid = unique_id()
        col.db.execute("update cards set id=? where id=?", cid, old_cid)
        timing = col._backend.sched_timing_today()
        today, next_day_at = timing.days_elapsed, timing.next_day_at
        now = int(time.time())

        sample = random_card(cfg, index, today, now)
        while sample["filtered"]:
            sample = random_card(cfg, index, today, now)
        ctype, queue, due, ivl, factor = sample["type"], sample["queue"], sample["due"], sample["ivl"], sample["factor"]
        reps, lapses, left = sample["reps"], sample["lapses"], sample["left"]
        if queue == 1:
            due = min(due, now)  # due now or earlier, as the reviewer would show it
        col.db.execute("update cards set type=?, queue=?, due=?, ivl=?, factor=?, reps=?, lapses=?, left=?, data='' where id=?",
                       ctype, queue, due, ivl, factor, reps, lapses, left, cid)

        before = row(col, cid)
        rating = rng.choice([1, 1, 2, 3, 3, 3, 4])
        card = col.get_card(cid)
        card.start_timer()
        states = col._backend.get_scheduling_states(cid)
        answer = col.sched.build_answer(card=card, states=states, rating=rating - 1 + CardAnswer.AGAIN)
        answered_at_ms = answer.answered_at_millis
        col.sched.answer_card(answer)
        after = row(col, cid)
        new_rev = col.db.first("select id, ease, ivl, lastIvl, factor, time, type from revlog where cid=? order by id desc limit 1", cid)
        tags = col.get_note(note.id).tags
        cases.append({
            "index": index,
            "config": cfg,
            "timing": {"today": today, "nextDayAt": next_day_at, "now": now, "answeredAtMs": answered_at_ms},
            "cardId": cid, "noteId": note.id, "rating": rating, "before": before, "after": after, "edge": sample["edge"],
            "newRevlog": dict(zip(["id", "ease", "ivl", "lastIvl", "factor", "time", "type"], new_rev)),
            "tags": tags,
        })
    import anki.buildinfo as buildinfo
    zone = os.path.realpath("/etc/localtime").split("zoneinfo/")[-1]
    meta = {"anki": buildinfo.version, "seed": SEED, "timezone": zone, "rolloverHour": col.get_config("rollover", 4)}
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"meta": meta, "cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
