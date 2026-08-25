import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['clara-logo-oficial.png', 'clara-logo-original.png', 'clara-marca-oficial.png', 'clara-icon-512.png', 'clara-personagem-mockup.png'],
      manifest: {
        name: 'Clara BPO Financeiro',
        short_name: 'Clara',
        description: 'BPO financeiro, conciliação, DRE, precificação e gestão multiempresa.',
        theme_color: '#082a66',
        background_color: '#f7f9fc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/clara-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' }
  }
})
