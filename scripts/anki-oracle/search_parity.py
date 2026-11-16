"""Record browser search results from Anki 26.09.3 on a synthetic collection.

From the repository root:
  ./scripts/anki-oracle/run.sh scripts/anki-oracle/search_parity.py > test/fixtures/anki-26.09-search.json
"""
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import time

from anki.buildinfo import version
from anki.collection import Collection
from anki.errors import SearchError

FIXTURE_TODAY = 100
FIXTURE_NOW_MS = 1_800_000_000_000
LEARN_AHEAD_MINUTES = 20

QUERIES = (
    "", "kalp", "böbrek", "BÖBREK", "bobrek", "nc:bobrek", "nc:BÖBREK",
    "kalp OR böbrek is:new", "(kalp or böbrek) is:new", "-(kalp or böbrek)",
    "kalp and is:new", "kalp is:new", '"yan yana"', "yan yana", '"and"', "andromeda",
    'kalp and(is:new)', 'kalp or(is:new)', '"kalp"(is:new)', "(kalp)or(böbrek)",
    "eXample", "front:*example*", "back:*example*", "nc:example",
    "amp", '"&amp;"', '"left & right"', "𝘼", "nc:ABC",
    "Çınar", "çınar", "cinar", "nc:cinar", "IŞIK", "ışık", "isik", "nc:isik",
    "nc:heisen", "nc:heißen", "nc:heissen", "nc:ola", "nc:fi", "fi",
    "nc:affine", "nc:fullwidth", "nc:は", "nc:ぱ", "nc:ø", "nc:oersted",
    "cafe\u0301", "café", "CAFÉ", "front:nc:cafe", "front:cafe", "back:",
    "deck:Tıp", "deck:tıp", "deck:tip", 'deck:"Tıp::Kadın Doğum"',
    '"deck:Tıp::Kadın Doğum"', 'deck:"Kadın Doğum"', "deck:Tıp -deck:Tıp::*",
    "deck:*doğum*", "deck:Anatomi_1", r"deck:Anatomi\_1", "deck:*", "deck:current",
    "deck:CURRENT", 'deck:"Önizleme"', "deck:filtered", "deck:FILTERED", "deck:",
    "tag:anatomi", "tag:anatomi::böbrek", "tag:ANATOMI", "tag:anatomi::*", "tag:*",
    "tag:none", "tag:None", "tag:NONE", "TAG:none", "tag:NoNe", "tag:n*", "tag:",
    'tag:"with space"', 'tag:nc:cercis', 'tag:nc:heisen', "tag:Anatomi_1", r"tag:Anatomi\_1",
    "note:Basic", "note:basic", "note:BASIC", "note:basic*", "note:", "note:Temel",
    'note:"Özel Tür"', 'note:"özel tür"', 'note:"özel tü*"', 'note:"Tıp_1"', r'note:"Tıp\_1"',
    "is:due", "is:DUE", "is:new", "is:learn", "is:review", "is:learn is:review",
    "is:learn -is:review", "is:review -is:due", "is:suspended", "is:buried",
    "is:buried-sibling", "is:buried-manually", "is:relearn", "flag:1", "flag:0",
    're:"\\bçınar\\b"', 're:"(?-i)çınar"', 're:"(?i)çınar"', 're:"(?P<kelime>çınar)"',
    're:"\\Akalp"', 're:"cevap\\z"', "w:çınar", "w:kalp*böbrek", "w:exa*ple",
    "prop:due=0", "prop:due<=3", "prop:ivl>=21", "prop:reps<10", "prop:lapses>=5",
    "and", "and kalp", "kalp and", "or böbrek", "kalp or", '"kalp', "(kalp", "kalp)",
    "-", "()", "is:", "nc:", "w:", "re:", "x:y",
)


