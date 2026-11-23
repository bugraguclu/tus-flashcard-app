// Prototype of the revised sync server (V2) for the load test: per-field merge, long-poll, pull.
//   node server.mjs <fleetDir> <port>
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { join } from 'node:path';

const DIR = process.argv[2];
const PORT = Number(process.argv[3] ?? 8787);
const MAX_OPEN = 400;
const WAIT_MS = 25_000;
const accounts = new DatabaseSync(join(DIR, 'accounts.sqlite'));
const findSession = accounts.prepare('SELECT user_id, device_id FROM sessions WHERE token_hash = ? AND expires_at > ?');
const handles = new Map();
const waiters = new Map();
const stats = { push: 0, pull: 0, wait: 0, woke: 0, opened: 0, pushedObjects: 0, pushedReviews: 0, bytesIn: 0, bytesOut: 0 };
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

function open(userId) {
    let h = handles.get(userId);
    if (h) {
        handles.delete(userId);
        handles.set(userId, h);
        return h;
    }
    const db = new DatabaseSync(join(DIR, 'collections', `${userId}.sqlite`));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 1000;');
    h = {
        db,
        getObj: db.prepare('SELECT ident, fields FROM objects WHERE kind = ? AND id = ?'),
        insObj: db.prepare('INSERT INTO objects (kind, id, ident, usn, fields) VALUES (?, ?, ?, ?, ?)'),
        updObj: db.prepare('UPDATE objects SET usn = ?, fields = ? WHERE kind = ? AND id = ?'),
        insRev: db.prepare('INSERT OR IGNORE INTO revlog (id, cid, ckind, usn, del, flags, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        getRev: db.prepare('SELECT cid, ckind, del FROM revlog WHERE id = ?'),
        delRev: db.prepare('UPDATE revlog SET del = 1, usn = ? WHERE id = ?'),
        pullObjs: db.prepare('SELECT kind, id, ident, usn, fields FROM objects WHERE usn > ? ORDER BY usn LIMIT 5000'),
        pullRevs: db.prepare('SELECT id, cid, ckind, usn, del, flags, ease, ivl, lastIvl, factor, time, type FROM revlog WHERE usn > ? ORDER BY usn LIMIT 20000'),
        setUsn: db.prepare("UPDATE meta SET v = ? WHERE k = 'usn'"),
        usn: 0,
    };
    h.usn = db.prepare("SELECT v FROM meta WHERE k = 'usn'").get().v;
    handles.set(userId, h);
    stats.opened++;
    if (handles.size > MAX_OPEN) {
        const [oldId, old] = handles.entries().next().value;
        handles.delete(oldId);
        old.db.close();
    }
    return h;
}

function send(req, res, status, body) {
    let buf = Buffer.from(JSON.stringify(body));
    const headers = { 'content-type': 'application/json' };
    if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
        buf = gzipSync(buf, { level: 4 });
        headers['content-encoding'] = 'gzip';
    }
    headers['content-length'] = buf.length;
    stats.bytesOut += buf.length;
    res.writeHead(status, headers);
    res.end(buf);
}

