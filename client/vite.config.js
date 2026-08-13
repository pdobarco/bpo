import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Claria BPO',
        short_name: 'Claria',
        description: 'Gestão financeira simples para BPO e pequenas empresas',
        theme_color: '#153B52',
        background_color: '#F6F9FB',
        display: 'standalone',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } }
})
