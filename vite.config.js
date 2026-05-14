import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ossDevRelayPlugin from './vite-plugin-oss-dev-relay.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ossDevRelayPlugin()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
