import fs from 'node:fs';

const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const sources = JSON.parse(fs.readFileSync(new URL('../docs/anki-reference-sources.json', import.meta.url), 'utf8'));
const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };

requireValue(typeof app.ios?.bundleIdentifier === 'string' && app.ios.bundleIdentifier.length > 0, 'Missing iOS bundle identifier');
requireValue(typeof app.ios?.buildNumber === 'string' && app.ios.buildNumber.length > 0, 'Missing iOS build number');
requireValue(app.ios?.config?.usesNonExemptEncryption === false, 'Encryption export declaration must be explicit');
requireValue(app.ios?.privacyManifests?.NSPrivacyTracking === false, 'Privacy tracking declaration must be explicit');
requireValue(Array.isArray(app.platforms) && app.platforms.includes('ios') && !app.platforms.includes('android'), 'Only iOS may be a release platform');
requireValue(app.ios?.entitlements?.['com.apple.developer.default-data-protection'] === 'NSFileProtectionComplete', 'Complete iOS file protection is required');
requireValue(app.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false, 'Arbitrary network loads must stay disabled');
requireValue(app.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking === false, 'Local-network access must stay disabled');
requireValue(app.ios?.infoPlist?.NSUserActivityTypes?.includes('com.tusankim.deck-shortcut'), 'Deck Shortcuts user activity is missing');

const plugins = app.plugins ?? [];
const pluginNames = plugins.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
for (const required of ['expo-router', 'expo-sqlite', 'expo-image-picker', 'expo-audio', 'expo-notifications']) {
    requireValue(pluginNames.includes(required), `Missing required Expo plugin: ${required}`);
}

const documentTypes = app.ios?.infoPlist?.CFBundleDocumentTypes ?? [];
const declaredTypes = new Set(documentTypes.flatMap((entry) => entry.LSItemContentTypes ?? []));
requireValue(declaredTypes.has('com.tusankim.apkg'), 'iOS Files hand-off is missing .apkg');
requireValue(declaredTypes.has('com.tusankim.colpkg'), 'iOS Files hand-off is missing .colpkg');
requireValue(documentTypes.every((entry) => entry.CFBundleTypeRole === 'Viewer'), 'Imported iOS files must use the Viewer role');

requireValue(sources.schemaVersion === 1, 'Unsupported Anki source-registry version');
requireValue(Array.isArray(sources.sources) && sources.sources.length >= 4, 'Anki source registry is incomplete');
for (const source of sources.sources ?? []) {
    requireValue(/^https:\/\//.test(source.url ?? ''), `Invalid source URL: ${source.id ?? 'unknown'}`);
}
for (const doc of sources.requiredDocs ?? []) {
    requireValue(fs.existsSync(new URL(`../${doc}`, import.meta.url)), `Missing required compatibility document: ${doc}`);
}

if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

console.log('iOS configuration and Anki compatibility registry verified.');
