/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devVault } from './tools/dev-vault.ts'

// Für GitHub Pages läuft die App unter /<repository>/. Der Workflow setzt VITE_BASE entsprechend.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    ...(process.env.VITE_DEV_VAULT ? [devVault(process.env.VITE_DEV_VAULT)] : []),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: base,
        name: 'Lernstudio',
        short_name: 'Lernstudio',
        description: 'Persönliches Studien-Notizbuch: Fächer und Ablageordner, Notizen mit Bildern, Dateien, Kernbegriffe und Suche. Daten bleiben lokal auf dem Gerät.',
        lang: 'de',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3eee3',
        theme_color: '#f3eee3',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: '127.0.0.1', port: 5174 },
  preview: { host: '127.0.0.1', port: 4174 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
