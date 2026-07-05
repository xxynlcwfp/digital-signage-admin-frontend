import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import ossDevRelayPlugin from './vite-plugin-oss-dev-relay.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react(), ossDevRelayPlugin()],
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
