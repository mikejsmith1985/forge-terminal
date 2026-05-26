/**
 * vaultEntryGrouping.js — grouping, filtering, and sorting helpers for Vault entries.
 */

const BUNDLE_TYPE_USERNAME = 'username'
const BUNDLE_TYPE_PASSWORD = 'password'

const SECRET_NAME_SUFFIX_PATTERN = /\s+—\s+(Username|Password)$/i

const parseDate = (value) => {
  if (!value) {
    return 0
  }
  const parsedValue = Date.parse(value)
  return Number.isNaN(parsedValue) ? 0 : parsedValue
}

const getMostRecentUsageTimestamp = (entry) =>
  Math.max(parseDate(entry.lastUsedAt), parseDate(entry.createdAt))

const normalizeSearchValue = (value) => (value || '').toString().toLowerCase()

const extractLegacyBundleInfo = (entry) => {
  const matchedSuffix = entry.secretName?.match(SECRET_NAME_SUFFIX_PATTERN)
  if (!matchedSuffix) {
    return null
  }

  const baseName = entry.secretName.replace(SECRET_NAME_SUFFIX_PATTERN, '').trim()
  const detectedRole = matchedSuffix[1].toLowerCase() === 'username'
    ? BUNDLE_TYPE_USERNAME
    : BUNDLE_TYPE_PASSWORD

  return {
    baseName,
    role: detectedRole,
    key: `legacy:${baseName.toLowerCase()}`,
  }
}

const getBundleDescriptor = (entry) => {
  if (entry.bundleId) {
    const fallbackInfo = extractLegacyBundleInfo(entry)
    return {
      key: `bundle:${entry.bundleId}`,
      role: entry.bundleType || fallbackInfo?.role || '',
      title: fallbackInfo?.baseName || entry.secretName || entry.envVarName,
    }
  }

  const legacyInfo = extractLegacyBundleInfo(entry)
  if (!legacyInfo) {
    return null
  }

  return {
    key: legacyInfo.key,
    role: legacyInfo.role,
    title: legacyInfo.baseName,
  }
}

const buildBundleSearchIndex = (bundle) => {
  const searchableFields = [
    bundle.title,
    bundle.url,
    ...bundle.entries.flatMap((entry) => [entry.secretName, entry.envVarName, entry.description]),
  ]

  return searchableFields
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(' ')
}

const buildSingleSearchIndex = (entry) =>
  [entry.secretName, entry.envVarName, entry.url, entry.description]
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(' ')

const compareItems = (firstItem, secondItem, sortMode) => {
  if (sortMode === 'alphabetical') {
    return firstItem.title.localeCompare(secondItem.title, undefined, { sensitivity: 'base' })
  }

  if (sortMode === 'recent') {
    return secondItem.latestCreatedAt - firstItem.latestCreatedAt
  }

  return secondItem.latestActivityAt - firstItem.latestActivityAt
}

export const buildVaultDisplayItems = (entries, searchTerm = '', sortMode = 'common') => {
  const bundleMap = new Map()
  const singleItems = []

  for (const entry of entries) {
    const bundleDescriptor = getBundleDescriptor(entry)
    if (!bundleDescriptor) {
      singleItems.push({
        type: 'single',
        key: entry.id,
        title: entry.secretName || entry.envVarName,
        url: entry.url || '',
        entry,
        latestActivityAt: getMostRecentUsageTimestamp(entry),
        latestCreatedAt: parseDate(entry.createdAt),
        searchIndex: buildSingleSearchIndex(entry),
      })
      continue
    }

    if (!bundleMap.has(bundleDescriptor.key)) {
      bundleMap.set(bundleDescriptor.key, {
        type: 'bundle',
        key: bundleDescriptor.key,
        title: bundleDescriptor.title,
        url: entry.url || '',
        usernameEntry: null,
        passwordEntry: null,
        entries: [],
      })
    }

    const bundle = bundleMap.get(bundleDescriptor.key)
    bundle.entries.push(entry)
    if (!bundle.url && entry.url) {
      bundle.url = entry.url
    }
    if (bundleDescriptor.role === BUNDLE_TYPE_USERNAME) {
      bundle.usernameEntry = entry
    } else if (bundleDescriptor.role === BUNDLE_TYPE_PASSWORD) {
      bundle.passwordEntry = entry
    }
  }

  const bundleItems = Array.from(bundleMap.values()).map((bundle) => {
    const latestActivityAt = bundle.entries.reduce(
      (currentLatest, currentEntry) => Math.max(currentLatest, getMostRecentUsageTimestamp(currentEntry)),
      0
    )
    const latestCreatedAt = bundle.entries.reduce(
      (currentLatest, currentEntry) => Math.max(currentLatest, parseDate(currentEntry.createdAt)),
      0
    )

    return {
      ...bundle,
      latestActivityAt,
      latestCreatedAt,
      searchIndex: buildBundleSearchIndex(bundle),
    }
  })

  const allItems = [...bundleItems, ...singleItems]
  const normalizedSearchTerm = normalizeSearchValue(searchTerm).trim()
  const filteredItems = normalizedSearchTerm
    ? allItems.filter((item) => item.searchIndex.includes(normalizedSearchTerm))
    : allItems

  return filteredItems.sort((firstItem, secondItem) => compareItems(firstItem, secondItem, sortMode))
}

