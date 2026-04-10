import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path for GitHub Pages project sites. Override with VITE_BASE for custom deployments.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(www\.)?googleapis\.com\//,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/accounts\.google\.com\//,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdnjs',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      manifest: {
        name: 'MarkFlow',
        short_name: 'MarkFlow',
        description: 'Markdown notes backed by Google Drive',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/lang-markdown',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/language',
            'codemirror'
          ],
          markdown: ['marked', 'highlight.js'],
          pdf: ['pdfjs-dist'],
          ocr: ['tesseract.js']
        }
      }
    }
  }
})
