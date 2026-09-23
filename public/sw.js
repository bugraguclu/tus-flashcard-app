/*
 * TusAnkiM service worker.
 *
 * The iPhone app starts without a network because it is installed; this worker gives the
 * installed web app the same property. Pages are fetched network-first, so a new release is
 * picked up as soon as it is online, and fall back to the last copy when offline. The JavaScript
 * bundle and assets carry a content hash in their names, so a cached copy can never be stale and
 * is served cache-first. The learner's collection is not here — it lives in IndexedDB.
 *
 * It also answers clicks on study reminders, which the page shows through this worker.
 */

const CACHE = 'tusankim-app-v1';
const HASHED_PATHS = ['/_expo/static/', '/assets/'];
const APP_SHELL = ['/', '/decks', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const STUDY_REMINDER_KIND = 'tusankim.study-reminder';

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // One missing file must not stop the rest from being cached.
        await Promise.all(APP_SHELL.map((path) => cache.add(path).catch(() => undefined)));
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

/** Drop cached bundles the page just served no longer references, so releases do not pile up. */
async function pruneBundles(cache, html) {
    const referenced = new Set(html.match(/\/_expo\/static\/[^"'\s)]+/g) || []);
    if (referenced.size === 0) return;
    for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/_expo/static/js/') && !referenced.has(path)) await cache.delete(request);
    }
}

async function handleNavigation(request) {
    const url = new URL(request.url);
    // Query strings (a deck name, a search) never change the static page, so one copy per path.
    const key = url.origin + url.pathname;
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            await cache.put(key, response.clone());
            response.clone().text().then((html) => pruneBundles(cache, html)).catch(() => undefined);
        }
        return response;
    } catch (error) {
        const cached = (await cache.match(key)) || (await cache.match(url.origin + '/'));
        if (cached) return cached;
        throw error;
    }
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
        event.respondWith(handleNavigation(request));
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
