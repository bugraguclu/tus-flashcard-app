#!/usr/bin/env python3
"""Apply all reviewed catalog card corrections to assets/catalog/bka-tus-complete.apkg.

Reads:
- outputs/kart-duzeltme/BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.patch.json
- docs/catalog-corrections/*.patch.json (11 courses)

Invariants:
- Only notes.flds, sfld, csum and mod change.
- All note GUIDs must match.
- For docs patches, current field content must match 'before'.
- Cloze ordinals in text must exactly match card ordinals.
- Media references (<img> tags) must be preserved.
- PRAGMA integrity_check must pass.
- Zip structure, permissions and metadata preserved.
"""
import glob
import hashlib
import html
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
import zipfile

CLOZE = re.compile(r"\{\{c(\d+)::")
IMG = re.compile(r"(?i)<img[^>]+src=[\"']?([^\"'>]+)[\"']?[^>]*>")


def strip_media(value: str) -> str:
    return IMG.sub(r" \1 ", value)


def strip_html(value: str) -> str:
    value = re.sub(r"(?s)<!--.*?-->", "", value)
    value = re.sub(r"(?si)<style.*?>.*?</style>", "", value)
    value = re.sub(r"(?si)<script.*?>.*?</script>", "", value)
    value = re.sub(r"(?s)<.*?>", "", value)
    return html.unescape(value).replace("\xa0", " ")


def sort_field(value: str) -> str:
    return strip_html(strip_media(value))


def checksum(first_field: str) -> int:
    return int(hashlib.sha1(sort_field(first_field).encode("utf-8")).hexdigest()[:8], 16)


