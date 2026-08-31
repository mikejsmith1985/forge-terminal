// Tests for the one-and-only tab label producer (tab naming rebuild).
// Locks: project-root resolution, depth-stability, FR-007 immediate-folder
// fallback, control-character stripping, and #N de-duplication.
import { describe, it, expect } from 'vitest'

import { computeTabLabel, dedupeLabel, resolveProjectRoot, shouldRelabelForDirectory } from './tabLabel'

describe('computeTabLabel', () => {
  it('returns the project root (first child of a known projects folder)', () => {
    expect(computeTabLabel('C:\\ProjectsWin\\forge-terminal\\frontend\\src')).toBe('forge-terminal')
    expect(computeTabLabel('C:/ProjectsWin/forge-terminal')).toBe('forge-terminal')
  })

  it('stays the same no matter how deep the path goes (the core bug)', () => {
    const shallow = computeTabLabel('C:/ProjectsWin/forge-terminal')
    const deep = computeTabLabel('C:/ProjectsWin/forge-terminal/a/b/c/d/e/f/g')
    expect(deep).toBe('forge-terminal')
    expect(deep).toBe(shallow)
  })

  it('strips a trailing file-like segment so a file path yields its folder', () => {
    expect(computeTabLabel('C:/ProjectsWin/forge-terminal/README.md')).toBe('forge-terminal')
  })

  it('falls back to the immediate folder name when not under a known projects root (FR-007)', () => {
    expect(computeTabLabel('/home/user/scratch/deep/here')).toBe('here')
  })

  it('never returns control characters or escape fragments (FR-005)', () => {
    const label = computeTabLabel('C:/ProjectsWin/for\x07ge\x1b-terminal')
    expect(label).toBe('forge-terminal')
    expect(/[\x00-\x1f\x7f]/.test(label)).toBe(false)
  })

  it('falls back to Terminal when there is no usable path', () => {
    expect(computeTabLabel('')).toBe('Terminal')
    expect(computeTabLabel(undefined)).toBe('Terminal')
    expect(computeTabLabel('/')).toBe('Terminal')
  })
})

describe('resolveProjectRoot', () => {
  it('returns the project root only when under a known projects container', () => {
    expect(resolveProjectRoot('C:/ProjectsWin/forge-terminal/a/b')).toBe('forge-terminal')
    expect(resolveProjectRoot('C:\\ProjectsWin\\AzureWorkflow\\AzureWorkflowPOC')).toBe('AzureWorkflow')
  })

  it('returns null when the path is not under a known projects container', () => {
    expect(resolveProjectRoot('C:/Temp/scratch')).toBe(null)
    expect(resolveProjectRoot('/home/user/notes')).toBe(null)
    expect(resolveProjectRoot('')).toBe(null)
    expect(resolveProjectRoot(undefined)).toBe(null)
  })
})

describe('shouldRelabelForDirectory', () => {
  it('relabels when the shell moves to a different project root', () => {
    expect(
      shouldRelabelForDirectory('C:/ProjectsWin/AzureWorkflow/AzureWorkflowPOC', 'C:/ProjectsWin/forge-terminal')
    ).toBe('forge-terminal')
  })

  it('does NOT relabel during deep navigation within the same project (no drift)', () => {
    expect(
      shouldRelabelForDirectory('C:/ProjectsWin/forge-terminal', 'C:/ProjectsWin/forge-terminal/internal/commands')
    ).toBe(null)
  })

  it('does NOT relabel on a detour into a temp or non-project directory', () => {
    expect(shouldRelabelForDirectory('C:/ProjectsWin/forge-terminal', 'C:/Temp/scratch')).toBe(null)
  })

  it('relabels when moving from a non-project directory into a real project', () => {
    expect(shouldRelabelForDirectory('C:/Temp/scratch', 'C:/ProjectsWin/forge-terminal')).toBe('forge-terminal')
  })
})

describe('dedupeLabel', () => {
  it('leaves the first label unsuffixed', () => {
    expect(dedupeLabel('forge-terminal', [])).toBe('forge-terminal')
  })

  it('appends #2, #3 for duplicates', () => {
    expect(dedupeLabel('forge-terminal', ['forge-terminal'])).toBe('forge-terminal #2')
    expect(dedupeLabel('forge-terminal', ['forge-terminal', 'forge-terminal #2'])).toBe('forge-terminal #3')
  })

  it('reuses the lowest free suffix', () => {
    expect(dedupeLabel('forge-terminal', ['forge-terminal', 'forge-terminal #3'])).toBe('forge-terminal #2')
  })
})
