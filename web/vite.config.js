import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
  },
})
