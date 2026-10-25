"""Read-only-to-user-data oracle: every collection is created in a temporary directory.

Run with scripts/anki-oracle/run.sh scripts/anki-oracle/verify_note_import_media.py
Uses the installed Anki runtime, not a translated implementation.
"""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from anki.buildinfo import buildhash, version
from anki.collection import Collection, ExportAnkiPackageOptions, ImportCsvRequest


def add_note(col, model, fields):
    note = col.new_note(model)
    note.fields = fields
    col.add_note(note, 1)
    return note


def import_text(col, directory, model_name, row):
    path = Path(directory) / "update.tsv"
    path.write_text(
        f"#separator:Tab\n#html:true\n#notetype:{model_name}\n#deck:Default\n{row}\n",
        encoding="utf-8",
    )
    metadata = col.get_csv_metadata(str(path), None)
    col.import_csv(ImportCsvRequest(path=str(path), metadata=metadata))


def run():
    results = {"ankiVersion": version, "buildhash": buildhash}
    starting_directory = os.getcwd()
    with TemporaryDirectory(prefix="tus-new-anki-oracle-") as directory:
        col = Collection(str(Path(directory) / "collection.anki2"))
        try:
            basic = col.models.by_name("Basic")
            first = add_note(col, basic, ["Question", "Old answer A"])
            second = add_note(col, basic, ["Question", "Old answer B"])
            import_text(col, directory, basic["name"], "Question\tCorrect answer")
            answers = [col.get_note(note.id).fields[1] for note in (first, second)]
            assert answers == ["Correct answer", "Correct answer"], answers
            results["N3"] = {"answers": answers}

            optional = col.models.by_name("Basic (optional reversed card)")
            note = add_note(col, optional, ["Optional question", "Optional answer", ""])
            before = len(note.card_ids())
            import_text(col, directory, optional["name"], "Optional question\tOptional answer\tyes")
            after = len(col.get_note(note.id).card_ids())
            assert (before, after) == (1, 2), (before, after)
            results["N4"] = {"cardsBefore": before, "cardsAfter": after}

            add_note(col, basic, ['<img src="caf&eacute;.png">', "Answer"])
            filename = col.media.write_data("café.png", bytes([137, 80, 78, 71]))
            package = str(Path(directory) / "export.apkg")
            col.export_anki_package(
                out_path=package,
                options=ExportAnkiPackageOptions(
                    with_scheduling=True, with_deck_configs=True, with_media=True, legacy=True
                ),
                limit=None,
            )
            with ZipFile(package) as archive:
                manifest = json.loads(archive.read("media"))
            assert filename in manifest.values(), manifest
            results["N5"] = {"storedFilename": filename, "exportedMedia": manifest}
        finally:
            col.close()
            # Anki changes the process cwd to collection.media while the collection is open.
            os.chdir(starting_directory)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()
