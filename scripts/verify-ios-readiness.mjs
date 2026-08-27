import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const sources = JSON.parse(fs.readFileSync(new URL('../docs/anki-reference-sources.json', import.meta.url), 'utf8'));
const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function plistHasBoolean(contents, key, expected) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const booleanTag = expected ? 'true' : 'false';
    return new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<${booleanTag}\\s*/>`).test(contents);
}

function verifyGeneratedNativeIos() {
    const iosRoot = path.join(projectRoot, 'ios');
    if (!fs.existsSync(iosRoot)) return;

    const appDirectories = fs.readdirSync(iosRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'Pods')
        .map((entry) => path.join(iosRoot, entry.name));
    const nativeAppDirectory = appDirectories.find((directory) => fs.existsSync(path.join(directory, 'Info.plist')));

    requireValue(Boolean(nativeAppDirectory), 'Generated ios project is missing the application Info.plist');
    if (!nativeAppDirectory) return;

    const infoPlist = fs.readFileSync(path.join(nativeAppDirectory, 'Info.plist'), 'utf8');
    requireValue(plistHasBoolean(infoPlist, 'NSAllowsArbitraryLoads', false), 'Generated iOS Info.plist must disable arbitrary network loads');
    requireValue(plistHasBoolean(infoPlist, 'NSAllowsLocalNetworking', false), 'Generated iOS Info.plist must disable local-network access');
    requireValue(plistHasBoolean(infoPlist, 'LSSupportsOpeningDocumentsInPlace', false), 'Generated iOS Info.plist must declare copied import handling');
    requireValue(infoPlist.includes('<string>com.tusankim.apkg</string>'), 'Generated iOS Info.plist is missing .apkg Files hand-off');
    requireValue(infoPlist.includes('<string>com.tusankim.colpkg</string>'), 'Generated iOS Info.plist is missing .colpkg Files hand-off');

    const entitlementFile = fs.readdirSync(nativeAppDirectory)
        .find((fileName) => fileName.endsWith('.entitlements'));
    requireValue(Boolean(entitlementFile), 'Generated iOS project is missing application entitlements');
    if (entitlementFile) {
        const entitlements = fs.readFileSync(path.join(nativeAppDirectory, entitlementFile), 'utf8');
        requireValue(
            entitlements.includes('<key>com.apple.developer.default-data-protection</key>')
                && entitlements.includes('<string>NSFileProtectionComplete</string>'),
            'Generated iOS entitlements must enable NSFileProtectionComplete',
        );
    }
}

requireValue(typeof app.ios?.bundleIdentifier === 'string' && app.ios.bundleIdentifier.length > 0, 'Missing iOS bundle identifier');
requireValue(typeof app.ios?.buildNumber === 'string' && app.ios.buildNumber.length > 0, 'Missing iOS build number');
requireValue(app.ios?.config?.usesNonExemptEncryption === false, 'Encryption export declaration must be explicit');
requireValue(app.ios?.privacyManifests?.NSPrivacyTracking === false, 'Privacy tracking declaration must be explicit');
requireValue(Array.isArray(app.platforms) && app.platforms.includes('ios') && !app.platforms.includes('android'), 'Only iOS may be a release platform');
requireValue(app.ios?.entitlements?.['com.apple.developer.default-data-protection'] === 'NSFileProtectionComplete', 'Complete iOS file protection is required');
requireValue(app.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false, 'Arbitrary network loads must stay disabled');
requireValue(app.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking === false, 'Local-network access must stay disabled');
requireValue(app.ios?.infoPlist?.LSSupportsOpeningDocumentsInPlace === false, 'Imported files must be copied instead of edited in place');
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

verifyGeneratedNativeIos();

if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

console.log('iOS configuration and Anki compatibility registry verified.');
