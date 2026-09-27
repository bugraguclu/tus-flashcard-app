"""Oracle for Reset Card (schedule_cards_as_new) with every combination of its two options."""
import json
import os
import random
import sys
import tempfile

from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 40
OUT = sys.argv[3] if len(sys.argv) > 3 else "forget.json"
rng = random.Random(SEED)
COLUMNS = ["did", "odid", "type", "queue", "due", "odue", "ivl", "factor", "reps", "lapses", "left", "data"]


def card_row(col, cid):
    row = dict(zip(COLUMNS, col.db.first(f"select {', '.join(COLUMNS)} from cards where id=?", cid)))
    row["data"] = json.loads(row["data"]) if row["data"] else {}
    return row


def random_state(did, filtered_did):
    """A card in any state; some sit in a filtered deck, some remember their original position."""
    kind = rng.choice(["new", "learn", "review", "relearn"])
    data = {}
    if kind != "new" and rng.random() < 0.7:
        data["pos"] = rng.randrange(1, 400)
    if kind != "new" and rng.random() < 0.6:
        data.update({"s": round(rng.uniform(0.5, 300), 4), "d": round(rng.uniform(1, 10), 3),
                     "dr": 0.9, "decay": 0.154, "lrt": 1_790_000_000 + rng.randrange(0, 10_000_000)})
    state = {
        "new": dict(type=0, queue=0, due=rng.randrange(1, 500), ivl=0, factor=0, left=0),
        "learn": dict(type=1, queue=1, due=1_790_000_000 + rng.randrange(0, 5000), ivl=0, factor=2500, left=1002),
        "review": dict(type=2, queue=rng.choice([2, 2, -1, -2]), due=rng.randrange(10, 900),
                       ivl=rng.randrange(1, 400), factor=rng.choice([1300, 2100, 2500, 2800]), left=0),
        "relearn": dict(type=3, queue=3, due=rng.randrange(10, 900), ivl=rng.randrange(1, 60),
                        factor=2000, left=1001),
    }[kind]
    state.update(reps=rng.randrange(0 if kind == "new" else 1, 60), lapses=rng.randrange(0, 9), data=data,
                 did=did, odid=0, odue=0)
    if kind == "new":
        state["reps"] = 0
    if rng.random() < 0.25:
        state.update(odid=did, did=filtered_did, odue=state["due"])
        if kind != "new":
            state["due"] = -100_000 + rng.randrange(0, 1000)
    return state


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    did = col.decks.id("Default")
    filtered_did = col.decks.new_filtered("Filtered")
    model = col.models.by_name("Basic")
    cases = []
    for index in range(COUNT):
        batch = []
        for card_index in range(rng.randrange(1, 4)):
            note = col.new_note(model)
            note["Front"] = f"c{index}-{card_index}"
            col.add_note(note, did)
            cid = note.card_ids()[0]
            state = random_state(did, filtered_did)
            col.db.execute(
                "update cards set did=?, odid=?, type=?, queue=?, due=?, odue=?, ivl=?, factor=?, reps=?, lapses=?,"
                " left=?, data=? where id=?",
                state["did"], state["odid"], state["type"], state["queue"], state["due"], state["odue"],
                state["ivl"], state["factor"], state["reps"], state["lapses"], state["left"],
                json.dumps(state["data"]), cid)
            batch.append(cid)
        # The app numbers new cards from the highest new position; give Anki's counter that value.
        top = col.db.scalar("select max(due) from cards where type = 0") or 0
        col.set_config("nextPos", top + 1)
        restore, reset = rng.choice([True, False]), rng.choice([True, False])
        before = {cid: card_row(col, cid) for cid in batch}
        col.sched.schedule_cards_as_new(batch, restore_position=restore, reset_counts=reset)
        after = {cid: card_row(col, cid) for cid in batch}
        revlog = {cid: col.db.all("select ease, ivl, lastIvl, factor, time, type from revlog where cid=?", cid)
                  for cid in batch}
        cases.append({"restorePosition": restore, "resetCounts": reset, "nextPos": top + 1,
                      "cards": [{"cid": cid, "before": before[cid], "after": after[cid], "revlog": revlog[cid]}
                                for cid in batch]})
        # Start the next case from a clean slate of new cards.
        col.db.execute("delete from revlog")
        col.remove_notes([col.get_card(cid).nid for cid in batch])
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


main()
