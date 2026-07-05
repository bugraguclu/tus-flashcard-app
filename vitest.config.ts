import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['lib/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            // react-native ships Flow syntax that vite cannot parse; lib tests
            // only need Platform, provided by the stub.
            'react-native': path.resolve(__dirname, 'test/react-native-stub.ts'),
        },
    },
});
