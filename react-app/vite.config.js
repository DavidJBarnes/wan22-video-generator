import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['3090.zero', 'localhost'],
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:9090',
        changeOrigin: true,
      }
    }
  }
})
