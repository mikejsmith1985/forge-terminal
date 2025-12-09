import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages deployment configuration
// This config builds a standalone SPA for deployment to GitHub Pages
// Set VITE_API_BASE environment variable to configure backend URL
// Last updated: 2025-12-09 - v1.16.2 release
export default defineConfig({
  plugins: [react()],
  base: '/forge-terminal/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure public files are accessible
    assetsDir: 'assets',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8333',
      '/ws': { target: 'ws://localhost:8333', ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  }
})
