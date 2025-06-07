"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000, // 30 секунд для интеграционных тестов
        hookTimeout: 10000, // 10 секунд для setup/teardown
        setupFiles: ['./test-setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'dist/**',
                '**/*.d.ts',
                '**/*.config.ts',
                '**/test-setup.ts',
                '**/examples/**'
            ],
            thresholds: {
                statements: 80,
                branches: 70,
                functions: 80,
                lines: 80
            }
        },
        include: [
            '**/*.test.{ts,js}',
            '**/*.spec.{ts,js}'
        ],
        exclude: [
            'node_modules/**',
            'dist/**',
            'examples/**'
        ]
    },
    resolve: {
        alias: {
            '@': (0, path_1.resolve)(__dirname, '../'),
            '@tests': (0, path_1.resolve)(__dirname, './')
        }
    },
    esbuild: {
        target: 'node18'
    }
});
//# sourceMappingURL=vitest.config.js.map