import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import QRCode from 'qrcode';

/**
 * Starts the dev server that a remote tester's iPhone connects to through Expo Go, and closes the
 * failure modes this setup hits. Each one shows up on the phone as a hang or a red screen with
 * nothing obviously wrong in the terminal, so they are handled here rather than documented:
 *
 * 1. The login prompt. With an interactive TTY, Expo CLI asks "Log in / Proceed anonymously" while
 *    serving the manifest, and the phone's request blocks behind that prompt until it times out
 *    with "The network connection was lost". CI=1 makes `isInteractive()` false. The cost is the
 *    terminal UI, replaced here by the address, a generated QR image and a pre-warmed bundle.
 * 2. An unsigned manifest. A physical iPhone refuses a project served from a public URL unless the
 *    manifest is code-signed ("You need to be signed in to Expo Go and Expo CLI"); the simulator is
 *    exempt, which is why anonymous mode looked fine locally while every real device failed.
 *    Signing needs `extra.eas.projectId`, a logged-in CLI, and the tester's Expo Go signed in as an
 *    account authorised for that project.
 * 3. The tunnel race. Metro answers manifest requests before a tunnel connects, handing out a LAN
 *    bundle URL that no remote phone can reach. Nothing is announced until the manifest points at
 *    the public host.
 * 4. A cold bundle. Metro compiles on first request, and over a tunnel that wait alone can exhaust
 *    Expo Go's patience, so the first request is ours over localhost.
 * 5. An unstable tunnel. Expo's own `exp.direct` tunnel drops mid-transfer on this machine
 *    ("Tunnel connection has been closed"), and a drop during the ~9 MB bundle download surfaces as
 *    "Could not connect to development server". Cloudflare is the default transport for that
 *    reason; `--ngrok` keeps the Expo tunnel available.
 */

const PORT = 8081;
const TUNNEL_RELEASE_SECONDS = 45;
const projectRoot = path.resolve(import.meta.dirname, '..');
const QR_PATH = path.join(projectRoot, 'docs', 'expo-go-qr.png');
const SCOPE_KEY_PATH = path.join(projectRoot, '.expo', 'share-scope-key.txt');

const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
const passthrough = process.argv.slice(2).filter((arg) => !['--dev', '--lan', '--ngrok', '--anon'].includes(arg));
const devMode = flags.has('--dev');
const anonMode = flags.has('--anon');
const mode = flags.has('--lan') ? 'lan' : flags.has('--ngrok') ? 'ngrok' : 'cloudflare';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function preflight() {
    const state = readJson(path.join(os.homedir(), '.expo', 'state.json'));

    if (!state?.auth?.sessionSecret) {
        if (anonMode) {
            console.warn('\nCLI oturumu kapalı: manifest imzasız sunulacak.');
            console.warn('Simülatörde çalışır, gerçek iPhone "You need to be signed in..." hatası verir.\n');
            return;
        }
        console.error('\nExpo CLI oturumu kapalı.');
        console.error('Gerçek bir iPhone, halka açık adresten gelen imzasız manifesti kabul etmiyor.\n');
        console.error('Çözüm:  npx expo login --browser     (hesap: smbg)');
        console.error('Yalnızca simülatörde deneyecekseniz:  npm run share -- --anon\n');
        process.exit(1);
    }

    console.log(`Expo hesabı     : ${state.auth.username ?? 'bilinmiyor'}  (Expo Go da aynı hesapla girmeli)`);
}

async function fetchManifest() {
    const response = await fetch(`http://localhost:${PORT}/`, {
        headers: { 'expo-platform': 'ios', accept: 'application/expo+json,application/json' },
        signal: AbortSignal.timeout(5000),
    });
    return response.json();
}

/**
 * Asks for the manifest the way Expo Go does. The signature is only produced when the client sends
 * `expo-expect-signature` with keyid "expo-root", and the scope key follows it: an unsigned request
 * reports `@anonymous/…` even on a project that signs correctly.
 */
async function fetchSignedManifest() {
    try {
        const response = await fetch(`http://localhost:${PORT}/`, {
            headers: {
                'expo-platform': 'ios',
                'expo-expect-signature': 'sig, keyid="expo-root", alg="rsa-v1_5-sha256"',
                accept: 'multipart/mixed,application/expo+json,application/json',
            },
            signal: AbortSignal.timeout(10000),
        });
        const body = await response.text();
        const start = body.indexOf('{"id"');
        if (start === -1) return null;
        const end = body.indexOf('\n------', start);
        return JSON.parse(end === -1 ? body.slice(start) : body.slice(start, end).trim());
    } catch {
        return null;
    }
}

