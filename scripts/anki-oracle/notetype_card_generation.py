"""Probe: which cards Anki creates when a note type is saved.

`lib/noteTypeCardGeneration.ts` follows what this prints. A note type is changed through
`col.models.update_dict` (what the Cards and Fields screens call) and every note's cards are listed
before and after, so the output shows:

  * a front template that starts to render gives each note of the type its missing card;
  * which deck and new-card position the card gets, with siblings that are new, reviewed, inside a
    filtered deck, or spread over two decks;
  * a note without any card, and a note whose front is still empty, get nothing;
  * saving again creates nothing, and no existing card is changed;
  * a back-template or styling change creates nothing, even where a card is missing;
  * removing a field that a front's condition tested creates the cards too;
  * a cloze type creates a card only for a cloze number without one, and only when its front is saved;
  * which other saves (a field added, moved, renamed or removed, a card type added) fill a gap;
  * that only a front that changes fills one: a field a front shows renamed does, a field only a
    back shows or no template shows renamed or removed does not, nor a name, sticky or sort field.

Usage (from scripts/anki-oracle):
    ./run.sh notetype_card_generation.py
"""
import os
import shutil
import tempfile

from anki.buildinfo import version
from anki.collection import Collection


def cards_of(col, note_id):
    rows = col.db.all(
        "select ord, did, odid, type, queue, due, odue, ivl, reps from cards where nid = ? order by ord, id",
        note_id,
    )
    names = {deck.id: deck.name for deck in col.decks.all_names_and_ids(include_filtered=True)}
    return [
        "ord=%d deck=%s%s type=%d queue=%d due=%d%s ivl=%d reps=%d" % (
            ord_, names.get(did, did), " home=%s" % names.get(odid, odid) if odid else "",
            type_, queue, due, " odue=%d" % odue if odid else "", ivl, reps)
        for ord_, did, odid, type_, queue, due, odue, ivl, reps in rows
    ]


def show(col, title, notes):
    print(title)
    for label, note_id in notes:
        cards = cards_of(col, note_id)
        print("  %-34s %d card%s" % (label, len(cards), "" if len(cards) == 1 else "s"))
        for line in cards:
            print("      " + line)


def new_type(col, name, fields, templates):
    models = col.models
    model = models.new(name)
    for field in fields:
        models.add_field(model, models.new_field(field))
    for index, (front, back) in enumerate(templates):
        template = models.new_template("Card %d" % (index + 1))
        template["qfmt"], template["afmt"] = front, back
        models.add_template(model, template)
    models.add(model)
    return models.by_name(name)


