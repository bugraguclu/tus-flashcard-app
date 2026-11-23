// Cost of a first sync: ingest a whole collection (wire format, 1 MB gzip chunks) into a fresh user DB.
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { USER_SCHEMA } from './schema.mjs';

const DIR = process.argv[2];
for (const profile of ['typical', 'heavy']) {
    const src = new DatabaseSync(join(DIR, `${profile}.sqlite`), { readOnly: true });
    const objs = src.prepare('SELECT kind, id, ident, fields FROM objects').all().map((o) => [o.kind, o.id, o.ident, JSON.parse(o.fields)]);
    const revs = src.prepare('SELECT id, cid, ckind, del, flags, ease, ivl, lastIvl, factor, time, type FROM revlog').all().map((r) => Object.values(r));
    src.close();
    // Client side: split into chunks of at most 1 MB gzip.
    const chunks = [];
    let cur = { objs: [], revs: [] };
    const flush = () => { if (cur.objs.length || cur.revs.length) chunks.push(gzipSync(JSON.stringify(cur))); cur = { objs: [], revs: [] }; };
    for (const o of objs) { cur.objs.push(o); if (cur.objs.length >= 2_000) flush(); }
    flush();
    for (const r of revs) { cur.revs.push(r); if (cur.revs.length >= 25_000) flush(); }
    flush();
    const path = join(DIR, `upload-${profile}.sqlite`);
    rmSync(path, { force: true });
    const cpu0 = process.cpuUsage();
    const t0 = performance.now();
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    db.exec(USER_SCHEMA);
    const insObj = db.prepare('INSERT INTO objects (kind, id, ident, usn, fields) VALUES (?, ?, ?, 1, ?)');
    const insRev = db.prepare('INSERT OR IGNORE INTO revlog (id, cid, ckind, usn, del, flags, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)');
    // Staging: everything lands in one transaction and becomes visible at once (the swap).
    db.exec('BEGIN');
    for (const chunk of chunks) {
        const body = JSON.parse(gunzipSync(chunk).toString());
        for (const [kind, id, ident, fields] of body.objs) insObj.run(kind, id, ident, JSON.stringify(fields));
        for (const r of body.revs) insRev.run(...r);
    }
    db.exec('COMMIT');
    db.close();
    const ms = performance.now() - t0;
    const cpu = process.cpuUsage(cpu0);
    const gz = chunks.reduce((n, c) => n + c.length, 0);
    console.log(`${profile}: ${chunks.length} chunks, ${(gz / 1e6).toFixed(2)} MB gzip, ingest ${ms.toFixed(0)} ms wall, ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms CPU, db ${(statSync(path).size / 1e6).toFixed(1)} MB`);
}