def record(col):
    col.set_config("collapseTime", LEARN_AHEAD_MINUTES * 60)
    # Allow overdue cards with nonnegative day counters. Mirror only offsets in the fixture.
    now = int(time.time())
    col.set_config("rollover", (time.localtime(now).tm_hour + 12) % 24)
    col.db.execute("update col set crt = ?", now - FIXTURE_TODAY * 86_400)
    today = col._backend.sched_timing_today().days_elapsed
    ids = {}
    cards = []
    deck_ids = {}

    def deck_id(name):
        if name not in deck_ids:
            deck_ids[name] = col.decks.id(name)
        return deck_ids[name]

    def seed(front, back="Cevap", *, deck="Tıp", tags=(), model="Basic",
             card_type=0, queue=0, due=1, flags=0, preview=False,
             interval=0, reps=0, lapses=0):
        note = col.new_note(col.models.by_name(model))
        note["Front"] = front
        note["Back"] = back
        note.tags = list(tags)
        col.add_note(note, deck_id(deck))
        cid = note.cards()[0].id
        home_deck = deck
        db_due = due
        if queue in (1, 4):
            db_due = now + due
            due = FIXTURE_NOW_MS + due * 1000
        elif queue in (2, 3) or (queue < 0 and card_type == 2):
            db_due = today + due
            due = FIXTURE_TODAY + due

        if preview:
            deck = "Önizleme"
            did = col.decks.new_filtered(deck) if deck not in deck_ids else deck_ids[deck]
            deck_ids[deck] = did
            # Preview repeats keep a timestamp in due and the home review day in odue.
            col.db.execute("update cards set did=?, odid=?, odue=? where id=?",
                           did, deck_id(home_deck), today + 4, cid)

        col.db.execute("update cards set type=?, queue=?, due=?, flags=?, ivl=?, reps=?, lapses=? where id=?",
                       card_type, queue, db_due, flags, interval, reps, lapses, cid)
        stored_note = col.get_note(note.id)
        card = {
            "id": len(cards) + 1,
            "deckName": deck,
            "noteTypeName": model,
            "fieldList": stored_note.fields,
            "sortFieldIndex": 0,
            "tags": stored_note.tags,
            "type": card_type,
            "queue": queue,
            "due": due,
            "flags": flags,
            "ivl": interval,
            "reps": reps,
            "lapses": lapses,
        }
        if preview:
            card.update(homeDeckName=home_deck, filteredDeckNames=[deck], originalDue=FIXTURE_TODAY + 4)
        ids[cid] = card["id"]
        cards.append(card)

    for model_name in ("Özel Tür", "Tıp_1", "Tıp-1"):
        model = col.models.copy(col.models.by_name("Basic"))
        model["name"] = model_name
        col.models.update_dict(model)

    seed("kalp", "yan yana", card_type=2, queue=2, due=0, flags=1, interval=21, reps=10)
    seed("böbrek", "yana yan", deck="Tıp::Kadın Doğum", tags=("anatomi::böbrek",))
    seed("kalp", "böbrek", deck="Tıp::Kadın Doğum::Obstetri", tags=("anatomi",), reps=3)
    seed("böbrek", deck="Başka::Kadın Doğum", card_type=2, queue=2, due=3, interval=20)
    seed("ex<b>am</b>ple", "left &amp; right", tags=("None",), card_type=2, queue=2, due=-2)
    seed("and andromeda", "ex<b>am</b>ple", tags=("NoNe::child",), card_type=2, queue=-1, due=-3)
    seed("Çınar IŞIK", "kadın", tags=("Çerçis",), card_type=1, queue=1, due=5 * 60)
    seed("çınar ışık", "", deck="Tıp", card_type=3, queue=1, due=60 * 60, lapses=5)
    seed("heisen", "café", tags=("Heißen",), card_type=3, queue=1, due=-60)
    seed("heißen", "oersted", model="Özel Tür", card_type=1, queue=3, due=0)
    seed("heissen", "øersted", card_type=1, queue=3, due=1)
    seed("olá", "ぱ", deck="Anatomi_1", tags=("Anatomi_1",), model="Tıp_1", queue=-3)
    seed("oﬃce aﬃne ﬁ", "は", deck="Anatomi-1", tags=("Anatomi-1",), model="Tıp-1",
         card_type=2, queue=-2, due=-1)
    seed("ｆｕｌｌｗｉｄｔｈ ＡＢＣ 𝘼", card_type=2, queue=4, due=6 * 60, preview=True)
    seed("preview late", card_type=2, queue=4, due=60 * 60, preview=True)
    seed("café")
    col.decks.select(deck_id("Tıp::Kadın Doğum"))

    matches = {}
    invalid = []
    for query in QUERIES:
        try:
            matches[query] = sorted(ids[cid] for cid in col.find_cards(query))
        except SearchError:
            invalid.append(query)
    meta = {
        "anki": version,
        "today": FIXTURE_TODAY,
        "nowMs": FIXTURE_NOW_MS,
        "learnAheadMinutes": LEARN_AHEAD_MINUTES,
        "dayCutoffMs": FIXTURE_NOW_MS - 12 * 60 * 60 * 1000,
        "currentDeckName": "Tıp::Kadın Doğum",
    }
    return {"meta": meta, "cards": cards, "matches": matches, "invalid": invalid}


def main():
    if version != "26.09.3":
        raise RuntimeError(f"Expected Anki 26.09.3, got {version}")
    with TemporaryDirectory(prefix="anki-search-oracle-") as path:
        col = Collection(str(Path(path) / "oracle.anki2"))
        try:
            fixture = record(col)
        finally:
            col.close()
    json_text = json.dumps(fixture, ensure_ascii=False, indent=2)
    # Keep the matched IDs on the query's line for easy comparison.
    json_text = re.sub(r"\[\n(?: +\d+,?\n)+ +\]", lambda match: json.dumps(json.loads(match[0])), json_text)
    print(json_text)


if __name__ == "__main__":
    main()
