// Server-side schema of the revised design (V2): one SQLite file per user.
export const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('usn', 0), ('epoch', 1), ('format', 1);
-- One row per synced object. fields = {"group": [value, hlc, device], ...}: last writer wins per group.
CREATE TABLE IF NOT EXISTS objects (
    kind INTEGER NOT NULL,
    id NOT NULL,                -- integer id in the shared id space, package id for catalog rows, text for named rows
    ident TEXT,                 -- identity check (note GUID, card note+ord, session origin); NULL when the id is the identity
    usn INTEGER NOT NULL,
    fields TEXT NOT NULL,
    UNIQUE (kind, id)
);
CREATE INDEX IF NOT EXISTS objects_by_usn ON objects(usn);
-- Grow-only answer log; undo sets del = 1 (sticky). flags bit 0 = spent a review slot (interday learning).
CREATE TABLE IF NOT EXISTS revlog (
    id INTEGER PRIMARY KEY,
    cid INTEGER NOT NULL,
    ckind INTEGER NOT NULL,     -- 0 own card, 1 catalog card (package id)
    usn INTEGER NOT NULL,
    del INTEGER NOT NULL DEFAULT 0,
    flags INTEGER NOT NULL DEFAULT 0,
    ease INTEGER NOT NULL, ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL,
    factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS revlog_by_usn ON revlog(usn);
CREATE TABLE IF NOT EXISTS media (
    name TEXT PRIMARY KEY, sha256 BLOB NOT NULL, size INTEGER NOT NULL,
    usn INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0
);
`;

export const KIND = { note: 1, card: 2, deck: 3, preset: 4, notetype: 5, session: 6, settings: 7, catalogCard: 8, catalogNote: 9, plan: 10 };
