import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Современная конфигурация Vite для CryptoMixer фронтенда
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полная конфигурация с:
 * - Быстрая компиляция через SWC
 * - PWA поддержка для мобильных устройств
 * - Оптимизация бандла для продакшн
 * - Горячая перезагрузка для разработки
 * - Proxy для API запросов
 */
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  const isProd = mode === 'production';

  return {
    plugins: [
      react({
        // Использование SWC для более быстрой компиляции
        jsxImportSource: '@emotion/react',
        babel: {
          plugins: [
            '@emotion/babel-plugin',
          ],
        },
      }),
      
      // PWA конфигурация для мобильных устройств
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 3000000,
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'CryptoMixer - Анонимный сервис микширования',
          short_name: 'CryptoMixer',
          description: 'Профессиональный сервис для анонимного микширования криптовалют',
          theme_color: '#7C3AED',
          background_color: '#0F0F23',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],

    // Настройки разработки
    server: {
      port: 3000,
      host: true,
      hmr: {
        overlay: true,
      },
      proxy: {
        // Прокси для API запросов к бэкенду
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Отправка запроса:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Получен ответ:', proxyRes.statusCode, req.url);
            });
          },
        }
      }
    },

    // Настройки сборки
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: !isProd,
      minify: isProd ? 'esbuild' : false,
      
      // Разделение бандла для оптимизации загрузки
      rollupOptions: {
        output: {
          manualChunks: {
            // Material-UI в отдельный чанк
            'mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
            // React библиотеки
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            // Криптографические библиотеки
            'crypto-libs': ['bitcoinjs-lib', 'ethers', 'web3', '@solana/web3.js'],
            // Утилиты
            'utils': ['axios', 'framer-motion', 'zustand'],
          },
        },
      },
      
      // Настройки производительности
      chunkSizeWarningLimit: 1000,
      
      // Оптимизация ассетов
      cssCodeSplit: true,
      
      // Настройки для старых браузеров
      target: ['es2020', 'chrome80', 'firefox80', 'safari14'],
    },

    // Псевдонимы путей для удобства импорта
    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@services': '/src/services',
        '@utils': '/src/utils',
        '@config': '/src/config',
        '@theme': '/src/theme',
      },
    },

    // Настройки CSS
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/theme/variables.scss";`,
        },
      },
    },

    // Переменные окружения
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    // Настройки для оптимизации зависимостей
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled',
        'framer-motion',
      ],
      exclude: ['@vite/client', '@vite/env'],
    },

    // Настройки для предварительной загрузки
    preview: {
      port: 4173,
      host: true,
    },

    // Логирование
    logLevel: isDev ? 'info' : 'warn',
    
    // Очистка консоли при перезапуске
    clearScreen: false,
  };
});