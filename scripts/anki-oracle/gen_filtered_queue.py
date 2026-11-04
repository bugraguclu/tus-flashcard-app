"""Oracle for how Anki deals a filtered deck: serving order, counts, learn ahead, preview, burying.

Each scenario builds a small collection, gathers it into a filtered deck in "order added" order
(so the gather is deterministic), answers some cards the way the reviewer would, and records the
order Anki's study queue deals the cards in, the queue's new/learning/review counts and the deck
list's counts. The due-order scenarios record which cards a limited build gathers when new-card
positions are read against a young collection's day numbers.

    ./run.sh gen_filtered_queue.py ../../test/fixtures/anki-26.09-filtered-queue.json
"""
import json
import os
import sys
import tempfile
import time

from anki.buildinfo import version
from anki.collection import Collection
from anki.scheduler.v3 import CardAnswer

OUT = sys.argv[1] if len(sys.argv) > 1 else "filtered-queue.json"
ORDER_ADDED, ORDER_DUE, ORDER_RELATIVE = 5, 6, 10


def fresh(crt_days_ago=500):
    col = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
    col.db.execute("update col set crt = ?", int(time.time()) - crt_days_ago * 86_400)
    return col


def timing(col):
    t = col._backend.sched_timing_today()
    return t.days_elapsed, int(time.time())


def add(col, label, kind, extra, model="Basic"):
    """One note; `kind` sets its first card's state, `extra` its due relative to now/today."""
    today, now = timing(col)
    note = col.new_note(col.models.by_name(model))
    note[note.keys()[0]] = label
    note[note.keys()[1]] = f"{label} back"
    col.add_note(note, col.decks.id("Default"))
    cids = note.card_ids()
    states = {
        "review": ("type=2, queue=2, due=?, ivl=10, factor=2500, reps=5", today + extra),
        "learn": ("type=1, queue=1, due=?, ivl=0, factor=0, reps=1, left=1001", now + extra),
        "daylearn": ("type=1, queue=3, due=?, ivl=0, factor=0, reps=1, left=1001", today + extra),
        "new": ("due=?", extra),
    }
    columns, due = states[kind]
    col.db.execute(f"update cards set {columns} where id=?", due, cids[0])
    for cid in cids[1:]:
        col.db.execute("update cards set due=? where id=?", extra, cid)
    return cids


def label_of(col, cid):
    card = col.get_card(cid)
    return f"{card.note()[card.note().keys()[0]]}{'' if card.ord == 0 else f'#{card.ord}'}"


def build(col, name, search, order, limit=100, resched=True):
    fdid = col.decks.new_filtered(name)
    deck = col.decks.get(fdid)
    deck["terms"] = [[search, limit, order]]
    deck["resched"] = resched
    col.decks.save(deck)
    col.sched.rebuild_filtered_deck(fdid)
    col.decks.select(fdid)
    return fdid


def queue(col):
    q = col.sched.get_queued_cards(fetch_limit=1000)
    return {"order": [label_of(col, c.card.id) for c in q.cards],
            "counts": [q.new_count, q.learning_count, q.review_count]}


def tree(col):
    return {node.name: [node.new_count, node.learn_count, node.review_count]
            for node in col.sched.deck_due_tree().children}


def answer(col, rating):
    cid = col.sched.get_queued_cards(fetch_limit=1).cards[0].card.id
    card = col.get_card(cid)
    card.start_timer()
    states = col._backend.get_scheduling_states(cid)
    col.sched.answer_card(col.sched.build_answer(card=card, states=states, rating=rating))
    return label_of(col, cid)


def answer_timed(col, rating, answered_at):
    """Answer as `answer` does and note when Anki took the answer: its review log id, in ms."""
    label = answer(col, rating)
    answered_at.append(col.db.scalar("select max(id) from revlog"))
    return label


out = {"meta": {"anki": version, "learnAheadSecs": 1200,
                "plan": "label, state, due offset (days for review/day learning, seconds for learning, position for new)"}}

# Mixed states in a rescheduling deck: learning first, then day learning and new spread evenly
# through the reviews, each in gather order.
col = fresh()
mixed = [["R1", "review", -3], ["N1", "new", 1], ["L1", "learn", -60], ["R2", "review", 5], ["N2", "new", 2],
         ["D1", "daylearn", 0], ["R3", "review", -1], ["N3", "new", 3], ["L2", "learn", 3000], ["R4", "review", 40],
         ["N4", "new", 4], ["D2", "daylearn", 2], ["R5", "review", 0], ["N5", "new", 5], ["N6", "new", 6]]
for row in mixed:
    add(col, *row)
build(col, "Filtered", "deck:Default", ORDER_ADDED)
out["mixed"] = {"plan": mixed, **queue(col), "tree": tree(col)}

# The same deck studied to the end, every card answered Good. Each step is the action taken and the
# card shown when it was taken. Answering never rebuilds the queue, so the order holds; undoing an
# answer puts that card back in front of it; burying a card changes cards, so Anki builds the queue
# again and spreads what is left afresh. Answers are a second apart. The card ids and the moment of
# each answer are kept, so the learning cards that come back inside the learn-ahead limit at the end
# can be given the same step fuzz (seeded by card id) and due times.
col = fresh()
card_ids = {row[0]: add(col, *row)[0] for row in mixed}
build(col, "Filtered", "deck:Default", ORDER_ADDED)
session = []
answered_at = []
while queued := col.sched.get_queued_cards(fetch_limit=1).cards:
    shown = label_of(col, queued[0].card.id)
    if len(session) == 4:
        session.append(["undo", shown])
        col.undo()
    elif len(session) == 8:
        session.append(["bury", shown])
        col.sched.bury_cards([queued[0].card.id], manual=True)
    else:
        session.append(["good", answer_timed(col, CardAnswer.GOOD, answered_at)])
        time.sleep(1.1)
