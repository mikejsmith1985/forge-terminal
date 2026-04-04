/**
 * useVersionIncrement Hook
 * Manages semantic version increments (Major.Minor.Fix)
 */

export function useVersionIncrement() {
  /**
   * Parse version string into components
   * @param {string} version - Version string like "1.23.10"
   * @returns {object} - { major, minor, fix }
   */
  const parseVersion = (version) => {
    const parts = version.replace(/^v/, '').split('.');
    return {
      major: parseInt(parts[0]) || 0,
      minor: parseInt(parts[1]) || 0,
      fix: parseInt(parts[2]) || 0,
    };
  };

  /**
   * Format version components back to string
   * @param {object} version - { major, minor, fix }
   * @returns {string} - Version string like "1.23.10"
   */
  const formatVersion = (version) => {
    return `v${version.major}.${version.minor}.${version.fix}`;
  };

  /**
   * Increment major version (e.g., 1.23.10 -> 2.0.0)
   * @param {string} currentVersion
   * @returns {string} - New version
   */
  const incrementMajor = (currentVersion) => {
    const parsed = parseVersion(currentVersion);
    return formatVersion({
      major: parsed.major + 1,
      minor: 0,
      fix: 0,
    });
  };

  /**
   * Increment minor version (e.g., 1.23.10 -> 1.24.0)
   * @param {string} currentVersion
   * @returns {string} - New version
   */
  const incrementMinor = (currentVersion) => {
    const parsed = parseVersion(currentVersion);
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor + 1,
      fix: 0,
    });
  };

  /**
   * Increment patch/fix version (e.g., 1.23.10 -> 1.23.11)
   * @param {string} currentVersion
   * @returns {string} - New version
   */
  const incrementFix = (currentVersion) => {
    const parsed = parseVersion(currentVersion);
    return formatVersion({
      major: parsed.major,
      minor: parsed.minor,
      fix: parsed.fix + 1,
    });
  };

  /**
   * Get release type description
   * @param {string} from - Starting version
   * @param {string} to - Ending version
   * @returns {string} - Release type description
   */
  const getReleaseType = (from, to) => {
    const fromParsed = parseVersion(from);
    const toParsed = parseVersion(to);

    if (toParsed.major > fromParsed.major) return 'MAJOR (Breaking Changes)';
    if (toParsed.minor > fromParsed.minor) return 'MINOR (New Features)';
    if (toParsed.fix > fromParsed.fix) return 'PATCH (Bug Fix)';
    return 'SAME';
  };

  /**
   * Generate release notes template
   * @param {string} version - Release version
   * @param {string} type - Release type
   * @returns {string} - Release notes template
   */
  const generateReleaseTemplate = (version, type) => {
    const date = new Date().toISOString().split('T')[0];
    return `# Release v${version}

**Release Date:** ${date}
**Type:** ${type}
**Priority:** P0

## Overview
[Add overview of release]

## What's New
[Add features and changes]

## Bug Fixes
[Add bug fixes]

## Testing
- ✅ [Add test results]

## Documentation
- ✅ [Add documentation updates]

## Installation
\`\`\`bash
git pull origin main
git checkout v${version}
make build
./bin/forge
\`\`\`

## Contributors
[Add contributors]
`;
  };

  return {
    parseVersion,
    formatVersion,
    incrementMajor,
    incrementMinor,
    incrementFix,
    getReleaseType,
    generateReleaseTemplate,
  };
}
