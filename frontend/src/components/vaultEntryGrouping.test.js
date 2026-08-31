import { describe, expect, it } from 'vitest'
import { buildVaultDisplayItems } from './vaultEntryGrouping'

const createEntry = (overrides) => ({
  id: overrides.id,
  secretName: overrides.secretName || 'Example Secret',
  envVarName: overrides.envVarName || 'EXAMPLE_SECRET',
  description: overrides.description || '',
  shouldAutoInject: false,
  createdAt: overrides.createdAt || '2026-01-01T00:00:00Z',
  lastUsedAt: overrides.lastUsedAt || null,
  url: overrides.url || '',
  bundleId: overrides.bundleId || '',
  bundleType: overrides.bundleType || '',
})

describe('buildVaultDisplayItems', () => {
  it('groups username and password entries into one bundle using bundleId', () => {
    const items = buildVaultDisplayItems([
      createEntry({
        id: 'user-1',
        secretName: 'Service Account — Username',
        envVarName: 'SERVICE_ACCOUNT_USERNAME',
        bundleId: 'service-account',
        bundleType: 'username',
      }),
      createEntry({
        id: 'pass-1',
        secretName: 'Service Account — Password',
        envVarName: 'SERVICE_ACCOUNT_PASSWORD',
        bundleId: 'service-account',
        bundleType: 'password',
      }),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('bundle')
    expect(items[0].usernameEntry?.id).toBe('user-1')
    expect(items[0].passwordEntry?.id).toBe('pass-1')
  })

  it('groups legacy username/password names even without bundle metadata', () => {
    const items = buildVaultDisplayItems([
      createEntry({
        id: 'legacy-user',
        secretName: 'GitHub Account — Username',
        envVarName: 'GITHUB_ACCOUNT_USERNAME',
      }),
      createEntry({
        id: 'legacy-pass',
        secretName: 'GitHub Account — Password',
        envVarName: 'GITHUB_ACCOUNT_PASSWORD',
      }),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('bundle')
    expect(items[0].title).toBe('GitHub Account')
  })

  it('supports alphabetical ordering', () => {
    const items = buildVaultDisplayItems(
      [
        createEntry({ id: '2', secretName: 'Zulu Secret', envVarName: 'ZULU' }),
        createEntry({ id: '1', secretName: 'Alpha Secret', envVarName: 'ALPHA' }),
      ],
      '',
      'alphabetical'
    )

    expect(items[0].title).toBe('Alpha Secret')
    expect(items[1].title).toBe('Zulu Secret')
  })

  it('supports common ordering by latest usage', () => {
    const items = buildVaultDisplayItems(
      [
        createEntry({
          id: 'old',
          secretName: 'Old Secret',
          envVarName: 'OLD_SECRET',
          lastUsedAt: '2026-01-01T00:00:00Z',
        }),
        createEntry({
          id: 'new',
          secretName: 'New Secret',
          envVarName: 'NEW_SECRET',
          lastUsedAt: '2026-05-01T00:00:00Z',
        }),
      ],
      '',
      'common'
    )

    expect(items[0].title).toBe('New Secret')
  })

  it('filters by search term across URL and env var name', () => {
    const items = buildVaultDisplayItems(
      [
        createEntry({
          id: 'jira-secret',
          secretName: 'Jira Service Token',
          envVarName: 'JIRA_TOKEN',
          url: 'https://jira.example.com',
        }),
        createEntry({
          id: 'github-secret',
          secretName: 'GitHub Token',
          envVarName: 'GITHUB_TOKEN',
          url: 'https://github.com',
        }),
      ],
      'jira.example.com',
      'common'
    )

    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Jira Service Token')
  })
})

