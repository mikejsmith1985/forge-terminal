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
 * Icons (icon-192.png, icon-512.png) are also copied from the Vite public/
 * output into companion/ so the PWA manifest can reference them relative to
 * the /companion/ URL prefix without a 404.
 *
 * README.md is intentionally skipped — only deployable assets are copied.
 */
function copyCompanionPlugin() {
  return {
    name: 'copy-companion-pwa',
    closeBundle() {
      mkdirSync(companionOutputDir, { recursive: true })

      // Copy all source files from forge-companion/ (excluding README.md)
      const entries = readdirSync(companionSourceDir)
      let copiedCount = 0
      for (const entry of entries) {
        if (entry === 'README.md') continue
        copyFileSync(join(companionSourceDir, entry), join(companionOutputDir, entry))
        copiedCount++
      }

      // Copy PWA icons from the root web output so they are reachable at
      // /companion/icon-192.png and /companion/icon-512.png as the manifest
      // expects (relative paths resolve against the PWA start_url).
      const iconFiles = ['icon-192.png', 'icon-512.png']
      const webOutputDir = resolve(configDir, '../cmd/forge/web')
      for (const iconFile of iconFiles) {
        const sourcePath = join(webOutputDir, iconFile)
        const destPath = join(companionOutputDir, iconFile)
        try {
          copyFileSync(sourcePath, destPath)
          copiedCount++
        } catch {
          console.warn(`⚠ Could not copy ${iconFile} to companion dir — icon may be missing`)
        }
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