out["session"] = {"plan": mixed, "cardIds": card_ids, "answeredAtMs": answered_at, "steps": session}

# A learning card is shown as soon as its step has ended: Anki moves its learning cutoff to the
# present after every answer, so that card comes next, ahead of the main queue. The first learning
# step is six seconds (a little more with its fuzz) and answers are four seconds apart.
col = fresh()
conf = col.decks.config_dict_for_deck_id(col.decks.id("Default"))
conf["new"]["delays"] = [0.1, 10.0]
col.decks.save(conf)
comes_due = [["A", "new", 1], ["B", "new", 2], ["C", "new", 3], ["D", "new", 4], ["E", "new", 5], ["F", "new", 6]]
card_ids = {row[0]: add(col, *row)[0] for row in comes_due}
build(col, "Filtered", "deck:Default", ORDER_ADDED)
steps = []
answered_at = []
while col.sched.get_queued_cards(fetch_limit=1).cards:
    action, rating = ("again", CardAnswer.AGAIN) if not steps else ("good", CardAnswer.GOOD)
    steps.append([action, answer_timed(col, rating, answered_at)])
    time.sleep(4)
out["comesDue"] = {"plan": comes_due, "learnSteps": [0.1, 10], "cardIds": card_ids, "answeredAtMs": answered_at,
                   "steps": steps}

# Learn ahead: the last card answered Again comes back at once.
col = fresh()
add(col, "ONLY", "new", 1)
build(col, "Filtered", "deck:Default", ORDER_ADDED)
answered = answer(col, CardAnswer.AGAIN)
out["learnAhead"] = {"plan": [["ONLY", "new", 1]], "answered": [[answered, 1]], **queue(col), "tree": tree(col)}

# A preview deck deals everything as review; a card waiting out its delay is learning and, with
# nothing else left, comes back inside the learn-ahead limit.
col = fresh()
preview_plan = [["P1", "review", 30], ["P2", "new", 1]]
for row in preview_plan:
    add(col, *row)
build(col, "Preview", "deck:Default", ORDER_ADDED, resched=False)
steps = [{"answered": [], **queue(col), "tree": tree(col)}]
for _ in range(2):
    answered = answer(col, CardAnswer.AGAIN)
    steps.append({"answered": [[answered, 1]], **queue(col), "tree": tree(col)})
out["preview"] = {"plan": preview_plan, "steps": steps}

# A learning card answered onto a day-long step waits in the deck and is not counted.
col = fresh()
conf = col.decks.config_dict_for_deck_id(col.decks.id("Default"))
conf["new"]["delays"] = [1440.0, 2880.0]
col.decks.save(conf)
for row in [["W", "new", 1], ["X", "new", 2]]:
    add(col, *row)
build(col, "Filtered", "deck:Default", ORDER_ADDED)
answered = answer(col, CardAnswer.GOOD)
out["waitingInterday"] = {"plan": [["W", "new", 1], ["X", "new", 2]], "learnSteps": [1440, 2880],
                          "answered": [[answered, 3]], **queue(col), "tree": tree(col)}

# Siblings are left out by the home deck's bury options, as in a normal deck.
col = fresh()
conf = col.decks.config_dict_for_deck_id(col.decks.id("Default"))
conf["new"]["bury"] = True
conf["rev"]["bury"] = True
col.decks.save(conf)
siblings = [["S1", "new", 1], ["S2", "review", 0], ["S3", "new", 2]]
for row in siblings:
    add(col, *row, model="Basic (and reversed card)")
build(col, "Filtered", "deck:Default", ORDER_ADDED)
out["siblings"] = {"plan": siblings, "model": "Basic (and reversed card)", "buryNew": True, "buryReviews": True,
                   **queue(col)}

# Order due in a ten-day-old collection: a new card's position is read as a day since its creation.
col = fresh(crt_days_ago=10)
due_plan = [["RA", "review", -2], ["RB", "review", 3], ["RC", "review", 30],
            ["NA", "new", 5], ["NB", "new", 12], ["NC", "new", 400]]
for row in due_plan:
    add(col, *row)
today, _ = timing(col)
fdid = build(col, "Due", "deck:Default", ORDER_DUE, limit=4)
gathered = [label_of(col, cid) for cid in col.find_cards(f"did:{fdid}", order="c.due")]
gdid = build(col, "Relative", "deck:Default", ORDER_RELATIVE, limit=10)
relative = [label_of(col, cid) for cid in col.find_cards(f"did:{gdid}", order="c.due")]
out["dueOrder"] = {"plan": due_plan, "today": today, "limit": 4, "gathered": gathered, "relativeAfterwards": relative}

with open(OUT, "w") as handle:
    json.dump(out, handle, indent=1, ensure_ascii=False)
    handle.write("\n")
print(f"wrote {OUT}")