def add(col, model, deck_id, values):
    note = col.new_note(col.models.get(model["id"]))
    for name, value in values.items():
        note[name] = value
    col.add_note(note, deck_id)
    return note.id


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-cardgen-")
    col = Collection(os.path.join(work, "col.anki2"))
    try:
        print("Anki", version)
        deck_a, deck_b = col.decks.id("A"), col.decks.id("B")
        filtered = col.decks.new_filtered("Filtered")

        # 1. A front that starts to render.
        model = new_type(col, "Probe", ["Front", "Back", "Extra"], [
            ("{{Front}}", "{{Back}}"),
            ("{{#Extra}}{{Back}}{{/Extra}}", "{{Front}}"),
        ])
        notes = [
            ("new sibling in A", add(col, model, deck_a, {"Front": "f1", "Back": "b1"})),
            ("Extra filled (already 2 cards)", add(col, model, deck_a, {"Front": "f2", "Back": "b2", "Extra": "x"})),
            ("reviewed sibling in B", add(col, model, deck_b, {"Front": "f3", "Back": "b3"})),
            ("sibling in a filtered deck", add(col, model, deck_a, {"Front": "f4", "Back": "b4"})),
            ("note without cards", add(col, model, deck_a, {"Front": "f5", "Back": "b5"})),
            ("Back empty (front still empty)", add(col, model, deck_a, {"Front": "f6"})),
        ]
        by_label = dict(notes)
        reviewed = col.get_note(by_label["reviewed sibling in B"]).cards()[0]
        reviewed.type, reviewed.queue, reviewed.ivl, reviewed.due, reviewed.reps, reviewed.factor = 2, 2, 9, 40, 3, 2500
        col.update_card(reviewed)
        resting = col.get_note(by_label["sibling in a filtered deck"]).cards()[0]
        resting.type, resting.queue, resting.ivl, resting.due, resting.reps, resting.factor = 2, 2, 5, 30, 2, 2500
        col.update_card(resting)
        resting.odid, resting.odue, resting.did, resting.due = resting.did, resting.due, filtered, -1
        col.update_card(resting)
        col.db.execute("delete from cards where nid = ?", by_label["note without cards"])
        show(col, "\n1. before: Card 2 front is {{#Extra}}{{Back}}{{/Extra}}", notes)

        model = col.models.get(model["id"])
        model["tmpls"][1]["qfmt"] = "{{Back}}"
        col.models.update_dict(model)
        show(col, "\n1. after saving Card 2 front as {{Back}}", notes)

        total = col.card_count()
        model = col.models.get(model["id"])
        model["tmpls"][1]["qfmt"] = "{{Back}} "
        col.models.update_dict(model)
        print("\n1. saving a changed front again: %d cards before, %d after" % (total, col.card_count()))

        # 2. A back-template or styling change with a card missing.
        missing = by_label["new sibling in A"]
        col.db.execute("delete from cards where nid = ? and ord = 1", missing)
        model = col.models.get(model["id"])
        model["tmpls"][1]["afmt"] = "{{Front}}<br>"
        model["css"] += "\n.card { color: red; }"
        col.models.update_dict(model)
        print("\n2. Card 2 deleted behind Anki's back, then only a back template and the styling saved: %d card(s)"
              % len(cards_of(col, missing)))
        model = col.models.get(model["id"])
        model["tmpls"][0]["qfmt"] = "<b>{{Front}}</b>"
        col.models.update_dict(model)
        print("   then Card 1's front saved: %d card(s)" % len(cards_of(col, missing)))

        # 3. Siblings in two decks.
        spread = new_type(col, "Spread", ["Front", "Back", "Extra"], [
            ("{{Front}}", "{{Back}}"),
            ("{{Back}}", "{{Front}}"),
            ("{{#Extra}}{{Front}}{{/Extra}}", "{{Back}}"),
        ])
        col.add_note(col.new_note(col.models.get(model["id"])), deck_a)  # the last deck a note was added to: A
        spread_note = add(col, spread, deck_b, {"Front": "f", "Back": "b"})
        second = col.get_note(spread_note).cards()[1]
        second.did = col.decks.id("C")
        col.update_card(second)
        spread = col.models.get(spread["id"])
        spread["tmpls"][2]["qfmt"] = "{{Front}}!"
        col.models.update_dict(spread)
        show(col, "\n3. siblings in B and C (note added to B), Card 3 front saved as {{Front}}!", [("spread note", spread_note)])

        # 4. Removing the field a front's condition tested.
        removal = new_type(col, "Removal", ["Front", "Back", "Extra"], [
            ("{{Front}}", "{{Back}}"),
            ("{{#Extra}}{{Back}}{{/Extra}}", "{{Front}}"),
        ])
        removal_note = add(col, removal, deck_a, {"Front": "f", "Back": "b"})
        removal = col.models.get(removal["id"])
        col.models.remove_field(removal, removal["flds"][2])
        col.models.update_dict(removal)
        removal = col.models.get(removal["id"])
        print("\n4. field Extra removed: Card 2 front is now %r" % removal["tmpls"][1]["qfmt"])
        show(col, "   its note", [("note", removal_note)])

        # 5. Cloze.
        cloze = col.models.by_name("Cloze")
        cloze_notes = [
            ("c1 only", add(col, cloze, deck_a, {"Text": "{{c1::one}}"})),
            ("c1 and c3, card 3 deleted", add(col, cloze, deck_a, {"Text": "{{c1::one}} {{c3::three}}"})),
            ("no cloze left, card of c2 kept", add(col, cloze, deck_a, {"Text": "{{c2::two}}"})),
        ]
        col.db.execute("delete from cards where nid = ? and ord = 2", dict(cloze_notes)["c1 and c3, card 3 deleted"])
        col.db.execute("update notes set flds = 'plain' || char(31) || '' where id = ?",
                       dict(cloze_notes)["no cloze left, card of c2 kept"])
        show(col, "\n5. cloze before", cloze_notes)
        cloze = col.models.get(cloze["id"])
        cloze["tmpls"][0]["afmt"] += "<br>"
        col.models.update_dict(cloze)
        show(col, "\n5. cloze after saving only its back template", cloze_notes)
        cloze = col.models.get(cloze["id"])
        cloze["tmpls"][0]["qfmt"] = "<i>{{cloze:Text}}</i>"
        col.models.update_dict(cloze)
        show(col, "\n5. cloze after saving its front template", cloze_notes)

        # 6. Which other saves fill a gap: a card deleted behind Anki's back each time.
        gaps = new_type(col, "Gaps", ["Front", "Back"], [("{{Front}}", "{{Back}}"), ("{{Back}}", "{{Front}}")])
        gap_note = add(col, gaps, deck_a, {"Front": "f", "Back": "b"})

        def after(change):
            col.db.execute("delete from cards where nid = ? and ord = 1", gap_note)
            current = col.models.get(gaps["id"])
            change(current)
            col.models.update_dict(current)
            return len(col.db.list("select id from cards where nid = ? and ord = 1", gap_note))

        print("\n6. Card 2 deleted behind Anki's back, then one change saved; Card 2 created again?")
        print("   a field added:        %d" % after(lambda m: col.models.add_field(m, col.models.new_field("Extra"))))
        print("   a field moved:        %d" % after(lambda m: col.models.reposition_field(m, m["flds"][2], 0)))
        print("   a field renamed:      %d" % after(lambda m: col.models.rename_field(m, m["flds"][1], "Question")))
        print("   a field removed:      %d" % after(lambda m: col.models.remove_field(m, m["flds"][0])))

        def add_template(m):
            template = col.models.new_template("Card 3")
            template["qfmt"], template["afmt"] = "{{Back}}?", "{{Question}}"
            col.models.add_template(m, template)

        print("   a card type added:    %d" % after(add_template))
        show(col, "   the note after the card type was added", [("note", gap_note)])

        # 7. Only a changed front fills a gap. Each change gets a fresh type whose Back is shown on
        #    a front, Extra only on a back and Spare nowhere, and a note missing its Card 2.
        print("\n7. Card 2 deleted behind Anki's back, then one change saved on a fresh type; Card 2 created again?")
        fresh = [0]

        def on_fresh_type(label, change):
            fresh[0] += 1
            model = new_type(col, "Trigger %d" % fresh[0], ["Front", "Back", "Extra", "Spare"], [
                ("{{Front}}", "{{Back}}<br>{{Extra}}"),
                ("{{Back}}", "{{Front}}"),
            ])
            note_id = add(col, model, deck_a, {"Front": "f", "Back": "b", "Extra": "x"})
            col.db.execute("delete from cards where nid = ? and ord = 1", note_id)
            current = col.models.get(model["id"])
            change(current)
            col.models.update_dict(current)
            print("   %-46s %d" % (label + ":", len(col.db.list("select id from cards where nid = ? and ord = 1", note_id))))

        models = col.models
        on_fresh_type("a field a front shows renamed (Back)", lambda m: models.rename_field(m, m["flds"][1], "Answer"))
        on_fresh_type("a field only a back shows renamed (Extra)", lambda m: models.rename_field(m, m["flds"][2], "More"))
        on_fresh_type("a field no template shows renamed (Spare)", lambda m: models.rename_field(m, m["flds"][3], "Unused"))
        on_fresh_type("a field only a back shows removed (Extra)", lambda m: models.remove_field(m, m["flds"][2]))
        on_fresh_type("a field no template shows removed (Spare)", lambda m: models.remove_field(m, m["flds"][3]))
        on_fresh_type("a field made sticky", lambda m: m["flds"][0].__setitem__("sticky", True))
        on_fresh_type("the sort field changed", lambda m: models.set_sort_index(m, 1))
        on_fresh_type("the note type renamed", lambda m: m.__setitem__("name", m["name"] + " renamed"))
        on_fresh_type("a card type renamed", lambda m: m["tmpls"][1].__setitem__("name", "Production"))
        on_fresh_type("a back changed", lambda m: m["tmpls"][0].__setitem__("afmt", "{{Back}}!"))
        on_fresh_type("the styling changed", lambda m: m.__setitem__("css", m["css"] + "\n.card { color: red; }"))
        on_fresh_type("another card type's front changed", lambda m: m["tmpls"][0].__setitem__("qfmt", "{{Front}}!"))
    finally:
        col.close()
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
