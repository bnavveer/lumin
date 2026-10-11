import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The chat and feedback APIs run in the Hono server (../src/main.ts, port 3000).
const api = process.env.API_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
})
