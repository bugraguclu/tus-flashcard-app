// Load generator: every user has an iPhone and a web tab holding long-polls; answers arrive as
// Poisson pushes, the other device wakes and pulls. Prints server CPU, memory and latencies.
//   node load.mjs <fleetDir> <port> <users> <pushesPerSecond> <seconds> [answersPerPush=3]
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import http from 'node:http';

const [DIR, PORT, USERS, RATE, SECONDS, PER_PUSH] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6]), Number(process.argv[7] ?? 3)];
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity, keepAliveMsecs: 30_000 });
const BASE = `http://127.0.0.1:${PORT}`;
const fleet = JSON.parse(readFileSync(join(DIR, 'tokens.json'), 'utf8')).slice(0, USERS);
const lat = { push: [], pull: [], wakeToPulled: [] };
let errors = 0;
let stop = false;
let hlc = Date.now() * 1000;

function call(dev, path, body) {
    return new Promise((resolve, reject) => {
        const headers = { authorization: `Bearer ${dev.token}`, 'accept-encoding': 'gzip' };
        let payload = null;
        if (body) {
            payload = gzipSync(JSON.stringify(body));
            Object.assign(headers, { 'content-encoding': 'gzip', 'content-type': 'application/json', 'content-length': payload.length });
        }
        const req = http.request(BASE + path, { method: body ? 'POST' : 'GET', headers, agent }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                try {
                    let buf = Buffer.concat(chunks);
                    if (res.headers['content-encoding'] === 'gzip') buf = gunzipSync(buf);
                    const json = JSON.parse(buf.toString());
                    if (res.statusCode !== 200) reject(new Error(`${res.statusCode} ${JSON.stringify(json)}`));
                    else resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.end(payload ?? undefined);
    });
}

async function longPoll(user, dev) {
    while (!stop) {
        try {
            const r = await call(dev, `/v1/sync/wait?since=${dev.since}`);
            if (r.usn > dev.since) {
                const t = performance.now();
                const p = await call(dev, `/v1/sync/pull?since=${dev.since}`);
                lat.pull.push(performance.now() - t);
                if (user.pushedAt) lat.wakeToPulled.push(performance.now() - user.pushedAt);
                dev.since = p.usn;
            }
        } catch (e) {
            if (!stop) errors++;
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}

function answers(n) {
    const objs = [];
    const revs = [];
    for (let i = 0; i < n; i++) {
        const cid = 1_600_000_000_000 + Math.floor(Math.random() * 6_000) * 7;
        const h = ++hlc;
        objs.push([8, cid, null, { sched: [{ type: 2, queue: 2, due: 20_500 + Math.floor(Math.random() * 300), ivl: 12, factor: 2500, reps: 9, lapses: 1, left: 0, lastReview: Date.now(), ankiData: '{"s":42.1,"d":5.2,"dr":0.9,"lrt":1780000000}' }, h, 1] }]);
        revs.push([Date.now() * 10 + Math.floor(Math.random() * 10) + i, cid, 1, 0, 0, 3, 12, 5, 2500, 8000, 1]);
    }
    return { objs, revs };
}

async function pushOnce(user, dev, n) {
    const t = performance.now();
    try {
        user.pushedAt = performance.now();
        const r = await call(dev, '/v1/sync/push', answers(n));
        lat.push.push(performance.now() - t);
        if (r.usn === dev.since + 1) dev.since = r.usn;
    } catch {
        errors++;
    }
}

const stats = () => call({ token: '' }, '/stats');
const users = fleet.map((u) => ({ ...u, devices: u.devices.map((d) => ({ ...d, since: 1 })) }));
for (const u of users) for (const d of u.devices) longPoll(u, d);
await new Promise((r) => setTimeout(r, 1_500));
await call({ token: '' }, '/reset-loop');
const s0 = await stats();
const t0 = Date.now();
const inflight = new Set();
const timer = setInterval(() => {
    const expected = RATE / 100;
    let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    while (n-- > 0) {
        const u = users[Math.floor(Math.random() * users.length)];
        const d = u.devices[Math.random() < 0.6 ? 0 : 1];
        const size = Math.random() < 0.02 ? 150 : PER_PUSH;
        const p = pushOnce(u, d, size);
        inflight.add(p);
        p.finally(() => inflight.delete(p));
    }
}, 10);
await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(timer);
await Promise.all(inflight);
await new Promise((r) => setTimeout(r, 1_000));
const s1 = await stats();
stop = true;
const wall = (s1.at - s0.at) / 1000;
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const fmt = (arr) => `p50 ${pct(arr, 50).toFixed(1)} ms, p99 ${pct(arr, 99).toFixed(1)} ms, n ${arr.length}`;
const reqs = (s1.push - s0.push) + (s1.pull - s0.pull) + (s1.wait - s0.wait);
console.log(JSON.stringify({
    users: USERS, clients: USERS * 2, pushRate: RATE, seconds: wall.toFixed(1),
    requestsPerSec: (reqs / wall).toFixed(1),
    pushesPerSec: ((s1.push - s0.push) / wall).toFixed(1),
    reviewsPerSec: ((s1.pushedReviews - s0.pushedReviews) / wall).toFixed(1),
    serverCpuPctOfOneCore: ((100 * (s1.cpuUs - s0.cpuUs)) / 1e6 / wall).toFixed(2),
    rssMB: (s1.rss / 1e6).toFixed(0), heapMB: (s1.heap / 1e6).toFixed(0), openDbs: s1.open, waiting: s1.waiting,
    loopDelayP99ms: s1.loopP99.toFixed(1), loopDelayMaxMs: s1.loopMax.toFixed(1),
    inKBps: ((s1.bytesIn - s0.bytesIn) / 1024 / wall).toFixed(1), outKBps: ((s1.bytesOut - s0.bytesOut) / 1024 / wall).toFixed(1),
    push: fmt(lat.push), pull: fmt(lat.pull), otherDeviceSees: fmt(lat.wakeToPulled), errors,
}, null, 1));
process.exit(0);