function readBody(req, limit = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let n = 0;
        req.on('data', (c) => {
            n += c.length;
            if (n > limit) {
                reject(new Error('body too large'));
                req.destroy();
            } else chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const newer = (a, b) => a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]);

async function push(req, res, userId, deviceId) {
    const raw = await readBody(req);
    stats.bytesIn += raw.length;
    const body = JSON.parse((req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString());
    const h = open(userId);
    const usn = h.usn + 1;
    let changed = false;
    const winners = [];
    const conflicts = [];
    h.db.exec('BEGIN IMMEDIATE');
    try {
        for (const [kind, id, ident, fields] of body.objs) {
            const cur = h.getObj.get(kind, id);
            if (!cur) {
                h.insObj.run(kind, id, ident, usn, JSON.stringify(fields));
                changed = true;
                continue;
            }
            if ((cur.ident ?? null) !== (ident ?? null)) {
                conflicts.push([kind, id]);
                continue;
            }
            const stored = JSON.parse(cur.fields);
            let objChanged = false;
            for (const f in fields) {
                if (!stored[f] || newer(fields[f], stored[f])) {
                    stored[f] = fields[f];
                    objChanged = true;
                } else if (stored[f][1] !== fields[f][1] || stored[f][2] !== fields[f][2]) {
                    winners.push([kind, id, f, stored[f]]);
                }
            }
            if (objChanged) {
                h.updObj.run(usn, JSON.stringify(stored), kind, id);
                changed = true;
            }
        }
        for (const r of body.revs) {
            const info = h.insRev.run(r[0], r[1], r[2], usn, r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]);
            if (info.changes) {
                changed = true;
                continue;
            }
            const cur = h.getRev.get(r[0]);
            if (cur.cid !== r[1] || cur.ckind !== r[2]) conflicts.push(['rev', r[0]]);
            else if (r[3] && !cur.del) {
                h.delRev.run(usn, r[0]);
                changed = true;
            }
        }
        if (changed) h.setUsn.run(usn);
        h.db.exec('COMMIT');
    } catch (e) {
        h.db.exec('ROLLBACK');
        throw e;
    }
    stats.push++;
    stats.pushedObjects += body.objs.length;
    stats.pushedReviews += body.revs.length;
    if (changed) {
        h.usn = usn;
        wake(userId, usn, deviceId);
    }
    send(req, res, 200, { usn: h.usn, winners, conflicts, now: Date.now() });
}

function pull(req, res, userId, since) {
    const h = open(userId);
    const objs = h.pullObjs.all(since);
    const revs = h.pullRevs.all(since);
    stats.pull++;
    send(req, res, 200, { usn: h.usn, objs, revs, now: Date.now() });
}

function wait(req, res, userId, deviceId, since) {
    const h = open(userId);
    stats.wait++;
    if (h.usn > since) return send(req, res, 200, { usn: h.usn });
    let set = waiters.get(userId);
    if (!set) waiters.set(userId, (set = new Set()));
    const entry = { deviceId };
    const finish = (usn) => {
        clearTimeout(entry.timer);
        set.delete(entry);
        if (!set.size) waiters.delete(userId);
        if (!res.writableEnded && !res.destroyed) send(req, res, 200, { usn });
    };
    entry.finish = finish;
    entry.timer = setTimeout(() => finish(open(userId).usn), WAIT_MS);
    set.add(entry);
    res.on('close', () => {
        clearTimeout(entry.timer);
        set.delete(entry);
        if (!set.size) waiters.delete(userId);
    });
}

/** Wake this user's other devices; the device that pushed already knows the new usn. */
function wake(userId, usn, fromDevice) {
    const set = waiters.get(userId);
    if (!set) return;
    for (const entry of [...set]) {
        if (entry.deviceId === fromDevice) continue;
        stats.woke++;
        entry.finish(usn);
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://local');
        if (url.pathname === '/stats') {
            const cpu = process.cpuUsage();
            const mem = process.memoryUsage();
            return send(req, res, 200, {
                ...stats, cpuUs: cpu.user + cpu.system, rss: mem.rss, heap: mem.heapUsed, open: handles.size,
                waiting: [...waiters.values()].reduce((n, s) => n + s.size, 0),
                loopP50: loop.percentile(50) / 1e6, loopP99: loop.percentile(99) / 1e6, loopMax: loop.max / 1e6, at: Date.now(),
            });
        }
        if (url.pathname === '/reset-loop') {
            loop.reset();
            return send(req, res, 200, {});
        }
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const session = findSession.get(createHash('sha256').update(token).digest('hex'), Date.now());
        if (!session) return send(req, res, 401, { error: 'unauthorized' });
        const since = Number(url.searchParams.get('since') ?? 0);
        if (url.pathname === '/v1/sync/push' && req.method === 'POST') return await push(req, res, session.user_id, session.device_id);
        if (url.pathname === '/v1/sync/pull') return pull(req, res, session.user_id, since);
        if (url.pathname === '/v1/sync/wait') return wait(req, res, session.user_id, session.device_id, since);
        send(req, res, 404, { error: 'not found' });
    } catch (e) {
        if (!res.headersSent) send(req, res, 500, { error: String(e?.message ?? e) });
    }
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 60_000;
server.maxConnections = 10_000;
server.listen(PORT, () => console.log(`proto sync server on :${PORT}`));