def main():
    package_path = "assets/catalog/bka-tus-complete.apkg"
    farma_path = "outputs/kart-duzeltme/BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.patch.json"
    docs_pattern = "docs/catalog-corrections/*.patch.json"

    print("Loading patches...")
    patches = {}  # nid -> {guid, fields: {name: after_val}}

    # Load Farmakoloji
    with open(farma_path, encoding="utf-8") as f:
        farma_data = json.load(f)
    for entry in farma_data["notes"]:
        nid = int(entry["id"])
        patches[nid] = {
            "source": "Farmakoloji",
            "guid": entry["guid"],
            "fields": entry["fields"],
        }
    print(f"  Loaded {len(farma_data['notes'])} notes from Farmakoloji")

    # Load 11 courses from docs/catalog-corrections
    docs_files = sorted(glob.glob(docs_pattern))
    for pfile in docs_files:
        with open(pfile, encoding="utf-8") as f:
            pdata = json.load(f)
        course = pdata.get("course", os.path.basename(pfile))
        for entry in pdata.get("notes", []):
            nid = int(entry["noteId"])
            if nid in patches:
                sys.exit(f"Conflict: note {nid} already defined in {patches[nid]['source']}")
            field_updates = {}
            for fname, fval in entry["fields"].items():
                after_val = fval["after"] if isinstance(fval, dict) else fval
                before_val = fval["before"] if isinstance(fval, dict) else None
                field_updates[fname] = (before_val, after_val)
            patches[nid] = {
                "source": course,
                "guid": entry["guid"],
                "fields_with_before": field_updates,
            }
        print(f"  Loaded {len(pdata.get('notes', []))} notes from {course}")

    print(f"Total unique notes to patch: {len(patches)}")

    work = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(package_path) as archive:
            entries = archive.infolist()
            payload = {info.filename: archive.read(info.filename) for info in entries}

        db_path = os.path.join(work, "collection.anki21")
        with open(db_path, "wb") as f:
            f.write(payload["collection.anki21"])

        db = sqlite3.connect(db_path)
        db.create_collation("unicase", lambda a, b: (a.lower() > b.lower()) - (a.lower() < b.lower()))
        models = json.loads(db.execute("SELECT models FROM col").fetchone()[0])

        # Verify initial consistency
        for nid, mid, flds, sfld, csum in db.execute("SELECT id, mid, flds, sfld, csum FROM notes"):
            fields = flds.split("\x1f")
            sf = sort_field(fields[models[str(mid)]["sortf"]])
            cs = checksum(fields[0])
            if str(sfld) != sf or csum != cs:
                sys.exit(f"Sort field / checksum mismatch on note {nid} before patching!")

        now = int(time.time())
        changed = 0
        unchanged = 0

        for nid, pinfo in patches.items():
            row = db.execute("SELECT guid, mid, flds FROM notes WHERE id = ?", (nid,)).fetchone()
            if row is None:
                sys.exit(f"Note {nid} ({pinfo['source']}) not found in package!")
            guid, mid, flds = row
            if guid != pinfo["guid"]:
                sys.exit(f"Note {nid} GUID mismatch: db {guid!r} != patch {pinfo['guid']!r}")

            model = models[str(mid)]
            names = [f["name"] for f in model["flds"]]
            fields = flds.split("\x1f")

            if "fields_with_before" in pinfo:
                for fname, (before_val, after_val) in pinfo["fields_with_before"].items():
                    if fname not in names:
                        sys.exit(f"Note {nid} unknown field {fname!r}")
                    idx = names.index(fname)
                    old = fields[idx]
                    if before_val is not None and old != before_val:
                        sys.exit(f"Note {nid} before mismatch on {fname}:\n  DB: {old!r}\n  Before: {before_val!r}")
                    if sorted(IMG.findall(old)) != sorted(IMG.findall(after_val)):
                        sys.exit(f"Note {nid} media references changed in {fname}")
                    fields[idx] = after_val
            else:
                for fname, after_val in pinfo["fields"].items():
                    if fname not in names:
                        sys.exit(f"Note {nid} unknown field {fname!r}")
                    idx = names.index(fname)
                    old = fields[idx]
                    if sorted(IMG.findall(old)) != sorted(IMG.findall(after_val)):
                        sys.exit(f"Note {nid} media references changed in {fname}")
                    fields[idx] = after_val

            if model.get("type") == 1:
                card_ords = {o + 1 for (o,) in db.execute("SELECT ord FROM cards WHERE nid = ?", (nid,))}
                text_ords = {int(n) for n in CLOZE.findall(fields[names.index("Text")])}
                if card_ords != text_ords:
                    sys.exit(f"Note {nid} cloze ordinals {text_ords} differ from cards {card_ords}")

            new_flds = "\x1f".join(fields)
            if new_flds == flds:
                unchanged += 1
                continue

            db.execute(
                "UPDATE notes SET flds = ?, sfld = ?, csum = ?, mod = ? WHERE id = ?",
                (new_flds, sort_field(fields[model["sortf"]]), checksum(fields[0]), now, nid),
            )
            changed += 1

        db.commit()
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            sys.exit(f"SQLite integrity check failed: {integrity}")
        db.close()

        print(f"Patching complete: {changed} notes modified, {unchanged} notes unchanged.")

        data = open(db_path, "rb").read()
        payload["collection.anki21"] = data

        with zipfile.ZipFile(package_path, "w") as archive:
            for info in entries:
                clone = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                clone.compress_type = info.compress_type
                clone.external_attr = info.external_attr
                if info.filename == "collection.anki21":
                    clone.date_time = time.localtime(now)[:6]
                archive.writestr(clone, payload[info.filename])

        print(f"Updated package written to {package_path} ({os.path.getsize(package_path)} bytes)")

        # Mark applied: true in docs/catalog-corrections/*.patch.json
        for pfile in docs_files:
            with open(pfile, encoding="utf-8") as f:
                pdata = json.load(f)
            pdata["applied"] = True
            with open(pfile, "w", encoding="utf-8") as f:
                json.dump(pdata, f, ensure_ascii=False, indent=1)
        print("Updated 'applied': true in all docs/catalog-corrections/*.patch.json files.")

    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
