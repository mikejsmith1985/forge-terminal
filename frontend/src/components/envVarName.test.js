// envVarName.test.js — unit tests for vault variable naming rules.
//
// These must stay in lockstep with internal/vault/envvarname_test.go: the form
// warns about exactly the names the backend has to rewrite.
import { describe, it, expect } from 'vitest'
import { isPosixEnvVarName, deriveEnvVarName, describeEnvVarNameAdvisory } from './envVarName'

describe('isPosixEnvVarName', () => {
  it('accepts plain identifiers', () => {
    expect(isPosixEnvVarName('RESEND_API_KEY')).toBe(true)
    expect(isPosixEnvVarName('_LEADING_UNDERSCORE')).toBe(true)
    expect(isPosixEnvVarName('MIXED_case_123')).toBe(true)
  })

  it('rejects names no POSIX shell can export', () => {
    expect(isPosixEnvVarName('RESEND-API-KEY')).toBe(false)
    expect(isPosixEnvVarName('HAS SPACE')).toBe(false)
    expect(isPosixEnvVarName('HAS.DOT')).toBe(false)
    expect(isPosixEnvVarName('1LEADING_DIGIT')).toBe(false)
    expect(isPosixEnvVarName('')).toBe(false)
  })
})

describe('deriveEnvVarName', () => {
  it('converts human names to identifiers', () => {
    expect(deriveEnvVarName('OpenAI API Key')).toBe('OPENAI_API_KEY')
    expect(deriveEnvVarName('RESEND-API-KEY')).toBe('RESEND_API_KEY')
    expect(deriveEnvVarName('smithbros-claude-api-key')).toBe('SMITHBROS_CLAUDE_API_KEY')
    expect(deriveEnvVarName('DBAI-TestBot')).toBe('DBAI_TESTBOT')
  })

  it('prefixes a leading digit instead of producing an invalid name', () => {
    expect(deriveEnvVarName('1Password Token')).toBe('_1PASSWORD_TOKEN')
  })

  it('returns empty when nothing is usable', () => {
    expect(deriveEnvVarName('---')).toBe('')
    expect(deriveEnvVarName('')).toBe('')
  })

  it('always produces a valid POSIX name when it produces anything', () => {
    const sampleNames = ['OpenAI API Key', 'RESEND-API-KEY', '1Password Token', 'a.b.c']
    sampleNames.forEach((sampleName) => {
      const derivedName = deriveEnvVarName(sampleName)
      expect(isPosixEnvVarName(derivedName)).toBe(true)
    })
  })
})

describe('describeEnvVarNameAdvisory', () => {
  it('stays silent for valid names', () => {
    expect(describeEnvVarNameAdvisory('RESEND_API_KEY')).toBeNull()
    expect(describeEnvVarNameAdvisory('')).toBeNull()
  })

  it('suggests the underscore form for a hyphenated name', () => {
    const advisory = describeEnvVarNameAdvisory('RESEND-API-KEY')
    expect(advisory.suggestedName).toBe('RESEND_API_KEY')
    expect(advisory.message).toContain('POSIX')
  })

  it('reports a name with nothing salvageable', () => {
    const advisory = describeEnvVarNameAdvisory('---')
    expect(advisory.suggestedName).toBe('')
    expect(advisory.message).toContain('no usable characters')
  })
})
