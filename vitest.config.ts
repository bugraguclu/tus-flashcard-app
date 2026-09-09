import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['lib/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: [
            // react-native ships Flow syntax that vite cannot parse; lib tests
            // only need Platform, provided by the stub.
            { find: 'react-native', replacement: path.resolve(__dirname, 'test/react-native-stub.ts') },
            // expo-asset drags in expo-modules-core, which reads native globals while it is being
            // imported; lib/webDb only needs it to locate the sql.js wasm binary.
            { find: 'expo-asset', replacement: path.resolve(__dirname, 'test/expo-asset-stub.ts') },
        ],
    },
});
