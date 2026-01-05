import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'components': path.resolve(__dirname, './components'),
      'services': path.resolve(__dirname, './services'),
      'views': path.resolve(__dirname, './views'),
      'types': path.resolve(__dirname, './types.ts'),
      'db': path.resolve(__dirname, './db')
    }
  },
  build: {
    outDir: 'dist',
  }
})