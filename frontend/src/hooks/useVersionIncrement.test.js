import { describe, it, expect } from 'vitest';
import { useVersionIncrement } from './useVersionIncrement';

describe('useVersionIncrement', () => {
  const { 
    parseVersion, 
    formatVersion, 
    incrementMajor, 
    incrementMinor, 
    incrementFix 
  } = useVersionIncrement();

  it('should parse version string correctly', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, fix: 3 });
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, fix: 3 });
  });

  it('should format version with v prefix', () => {
    expect(formatVersion({ major: 1, minor: 2, fix: 3 })).toBe('v1.2.3');
  });

  it('should increment major version correctly', () => {
    expect(incrementMajor('v1.2.3')).toBe('v2.0.0');
    expect(incrementMajor('1.2.3')).toBe('v2.0.0');
  });

  it('should increment minor version correctly', () => {
    expect(incrementMinor('v1.2.3')).toBe('v1.3.0');
    expect(incrementMinor('1.2.3')).toBe('v1.3.0');
  });

  it('should increment fix version correctly', () => {
    expect(incrementFix('v1.2.3')).toBe('v1.2.4');
    expect(incrementFix('1.2.3')).toBe('v1.2.4');
  });
});
