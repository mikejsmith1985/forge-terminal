import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve paths relative to this config file (frontend/)
const configDir = dirname(fileURLToPath(import.meta.url))
const companionSourceDir = resolve(configDir, '../forge-companion')
const companionOutputDir = resolve(configDir, '../cmd/forge/web/companion')

/**
 * copyCompanionPlugin — copies the forge-companion/ PWA static files into the
 * Vite build output directory (cmd/forge/web/companion/) after each production
 * build. The Go binary already embeds all:web, so the companion automatically
 * ends up inside the binary and is served at /companion/ with no external
 * hosting required.
 *
 * README.md is intentionally skipped — only deployable assets are copied.
 */
function copyCompanionPlugin() {
  return {
    name: 'copy-companion-pwa',
    closeBundle() {
      mkdirSync(companionOutputDir, { recursive: true })
      const entries = readdirSync(companionSourceDir)
      let copiedCount = 0
      for (const entry of entries) {
        if (entry === 'README.md') continue
        copyFileSync(join(companionSourceDir, entry), join(companionOutputDir, entry))
        copiedCount++
      }
      console.log(`✓ Companion PWA copied to web/companion/ (${copiedCount} files)`)
    },
  }
}

export default defineConfig({
  plugins: [react(), copyCompanionPlugin()],
  base: '/',
  build: {
    outDir: '../cmd/forge/web',
    emptyOutDir: true,
    // minify: false, // TEMP: Disable minification to debug TDZ error - FIXED NOW, re-enabled
    rollupOptions: {
      output: {
        // Ensure assets go to lowercase 'assets/' directory for Go embed case-sensitivity
        assetFileNames: 'assets/[name].[hash][extname]',
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://localhost:3005',
      '/ws': { target: 'ws://localhost:3005', ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  }
})
