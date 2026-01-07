/**
 * Release Workflow Validation Test
 * 
 * Validates the GitHub Actions release workflow by checking:
 * 1. Workflow YAML syntax and structure
 * 2. Race condition prevention (sequential finalization)
 * 3. Proper job dependencies
 * 4. Draft → Published release flow
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const WORKFLOW_PATH = join(process.cwd(), '.github', 'workflows', 'release.yml');

test.describe('Release Workflow Structure', () => {
  let workflowConfig;

  test.beforeAll(() => {
    const workflowContent = readFileSync(WORKFLOW_PATH, 'utf8');
    workflowConfig = yaml.load(workflowContent);
  });

  test('should have valid YAML syntax', () => {
    expect(workflowConfig).toBeDefined();
    expect(workflowConfig.name).toBe('Release');
  });

  test('should trigger on tag push', () => {
    expect(workflowConfig.on.push.tags).toContain('v*');
  });

  test('should have fail-fast disabled to prevent cascading failures', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    expect(buildJob.strategy['fail-fast']).toBe(false);
  });

  test('should build on both Ubuntu and macOS', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const matrixOs = buildJob.strategy.matrix.include.map(m => m.os);
    expect(matrixOs).toContain('ubuntu-latest');
    expect(matrixOs).toContain('macos-latest');
  });

  test('should have separate finalize-release job', () => {
    expect(workflowConfig.jobs['finalize-release']).toBeDefined();
  });

  test('finalize-release should depend on build-and-release', () => {
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    expect(finalizeJob.needs).toBe('build-and-release');
  });

  test('build jobs should create draft releases only', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const uploadSteps = buildJob.steps.filter(s => 
      s.name?.includes('Upload') && s.uses?.includes('action-gh-release')
    );
    
    uploadSteps.forEach(step => {
      expect(step.with.draft).toBe(true);
      expect(step.with.make_latest || false).toBe(false);
    });
  });

  test('finalize job should publish and mark as latest', () => {
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    const publishStep = finalizeJob.steps.find(s => s.name === 'Publish Release');
    
    expect(publishStep).toBeDefined();
    expect(publishStep.with.draft).toBe(false);
    expect(publishStep.with.make_latest).toBe(true);
  });

  test('should have GITHUB_TOKEN set for all release actions', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    
    const releaseSteps = [
      ...buildJob.steps.filter(s => s.uses?.includes('action-gh-release')),
      ...finalizeJob.steps.filter(s => s.uses?.includes('action-gh-release'))
    ];

    releaseSteps.forEach(step => {
      expect(step.env?.GITHUB_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    });
  });

  test('should only finalize on tag push', () => {
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    expect(finalizeJob.if).toBe("startsWith(github.ref, 'refs/tags/')");
  });

  test('should have fail_on_unmatched_files for safety', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const uploadSteps = buildJob.steps.filter(s => 
      s.name?.includes('Upload') && s.uses?.includes('action-gh-release')
    );
    
    uploadSteps.forEach(step => {
      expect(step.with.fail_on_unmatched_files).toBe(true);
    });
  });
});

test.describe('Release Workflow Race Condition Prevention', () => {
  let workflowConfig;

  test.beforeAll(() => {
    const workflowContent = readFileSync(WORKFLOW_PATH, 'utf8');
    workflowConfig = yaml.load(workflowContent);
  });

  test('prevents parallel finalization by using sequential jobs', () => {
    // Key fix: Only ONE job (finalize-release) can publish/finalize
    const buildJob = workflowConfig.jobs['build-and-release'];
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    
    // Build jobs create drafts
    const buildUploadSteps = buildJob.steps.filter(s => 
      s.uses?.includes('action-gh-release')
    );
    buildUploadSteps.forEach(step => {
      expect(step.with.draft).toBe(true);
    });

    // Only finalize job publishes
    expect(finalizeJob.needs).toBe('build-and-release');
    const publishStep = finalizeJob.steps[0];
    expect(publishStep.with.draft).toBe(false);
  });

  test('ensures finalize job runs only after all builds complete', () => {
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    
    // "needs" ensures ALL matrix jobs complete before finalize runs
    expect(finalizeJob.needs).toBe('build-and-release');
  });

  test('validates that both jobs cannot finalize simultaneously', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const finalizeJob = workflowConfig.jobs['finalize-release'];
    
    // Count steps that can finalize (draft: false)
    const buildFinalizeSteps = buildJob.steps.filter(s => 
      s.uses?.includes('action-gh-release') && s.with?.draft === false
    );
    
    const finalizeFinalizeSteps = finalizeJob.steps.filter(s => 
      s.uses?.includes('action-gh-release') && s.with?.draft === false
    );

    // Build job should have ZERO finalize steps
    expect(buildFinalizeSteps.length).toBe(0);
    // Finalize job should have EXACTLY ONE finalize step
    expect(finalizeFinalizeSteps.length).toBe(1);
  });
});

test.describe('Release Workflow Asset Upload', () => {
  let workflowConfig;

  test.beforeAll(() => {
    const workflowContent = readFileSync(WORKFLOW_PATH, 'utf8');
    workflowConfig = yaml.load(workflowContent);
  });

  test('Ubuntu job uploads Linux and Windows binaries', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const ubuntuUpload = buildJob.steps.find(s => 
      s.name === 'Upload Linux/Windows Assets'
    );
    
    expect(ubuntuUpload).toBeDefined();
    expect(ubuntuUpload.with.files).toContain('bin/forge-linux-amd64');
    expect(ubuntuUpload.with.files).toContain('bin/forge-windows-amd64.exe');
  });

  test('macOS job uploads macOS binaries', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const macosUpload = buildJob.steps.find(s => 
      s.name === 'Upload macOS Assets'
    );
    
    expect(macosUpload).toBeDefined();
    expect(macosUpload.with.files).toContain('bin/forge-darwin-amd64');
    expect(macosUpload.with.files).toContain('bin/forge-darwin-arm64');
  });

  test('Ubuntu job generates release notes', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const ubuntuUpload = buildJob.steps.find(s => 
      s.name === 'Upload Linux/Windows Assets'
    );
    
    expect(ubuntuUpload.with.generate_release_notes).toBe(true);
  });

  test('macOS job does not regenerate release notes', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const macosUpload = buildJob.steps.find(s => 
      s.name === 'Upload macOS Assets'
    );
    
    // Should not have generate_release_notes set or should be false
    expect(macosUpload.with.generate_release_notes || false).toBe(false);
  });
});

test.describe('Release Workflow Robustness', () => {
  let workflowConfig;

  test.beforeAll(() => {
    const workflowContent = readFileSync(WORKFLOW_PATH, 'utf8');
    workflowConfig = yaml.load(workflowContent);
  });

  test('has contents:write permission', () => {
    expect(workflowConfig.permissions.contents).toBe('write');
  });

  test('supports manual workflow dispatch', () => {
    expect(workflowConfig.on.workflow_dispatch).toBeDefined();
  });

  test('builds with proper version injection', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const versionStep = buildJob.steps.find(s => s.id === 'get_version');
    
    expect(versionStep).toBeDefined();
    expect(versionStep.run).toContain('GITHUB_OUTPUT');
  });

  test('normalizes asset directory case for Go embed', () => {
    const buildJob = workflowConfig.jobs['build-and-release'];
    const normalizeStep = buildJob.steps.find(s => 
      s.name === 'Normalize asset directory case'
    );
    
    expect(normalizeStep).toBeDefined();
    expect(normalizeStep.run).toContain('mv Assets assets');
  });
});