function manifestHost(manifest) {
    const url = manifest?.launchAsset?.url;
    return url ? new URL(url).host : null;
}

/** A host is only useful to a remote phone if it answers from outside this machine. */
async function isPubliclyReachable(host) {
    for (const scheme of ['https', 'http']) {
        try {
            const response = await fetch(`${scheme}://${host}/status`, { signal: AbortSignal.timeout(8000) });
            if ((await response.text()).includes('packager-status:running')) return true;
        } catch {
            // Try the other scheme, then give up.
        }
    }
    return false;
}

function killServerOnPort() {
    try {
        const pids = execFileSync('lsof', ['-ti', `tcp:${PORT}`], { encoding: 'utf8' }).trim().split('\n');
        for (const pid of pids.filter(Boolean)) process.kill(Number(pid), 'SIGTERM');
    } catch {
        // Nothing listening.
    }
}

async function cooldown(seconds) {
    process.stdout.write(`Önceki tünel oturumunun kapanması bekleniyor: ${seconds} sn`);
    for (let left = seconds; left > 0; left -= 5) {
        await sleep(5000);
        process.stdout.write('.');
    }
    process.stdout.write('\n');
}

function checkScopeKey(scopeKey) {
    const previous = fs.existsSync(SCOPE_KEY_PATH) ? fs.readFileSync(SCOPE_KEY_PATH, 'utf8').trim() : null;
    if (previous && previous !== scopeKey) {
        console.warn(`\nUYARI: kapsam anahtarı değişti.`);
        console.warn(`  önceki : ${previous}`);
        console.warn(`  şimdiki: ${scopeKey}`);
        console.warn(`Expo Go uygulamayı sıfırdan kurulmuş sayar: koleksiyon ve ilerleme görünmez olur.\n`);
    }
    fs.mkdirSync(path.dirname(SCOPE_KEY_PATH), { recursive: true });
    fs.writeFileSync(SCOPE_KEY_PATH, `${scopeKey}\n`);
}

/** Compiles the bundle before the tester's phone asks for it, over localhost rather than the tunnel. */
async function warmBundle(bundleUrl) {
    const local = new URL(bundleUrl);
    local.protocol = 'http:';
    local.host = `localhost:${PORT}`;
    const startedAt = Date.now();
    const response = await fetch(local);
    const bytes = (await response.arrayBuffer()).byteLength;
    return { bytes, seconds: ((Date.now() - startedAt) / 1000).toFixed(1) };
}

