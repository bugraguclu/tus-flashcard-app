"""Oracle for retrievability search and sort keys, the fnvhash tiebreak, and filtered-deck gathering.

Records, for cards with mixed decays, review times and states: Anki's own
extract_fsrs_retrievability, extract_fsrs_relative_retrievability and fnvhash(id, mod); the
browser's retrievability sort in both directions; and which cards, in which order, a filtered
deck gathers for every search order except random.
"""
import json
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 120
OUT = sys.argv[3] if len(sys.argv) > 3 else "sortkeys.json"
rng = random.Random(SEED)
ORDERS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]
COLUMNS = ["id", "nid", "ord", "type", "queue", "due", "ivl", "lapses", "mod", "data"]


def card_state(today, now):
    kind = rng.choice(["review", "review", "review", "learn", "relearn", "daylearn", "new", "suspended"])
    shared = rng.random() < 0.2
    data = {}
    if kind != "new":
        if rng.random() < 0.9:
            data["s"] = 12.5 if shared else round(rng.uniform(0.2, 400), 4)
            data["d"] = round(rng.uniform(1, 10), 3)
        if rng.random() < 0.8:
            data["dr"] = rng.choice([0.8, 0.85, 0.9, 0.95])
        decay = rng.choice([0.154, 0.2, 0.3, 0.5, None])
        if decay is not None:
            data["decay"] = decay
        if rng.random() < 0.75:
            data["lrt"] = now - (86_400 * 3 if shared else rng.randrange(0, 86_400 * 200))
    ivl = rng.randrange(1, 300)
    state = {
        "review": dict(type=2, queue=2, due=today + rng.randrange(-60, 60), ivl=ivl),
        "suspended": dict(type=2, queue=-1, due=today + rng.randrange(-60, 60), ivl=ivl),
        "learn": dict(type=1, queue=1, due=now + rng.randrange(-4000, 4000), ivl=0),
        "relearn": dict(type=3, queue=1, due=now + rng.randrange(-4000, 4000), ivl=rng.randrange(1, 30)),
        "daylearn": dict(type=1, queue=3, due=today + rng.randrange(-3, 3), ivl=0),
        "new": dict(type=0, queue=0, due=rng.randrange(1, 200), ivl=0),
    }[kind]
    state.update(lapses=rng.randrange(0, 6), mod=rng.randrange(1_600_000_000, 1_800_000_000), data=data)
    return state


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    col.set_config("fsrs", True)
    # An old collection, so review days are large numbers as they are in real use.
    col.db.execute("update col set crt = ?", int(time.time()) - 1000 * 86_400)
    did = col.decks.id("Default")
    timing = col._backend.sched_timing_today()
    today, next_day_at = timing.days_elapsed, timing.next_day_at
    now = int(time.time())
    models = [col.models.by_name("Basic"), col.models.by_name("Basic (and reversed card)")]
    notes = 0
    while col.card_count() < COUNT:
        note = col.new_note(rng.choice(models))
        note[note.keys()[0]] = f"n{notes}"
        note[note.keys()[1]] = f"b{notes}"
        col.add_note(note, did)
        notes += 1
    cards = {}
    for cid in col.find_cards(""):
        state = card_state(today, now)
        col.db.execute("update cards set type=?, queue=?, due=?, ivl=?, lapses=?, mod=?, data=? where id=?",
                       state["type"], state["queue"], state["due"], state["ivl"], state["lapses"], state["mod"],
                       json.dumps(state["data"]), cid)
        if state["type"] != 0 and rng.random() < 0.7:
            col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)"
                           " values (?, ?, -1, 3, 1, 0, 2500, 1000, 1)",
                           (now - rng.randrange(0, 86_400 * 300)) * 1000 + rng.randrange(0, 1000), cid)
    rows = col.db.all(f"select {', '.join(COLUMNS)} from cards")
    for row in rows:
        card = dict(zip(COLUMNS, row))
        card["data"] = json.loads(card["data"]) if card["data"] else {}
        card["lastRevlog"] = col.db.scalar("select max(id) from revlog where cid=?", card["id"])
        cards[card["id"]] = card
    keys = col.db.all(
        "select id, extract_fsrs_retrievability(data, case when odue != 0 then odue else due end, ivl, ?, ?, ?),"
        " extract_fsrs_relative_retrievability(data, case when odue != 0 then odue else due end, ivl, ?, ?, ?),"
        " fnvhash(id, mod) from cards", today, next_day_at, now, today, next_day_at, now)
    for cid, r, relative, fnv in keys:
        # fnvhash is a full 64-bit integer, more than a JSON number keeps exactly.
        cards[cid].update(r=r, relative=relative, fnv=str(fnv))

    column = col.get_browser_column("retrievability")
    browser = {"asc": list(col.find_cards("deck:Default", order=column, reverse=False)),
               "desc": list(col.find_cards("deck:Default", order=column, reverse=True))}

    mods = {cid: card["mod"] for cid, card in cards.items()}
    gathered = {}
    for order in ORDERS:
        for cid, mod in mods.items():
            col.db.execute("update cards set mod=? where id=?", mod, cid)
        fdid = col.decks.new_filtered(f"Filtered {order}")
        deck = col.decks.get(fdid)
        deck["terms"] = [["deck:Default", 25, order]]
        deck["resched"] = True
        col.decks.save(deck)
        col.sched.rebuild_filtered_deck(fdid)
        gathered[order] = col.db.list("select id from cards where did = ? order by due", fdid)
        col.sched.empty_filtered_deck(fdid)
        col.decks.remove([fdid])
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"today": today, "nextDayAt": next_day_at, "now": now, "cards": list(cards.values()),
                   "browser": browser, "gathered": gathered, "limit": 25}, handle)
    print(f"wrote {len(cards)} cards to {OUT}")


main()
