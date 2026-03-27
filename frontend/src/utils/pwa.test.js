import { readFileSync } from 'fs'
import { resolve } from 'path'

const manifestPath = resolve(__dirname, '../../public/manifest.json')

describe('PWA manifest.json', () => {
  let manifest

  beforeAll(() => {
    const raw = readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw)
  })

  it('is valid JSON', () => {
    expect(manifest).toBeDefined()
    expect(typeof manifest).toBe('object')
  })

  it('contains required fields: name, short_name, start_url, display, icons', () => {
    expect(manifest).toHaveProperty('name')
    expect(manifest).toHaveProperty('short_name')
    expect(manifest).toHaveProperty('start_url')
    expect(manifest).toHaveProperty('display')
    expect(manifest).toHaveProperty('icons')
  })

  it('has display set to "standalone"', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('icons array has entries with valid src paths', () => {
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
    for (const icon of manifest.icons) {
      expect(icon).toHaveProperty('src')
      expect(icon.src).toMatch(/^\/icon-\d+\.png$/)
      expect(icon).toHaveProperty('sizes')
      expect(icon).toHaveProperty('type')
      expect(icon.type).toBe('image/png')
    }
  })
})
