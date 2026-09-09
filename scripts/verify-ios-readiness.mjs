import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const sources = JSON.parse(fs.readFileSync(new URL('../docs/anki-reference-sources.json', import.meta.url), 'utf8'));
const failures = [];
const warnings = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const appStoreReleaseCheck = process.argv.includes('--app-store');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

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
    // A pinned Light trait leaves keyboards, form sheets and native scroll indicators white
    // while the app renders its dark palette, so the shipped plist must not carry one.
    requireValue(
        !/<key>\s*UIUserInterfaceStyle\s*<\/key>\s*<string>\s*Light\s*<\/string>/.test(infoPlist),
        'Generated iOS Info.plist must not force the Light interface style while dark mode ships',
    );
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

// The app ships a Light/Dark/System preference, and ThemeGate pushes the explicit choices to
// UIKit via Appearance.setColorScheme. That override is only honoured when the process itself
// is allowed to adopt a dark trait.
requireValue(app.userInterfaceStyle === 'automatic', 'Dark mode ships, so userInterfaceStyle must be "automatic"');

const plugins = app.plugins ?? [];
const pluginNames = plugins.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
for (const required of ['expo-router', 'expo-sqlite', 'expo-image-picker', 'expo-audio', 'expo-notifications', 'expo-splash-screen']) {
    requireValue(pluginNames.includes(required), `Missing required Expo plugin: ${required}`);
}

// The launch image is held until startup finishes, so it must come from the plugin (which also
// carries the dark variant) rather than the legacy top-level key.
requireValue(app.splash === undefined, 'Configure the splash screen through the expo-splash-screen plugin, not the legacy "splash" key');
const splashPlugin = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
requireValue(
    typeof splashPlugin?.[1]?.backgroundColor === 'string' && typeof splashPlugin?.[1]?.dark?.backgroundColor === 'string',
    'Splash screen needs both a light and a dark background colour',
);

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

const publicPagePaths = ['docs/index.html', 'docs/privacy.html', 'docs/support.html', 'docs/terms.html'];
for (const pagePath of publicPagePaths) {
    requireValue(fs.existsSync(path.join(projectRoot, pagePath)), `Missing App Store public page: ${pagePath}`);
}

const productionPaymentRequired = eas.build?.production?.env?.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED;
const previewPaymentRequired = eas.build?.preview?.env?.EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED;
requireValue(productionPaymentRequired === previewPaymentRequired, 'Preview and production catalog payment modes must match for release QA');

if (productionPaymentRequired === 'false') {
    const activeDeliveryText = [
        readProjectFile('docs/app-store/metadata-tr.md'),
        readProjectFile('docs/support.html'),
    ].join('\n');
    const paidClaims = [
        /tek ödeme/i,
        /tek seferlik satın alma/i,
        /satın almayı geri yükle/i,
        /Apple processes payments/i,
        /restore purchase/i,
    ];
    for (const pattern of paidClaims) {
        requireValue(!pattern.test(activeDeliveryText), `Payment-disabled release material still contains an active paid-flow claim: ${pattern}`);
    }
}

const legalPages = [readProjectFile('docs/privacy.html'), readProjectFile('docs/app-store/metadata-tr.md')].join('\n');
const legalPlaceholders = [
    /\[YAYINCI YASAL ADI\]/,
    /\[LEGAL PUBLISHER NAME\]/,
    /\[AÇIK ADRES\]/,
    /\[ADDRESS\]/,
    /\[E-POSTA\]/,
    /\[EMAIL\]/,
    /\[APP STORE CONNECT HESAP SAHİBİNİN YASAL ADI\]/,
];
const unresolvedLegalPlaceholders = legalPlaceholders.filter((pattern) => pattern.test(legalPages));
if (unresolvedLegalPlaceholders.length > 0) {
    const message = 'App Store legal identity still contains publisher/address/contact placeholders';
    if (appStoreReleaseCheck) failures.push(message);
    else warnings.push(`${message}; run npm run verify:app-store before submission`);
}

/**
 * The paid catalog must reach the store as the encrypted container, never as a readable .apkg.
 * A build that ships the plain package hands the whole product to anyone who unzips the IPA.
 */
function verifyCatalogAtRest() {
    const packedPath = path.join(projectRoot, 'assets/catalog/bka-tus-complete.tuspack');
    const masterPath = path.join(projectRoot, 'assets/catalog/bka-tus-complete.apkg');

    if (!fs.existsSync(packedPath)) {
        failures.push('Missing assets/catalog/bka-tus-complete.tuspack; run npm run pack:catalog');
        return;
    }

    const header = Buffer.alloc(8);
    const handle = fs.openSync(packedPath, 'r');
    try {
        fs.readSync(handle, header, 0, 8, 0);
    } finally {
        fs.closeSync(handle);
    }
    requireValue(header.toString('latin1') === 'TUSPACK1', 'Packed catalog is not a TUSPACK container; run npm run pack:catalog');

    // Only the container may be bundled: a second require would make Metro ship the plain
    // package alongside it, which is exactly what the container exists to prevent.
    const assetModule = readProjectFile('lib/bkaCatalogAsset.ts');
    requireValue(
        !/require\([^)]*\.apkg['"]\)/.test(assetModule),
        'lib/bkaCatalogAsset.ts must not require the plain .apkg; that bundles the readable catalog',
    );

    if (fs.existsSync(masterPath) && fs.statSync(masterPath).mtimeMs > fs.statSync(packedPath).mtimeMs) {
        failures.push('Catalog master .apkg is newer than the packed container; run npm run pack:catalog');
    }
}

verifyCatalogAtRest();
verifyGeneratedNativeIos();

if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

if (warnings.length) console.warn(warnings.map((warning) => `- ${warning}`).join('\n'));

console.log('iOS configuration and Anki compatibility registry verified.');
