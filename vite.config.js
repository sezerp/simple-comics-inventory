import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/covers': 'http://localhost:3001',
      '/gallery': 'http://localhost:3001',
    },
  },
})
