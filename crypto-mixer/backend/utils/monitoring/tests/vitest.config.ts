import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
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
      '@': resolve(__dirname, '../'),
      '@tests': resolve(__dirname, './')
    }
  },
  esbuild: {
    target: 'node18'
  }
});