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

module.exports = config;
