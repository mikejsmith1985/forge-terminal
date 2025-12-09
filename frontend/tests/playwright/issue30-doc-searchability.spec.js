/**
 * Issue #30 - Documentation Searchability Tests
 * 
 * Tests that documentation is discoverable and searchable
 * via CLI tools and organized structure
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, '../../..', 'docs/sessions');
const SCRIPTS_DIR = path.join(__dirname, '../../..', 'scripts');

test.describe('Issue #30 - Documentation Searchability', () => {
  
  test('INDEX.md exists and has proper structure', () => {
    const indexPath = path.join(DOCS_DIR, 'INDEX.md');
    expect(fs.existsSync(indexPath)).toBeTruthy();
    
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('# Session Documents Index');
    expect(content).toContain('By Topic');
    expect(content).toMatch(/###\s+\w/); // Topic sections
  });
  
  test('DECISION_LOG.md exists with content', () => {
    const logPath = path.join(DOCS_DIR, 'DECISION_LOG.md');
    expect(fs.existsSync(logPath)).toBeTruthy();
    
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('# Decision Log');
    expect(content.length).toBeGreaterThan(100);
  });
  
  test('TOPICS.md defines approved topics', () => {
    const topicsPath = path.join(DOCS_DIR, 'TOPICS.md');
    expect(fs.existsSync(topicsPath)).toBeTruthy();
    
    const content = fs.readFileSync(topicsPath, 'utf-8');
    expect(content).toContain('# Session Document Topics Taxonomy');
    expect(content).toMatch(/- \*\*\w+/); // Topic definitions
  });
  
  test('Session docs have frontmatter with topic and status', () => {
    const files = fs.readdirSync(DOCS_DIR)
      .filter(f => f.endsWith('.md') && !f.match(/^(INDEX|DECISION|TOPICS|MIGRATION|FRONTMATTER)/));
    
    let validCount = 0;
    files.forEach(file => {
      const filePath = path.join(DOCS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (content.startsWith('---') && content.includes('topic:') && content.includes('status:')) {
        validCount++;
      }
    });
    
    // At least 70% should have valid frontmatter
    expect(validCount).toBeGreaterThan(files.length * 0.7);
  });
  
  test('find-decision.sh script exists and is executable', () => {
    const scriptPath = path.join(SCRIPTS_DIR, 'find-decision.sh');
    expect(fs.existsSync(scriptPath)).toBeTruthy();
    
    const stats = fs.statSync(scriptPath);
    expect((stats.mode & 0o111) !== 0).toBeTruthy();
  });
  
  test('generate-decision-log.sh script exists', () => {
    const scriptPath = path.join(SCRIPTS_DIR, 'generate-decision-log.sh');
    expect(fs.existsSync(scriptPath)).toBeTruthy();
  });
  
  test('INDEX.md is organized by topic', () => {
    const indexPath = path.join(DOCS_DIR, 'INDEX.md');
    const content = fs.readFileSync(indexPath, 'utf-8');
    
    const topicSections = (content.match(/^###\s+\w/gm) || []);
    expect(topicSections.length).toBeGreaterThan(0);
  });
  
  test('Documentation is searchable', () => {
    // Verify INDEX contains links to session docs
    const indexPath = path.join(DOCS_DIR, 'INDEX.md');
    const content = fs.readFileSync(indexPath, 'utf-8');
    
    // Should have markdown links
    expect(content).toMatch(/\[[^\]]+\]\([^)]+\)/);
  });
});
