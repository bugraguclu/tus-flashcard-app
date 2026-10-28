"""Oracle for Image Occlusion notes made in this app.

`lib/imageOcclusion.oracle.test.ts` drives it. Anki imports the app's package and reports, for every
Image Occlusion note, the shapes its own Image Occlusion editor would load
(`Collection.get_image_occlusion_note`) and the shape `<div>`s each card renders for Anki's
occlusion script. It also reads a list of Occlusion fields the way Anki does, so the app's parser
can be compared with Anki's on any input.

Usage (from scripts/anki-oracle):
    ./run.sh image_occlusion.py package IN.apkg OUT.json
    ./run.sh image_occlusion.py fields IN.json OUT.json
        IN.json is a list of Occlusion field texts; OUT.json lists Anki's shapes for each
"""
import json
import os
import re
import shutil
import sys
import tempfile

from anki.collection import Collection
from anki.import_export_pb2 import ImportAnkiPackageOptions, ImportAnkiPackageRequest
from google.protobuf.json_format import MessageToDict

HIDDEN = re.compile(r'<div style="display: none">(.*?)</div>\n<div id="err">', re.S)


def shapes_of(col, note_id):
    """Anki's reading of a note: shapes grouped by cloze number, each group in field order."""
    reply = MessageToDict(col.get_image_occlusion_note(note_id))
    if "note" not in reply:
        return {"error": reply.get("error", "no note")}
    note = reply["note"]
    groups = [
        {"ordinal": group.get("ordinal", 0),
         "shapes": [[shape["shape"], [[p["name"], p["value"]] for p in shape.get("properties", [])]]
                    for shape in group.get("shapes", [])]}
        for group in note.get("occlusions", [])
    ]
    groups.sort(key=lambda group: group["ordinal"])
    return {
        "groups": groups,
        "occludeInactive": note.get("occludeInactive", False),
        "imageFileName": note.get("imageFileName", ""),
        "header": note.get("header", ""),
        "backExtra": note.get("backExtra", ""),
    }


def package(source, out):
    work = tempfile.mkdtemp(prefix="anki-oracle-io-")
    col = Collection(os.path.join(work, "col.anki2"))
    try:
        col.import_anki_package(ImportAnkiPackageRequest(
            package_path=os.path.abspath(source),
            options=ImportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True),
        ))
        notes = []
        for note_id in sorted(col.find_notes("")):
            note = col.get_note(note_id)
            notetype = note.note_type()
            if notetype.get("originalStockKind") != 6:
                continue
            cards = []
            for card in sorted(note.cards(), key=lambda c: c.ord):
                question = HIDDEN.search(card.question())
                answer = HIDDEN.search(card.answer())
                cards.append({"ord": card.ord, "question": question.group(1) if question else None,
                              "answer": answer.group(1) if answer else None})
            notes.append({
                "fields": note.fields,
                "notetype": {"name": notetype["name"], "originalStockKind": notetype.get("originalStockKind"),
                             "tags": [field.get("tag") for field in notetype["flds"]]},
                "media": {name: os.path.exists(os.path.join(col.media.dir(), name))
                          for name in re.findall(r'src="([^"]+)"', note.fields[1])},
                "anki": shapes_of(col, note_id),
                "cards": cards,
            })
        with open(out, "w") as handle:
            json.dump(notes, handle, ensure_ascii=False, indent=1)
    finally:
        col.close()
        shutil.rmtree(work, ignore_errors=True)


def fields(source, out):
    work = tempfile.mkdtemp(prefix="anki-oracle-io-")
    col = Collection(os.path.join(work, "col.anki2"))
    try:
        notetype = col.models.by_name("Image Occlusion")
        result = []
        with open(source) as handle:
            texts = json.load(handle)
        for text in texts:
            note = col.new_note(notetype)
            note["Occlusion"] = text
            note["Image"] = '<img src="x.png">'
            col.add_note(note, 1)
            cards = []
            for card in sorted(note.cards(), key=lambda c: c.ord):
                question = HIDDEN.search(card.question())
                cards.append({"ord": card.ord, "question": question.group(1) if question else None})
            result.append({"anki": shapes_of(col, note.id), "cards": cards})
        with open(out, "w") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=1)
    finally:
        col.close()
        shutil.rmtree(work, ignore_errors=True)


def main():
    command, source, out = sys.argv[1:4]
    {"package": package, "fields": fields}[command](source, out)


if __name__ == "__main__":
    main()
