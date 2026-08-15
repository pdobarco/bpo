import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'logo-mark.svg'],
      manifest: {
        name: 'Claria — gestão simples',
        short_name: 'Claria',
        description: 'Gestão financeira simples, conciliação e DRE.',
        theme_color: '#0f2847',
        background_color: '#f7f9fc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' }
  }
})
