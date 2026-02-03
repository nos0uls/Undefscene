import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    server: {
      // Force IPv4 loopback.
      // On some Windows setups, Vite binds to IPv6 (::1) for `localhost`.
      // Then Electron fails to load http://127.0.0.1:5173 with ERR_CONNECTION_REFUSED.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
