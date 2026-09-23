/**
 * Minimal expo-asset replacement for vitest (node). The real package pulls in
 * expo-modules-core, which reads native globals at import time and throws under
 * plain node. Only lib/webDb touches Asset — to locate the sql.js wasm binary —
 * and the tests that reach that module supply their own wasm path, so an
 * unresolved asset is enough. Wired up via the resolve.alias entry in
 * vitest.config.ts.
 */

export const Asset = {
    fromModule(module: unknown) {
        return {
            uri: typeof module === 'string' ? module : '',
            localUri: null as string | null,
            downloadAsync: async () => ({ uri: '', localUri: null as string | null }),
        };
    },
};
