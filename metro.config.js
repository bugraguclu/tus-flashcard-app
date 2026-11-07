const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// The production catalog ships as one integrity-checked Anki package. Keeping the
// collection and its media together prevents Metro from renaming individual media files.
if (!config.resolver.assetExts.includes('apkg')) {
  config.resolver.assetExts.push('apkg');
}

// Release builds ship the paid catalog wrapped by scripts/pack-catalog-asset.ts, so the
// bundled bytes are not a usable Anki package on their own. See lib/catalogPack.ts.
if (!config.resolver.assetExts.includes('tuspack')) {
  config.resolver.assetExts.push('tuspack');
}

// Agent worktrees of this repository live under `.claude/worktrees`, each with its own
// node_modules. Metro must neither watch nor resolve into them: a node_modules swap inside one
// crashed this checkout's file watcher and took the dev server down. The pattern starts at this
// checkout's own root, so a worktree, which itself sits under `.claude/worktrees`, still bundles
// its own files while skipping any worktree nested inside it.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORKTREES = new RegExp(`^${escapeRegExp(__dirname)}[\\\\/](?:.*[\\\\/])?\\.claude[\\\\/]worktrees[\\\\/].*`);
// The local code graph (docs/CODE_GRAPH.md) is not app code, and every refresh rewrites a 9 MB
// graph.json under graphify-out/, so the watcher skips it too.
const CODE_GRAPH = new RegExp(`^${escapeRegExp(__dirname)}[\\\\/]graphify-out[\\\\/].*`);
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
    ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
    WORKTREES,
    CODE_GRAPH,
];

const emptyModule = require.resolve('metro-runtime/src/modules/empty-module.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'node:fs': emptyModule,
  'fs': emptyModule,
  'node:crypto': emptyModule,
  'crypto': emptyModule,
  'node:path': emptyModule,
  'path': emptyModule,
  'node:stream': emptyModule,
  'stream': emptyModule,
  'node:buffer': emptyModule,
  'buffer': emptyModule,
};

// Native-only packages that have no web build get a browser implementation of the same
// contract, so screens import one module on every platform instead of branching themselves.
const WEB_MODULE_OVERRIDES = {
  // Renders nothing on web; the replacement draws the browser's own date/time controls.
  '@react-native-community/datetimepicker': path.resolve(__dirname, 'components/WebDateTimePicker.tsx'),
};

// react-native-gesture-handler loads Reanimated whenever it can resolve it, and it can: Reanimated
// is installed as a peer of expo-router's react-native-drawer-layout. The app has no Reanimated
// code, and on web its import-time setup calls requestAnimationFrame, which crashed the dev
// server's Node-side render. Gesture-handler gets an empty module and runs without Reanimated.
const GESTURE_HANDLER_DIR = `${path.sep}node_modules${path.sep}react-native-gesture-handler${path.sep}`;

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && Object.prototype.hasOwnProperty.call(WEB_MODULE_OVERRIDES, moduleName)) {
    return { type: 'sourceFile', filePath: WEB_MODULE_OVERRIDES[moduleName] };
  }
  if (moduleName === 'react-native-reanimated' && context.originModulePath.includes(GESTURE_HANDLER_DIR)) {
    return { type: 'sourceFile', filePath: emptyModule };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
