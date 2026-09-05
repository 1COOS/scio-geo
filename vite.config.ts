import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { minifiedJsonAssets } from './scripts/minified-json-assets.ts'

export default defineConfig({
  plugins: [
    react(),
    minifiedJsonAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/scio-geo.svg',
        'icons/scio-geo-192.png',
        'icons/scio-geo-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'Scio Geo · 探索我们的世界',
        short_name: 'Scio Geo',
        description: '面向青少年的互动式 3D 世界探索应用。',
        theme_color: '#071426',
        background_color: '#040b16',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        categories: ['education', 'games'],
        icons: [
          {
            src: '/icons/scio-geo-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/scio-geo-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/scio-geo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: process.env.GENERATE_SOURCEMAP === 'true',
    cssMinify: 'lightningcss',
    chunkSizeWarningLimit: 2_200,
  },
})
