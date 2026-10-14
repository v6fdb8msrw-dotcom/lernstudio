import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Erzeugt die App-Icons (PWA, Apple Touch Icon, Favicon) aus public/logo.svg: npm run icons
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, favicons: [[48, 'favicon.ico']] },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#f4efe6' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#f4efe6' } },
  },
  images: ['public/logo.svg'],
})
