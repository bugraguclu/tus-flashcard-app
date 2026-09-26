/*
 * TusAnkiM service worker.
 *
 * The iPhone app starts without a network because it is installed; this worker gives the
 * installed web app the same property. Pages are fetched network-first, so a new release is
 * picked up as soon as it is online, and fall back to the last copy when offline. The JavaScript
 * bundle and assets carry a content hash in their names, so a cached copy can never be stale and
 * is served cache-first. The learner's collection is not here — it lives in IndexedDB.
 *
 * Every route of the static export is the same page — the router draws the screen from the URL
 * once the bundle runs — so one copy of that page (the shell) answers every route offline, and
 * the bundle it names is kept beside it. A per-route copy could outlive a release and name a
 * bundle that was pruned, which started to a blank page, or ran an older build against a
 * collection the newer one had already migrated.
 *
 * It also answers clicks on study reminders, which the page shows through this worker.
 */

const CACHE = 'tusankim-app-v2';
const SHELL = '/';
const HASHED_PATHS = ['/_expo/static/', '/assets/'];
const PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
// A connection this slow to answer starts the app from the shell instead; the network copy still
// replaces the shell once it arrives.
const NAVIGATION_TIMEOUT_MS = 4000;
const STUDY_REMINDER_KIND = 'tusankim.study-reminder';

/** The static bundle files the page loads, e.g. /_expo/static/js/web/entry-<hash>.js. */
function bundlePaths(html) {
    return [...new Set(html.match(/\/_expo\/static\/[^"'\s)]+/g) || [])];
}

/**
 * Stores `response` as the shell and makes sure the bundle it names is cached with it, then drops
 * bundles no longer named, so releases do not pile up.
 */
async function storeShell(cache, response) {
    const html = await response.clone().text();
    const paths = bundlePaths(html);
    await Promise.all(paths.map(async (path) => {
        if (await cache.match(path)) return;
        try {
            const asset = await fetch(path);
            if (asset.ok) await cache.put(path, asset);
        } catch {
            // Offline mid-release: the page itself fetches the bundle and caches it on the way.
        }
    }));
    await cache.put(SHELL, response);
    if (paths.length === 0) return;
    for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/_expo/static/js/') && !paths.includes(path)) await cache.delete(request);
    }
}

function isPage(response) {
    return response.ok && (response.headers.get('content-type') || '').includes('text/html');
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // One missing file must not stop the rest from being cached.
        await Promise.all(PRECACHE.map((path) => cache.add(path).catch(() => undefined)));
        try {
            const shell = await fetch(SHELL, { cache: 'reload' });
            if (isPage(shell)) await storeShell(cache, shell);
        } catch {
            // Installed while offline: the next page load stores the shell.
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((name) => name.startsWith('tusankim-app-') && name !== CACHE)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

/** Network first, but a connection that does not answer in time does not hold the start up. */
async function answerNavigation(network) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(SHELL);
    if (!cached) return network;
    const timedOut = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
    try {
        return (await Promise.race([network, timedOut])) || cached;
    } catch {
        return cached;
    }
}

function handleNavigation(event) {
    // The copy for the cache is taken before the page can start reading the body.
    const fetched = fetch(event.request).then((response) => ({
        page: response,
        copy: isPage(response) ? response.clone() : null,
    }));
    // Keeps the worker alive until a fresh page is stored, also when the cached shell answered.
    event.waitUntil(fetched
        .then(async ({ copy }) => {
            if (copy) await storeShell(await caches.open(CACHE), copy);
        })
        .catch(() => undefined));
    event.respondWith(answerNavigation(fetched.then(({ page }) => page)));
}

async function handleHashedAsset(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

async function handleOther(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        handleNavigation(event);
    } else if (HASHED_PATHS.some((prefix) => url.pathname.startsWith(prefix))) {
        event.respondWith(handleHashedAsset(request));
    } else {
        event.respondWith(handleOther(request));
    }
});

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data || {};
    event.notification.close();
    if (data.kind !== STUDY_REMINDER_KIND) return;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = windows[0];
        if (client) {
            await client.focus();
            client.postMessage({ type: 'tusankim:study-reminder-open' });
            return;
        }
        await self.clients.openWindow('/decks');
    })());
});