function startCloudflared() {
    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const state = { child, url: null, failed: false };
    const scan = (chunk) => {
        const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
        if (match && !state.url) state.url = match[0];
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', () => { state.failed = true; });
    child.on('exit', () => { state.failed = true; });
    return state;
}

function startExpo(publicUrl) {
    const args = ['start', '--go', ...(devMode ? [] : ['--no-dev', '--minify']), ...passthrough];
    if (mode === 'ngrok') args.push('--tunnel');
    else args.push('--lan');

    const child = spawn(path.join(projectRoot, 'node_modules', '.bin', 'expo'), args, {
        cwd: projectRoot,
        env: {
            ...process.env,
            // CI=1 stops the login prompt from blocking the tester's manifest request.
            CI: '1',
            // Overrides the URL handed to clients, which is how Metro is put behind Cloudflare.
            ...(publicUrl ? { EXPO_PACKAGER_PROXY_URL: publicUrl } : {}),
        },
        stdio: ['inherit', 'pipe', 'pipe'],
    });

    const state = { child, alive: true, tunnelFailed: false };
    for (const stream of ['stdout', 'stderr']) {
        child[stream].on('data', (chunk) => {
            const text = chunk.toString();
            if (text.includes('failed to start tunnel')) state.tunnelFailed = true;
            process[stream].write(text);
        });
    }
    child.on('exit', () => { state.alive = false; });
    return state;
}

async function waitForPublicManifest(isAlive, expectedHost) {
    for (let attempt = 0; attempt < 150 && isAlive(); attempt += 1) {
        const manifest = await fetchManifest().catch(() => null);
        const host = manifestHost(manifest);
        if (host && (mode === 'lan' || host === expectedHost || host.endsWith('.exp.direct'))) return manifest;
        await sleep(1000);
    }
    return null;
}

async function announce(host, warm, scopeKey, extraLine) {
    const signed = scopeKey && !scopeKey.startsWith('@anonymous/');
    if (mode !== 'lan') await QRCode.toFile(QR_PATH, `exp://${host}`, { width: 600, margin: 4 });

    const line = '─'.repeat(64);
    console.log(`\n${line}`);
    console.log(`  Adres  : exp://${host}`);
    if (mode !== 'lan') console.log(`  QR     : docs/expo-go-qr.png  (her açılışta yenilenir)`);
    if (warm) console.log(`  Paket  : hazır — ${(warm.bytes / 1e6).toFixed(1)} MB, ${warm.seconds} sn`);
    // Label the transport actually in use: an adopted server may not be the one this mode asked for.
    const transport = host.endsWith('.trycloudflare.com') ? 'Cloudflare'
        : host.endsWith('.exp.direct') ? 'Expo (exp.direct)'
        : 'yok — yerel ağ';
    console.log(`  Tünel  : ${transport}`);
    console.log(`  İmza   : ${signed ? `var — ${scopeKey}` : 'YOK (anonim) — gerçek iPhone bunu açmaz'}`);
    console.log(line);
    if (!signed && !anonMode) {
        console.log('  Manifest imzalanamadı: npx expo whoami ve app.json > extra.eas.projectId kontrol et.');
    }
    console.log(`  ${extraLine}\n`);
}

preflight();

const running = await fetchManifest().catch(() => null);
const runningHost = manifestHost(running);
if (runningHost && (await isPubliclyReachable(runningHost))) {
    const scopeKey = (await fetchSignedManifest())?.extra?.scopeKey ?? running.extra?.scopeKey;
    checkScopeKey(scopeKey);
    const warm = await warmBundle(running.launchAsset.url).catch(() => null);
    await announce(runningHost, warm, scopeKey, 'Sunucu başka bir terminalde zaten çalışıyor; bu pencereyi kapatabilirsin.');
    process.exit(0);
}
if (running) {
    console.log(`\n${PORT} portunda dışarıdan erişilemeyen bir sunucu var, kapatılıyor.`);
    killServerOnPort();
    await cooldown(mode === 'ngrok' ? TUNNEL_RELEASE_SECONDS : 5);
}

let expo = null;
let cloudflared = null;
const stop = () => {
    expo?.child.kill('SIGINT');
    cloudflared?.child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (let attempt = 0; attempt < 2; attempt += 1) {
    let publicUrl = null;

    if (mode === 'cloudflare') {
        cloudflared = startCloudflared();
        for (let waited = 0; waited < 60 && !cloudflared.url && !cloudflared.failed; waited += 1) await sleep(1000);
        if (!cloudflared.url) {
            console.error('\nCloudflare tüneli açılamadı. Expo tüneliyle dene:  npm run share -- --ngrok\n');
            stop();
            process.exit(1);
        }
        publicUrl = cloudflared.url;
        console.log(`Cloudflare      : ${publicUrl}`);
    }

    expo = startExpo(publicUrl);
    const expectedHost = publicUrl ? new URL(publicUrl).host : null;
    const manifest = await waitForPublicManifest(() => expo.alive, expectedHost);

    if (manifest) {
        const host = manifestHost(manifest);
        const scopeKey = (await fetchSignedManifest())?.extra?.scopeKey ?? manifest.extra?.scopeKey;
        checkScopeKey(scopeKey);
        const warm = await warmBundle(manifest.launchAsset.url).catch(() => null);
        await announce(host, warm, scopeKey, 'Test kullanıcısı şimdi bağlanabilir. Çıkmak için Ctrl+C.');
        await new Promise((resolve) => expo.child.on('exit', resolve));
        cloudflared?.child.kill('SIGTERM');
        console.log('\nSunucu kapandı.\n');
        process.exit(0);
    }

    if (expo.alive) {
        console.error('\nAdres 150 saniyede hazır olmadı. QR gönderme: telefon paketi indiremez.\n');
        stop();
        process.exit(1);
    }

    if (expo.tunnelFailed && attempt === 0) {
        console.log('\nTünel açılamadı; otomatik tekrar denenecek.');
        cloudflared?.child.kill('SIGTERM');
        await cooldown(TUNNEL_RELEASE_SECONDS);
        continue;
    }

    console.error('\nSunucu beklenmedik şekilde kapandı. Yukarıdaki hataya bak.\n');
    stop();
    process.exit(1);
}
