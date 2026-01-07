#!/usr/bin/env node

/**
 * Release Workflow Validation Script
 * Validates the fixed workflow prevents race conditions
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(process.cwd(), '.github', 'workflows', 'release.yml');

console.log('🔍 Validating Release Workflow...\n');

const config = yaml.load(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

const tests = [
  {
    name: 'YAML syntax is valid',
    test: () => config && config.name === 'Release',
  },
  {
    name: 'Cleanup job exists for re-releasing',
    test: () => !!config.jobs['cleanup-existing-release'],
  },
  {
    name: 'Cleanup job runs before builds',
    test: () => config.jobs['build-and-release'].needs === 'cleanup-existing-release',
  },
  {
    name: 'Cleanup uses continue-on-error for safety',
    test: () => {
      const cleanupJob = config.jobs['cleanup-existing-release'];
      const deleteStep = cleanupJob.steps.find(s => s.name?.includes('Delete existing'));
      return deleteStep && deleteStep['continue-on-error'] === true;
    },
  },
  {
    name: 'fail-fast is disabled to prevent cascading failures',
    test: () => config.jobs['build-and-release'].strategy['fail-fast'] === false,
  },
  {
    name: 'Separate finalize-release job exists',
    test: () => !!config.jobs['finalize-release'],
  },
  {
    name: 'finalize-release depends on build-and-release',
    test: () => config.jobs['finalize-release'].needs === 'build-and-release',
  },
  {
    name: 'Build jobs create draft releases only',
    test: () => {
      const buildSteps = config.jobs['build-and-release'].steps;
      const uploadSteps = buildSteps.filter(s => 
        s.uses && s.uses.includes('action-gh-release')
      );
      return uploadSteps.every(step => step.with.draft === true);
    },
  },
  {
    name: 'Build jobs do NOT finalize (make_latest: false or unset)',
    test: () => {
      const buildSteps = config.jobs['build-and-release'].steps;
      const uploadSteps = buildSteps.filter(s => 
        s.uses && s.uses.includes('action-gh-release')
      );
      return uploadSteps.every(step => 
        step.with.make_latest === false || step.with.make_latest === undefined
      );
    },
  },
  {
    name: 'Only finalize job publishes (draft: false)',
    test: () => {
      const finalizeSteps = config.jobs['finalize-release'].steps;
      const publishStep = finalizeSteps.find(s => s.name === 'Publish Release');
      return publishStep && publishStep.with.draft === false;
    },
  },
  {
    name: 'Only finalize job marks as latest',
    test: () => {
      const finalizeSteps = config.jobs['finalize-release'].steps;
      const publishStep = finalizeSteps.find(s => s.name === 'Publish Release');
      return publishStep && publishStep.with.make_latest === true;
    },
  },
  {
    name: 'Race condition prevented: No parallel finalization possible',
    test: () => {
      // Count jobs that can finalize (draft: false)
      const buildSteps = config.jobs['build-and-release'].steps;
      const buildFinalizeCount = buildSteps.filter(s => 
        s.uses && s.uses.includes('action-gh-release') && s.with?.draft === false
      ).length;
      
      const finalizeSteps = config.jobs['finalize-release'].steps;
      const finalizeFinalizeCount = finalizeSteps.filter(s => 
        s.uses && s.uses.includes('action-gh-release') && s.with?.draft === false
      ).length;
      
      // Build jobs: 0 finalize steps
      // Finalize job: 1 finalize step
      // Total: Only 1 job can finalize
      return buildFinalizeCount === 0 && finalizeFinalizeCount === 1;
    },
  },
  {
    name: 'Ubuntu job uploads Linux and Windows binaries',
    test: () => {
      const step = config.jobs['build-and-release'].steps.find(s => 
        s.name === 'Upload Linux/Windows Assets'
      );
      return step && 
        step.with.files.includes('forge-linux-amd64') && 
        step.with.files.includes('forge-windows-amd64.exe');
    },
  },
  {
    name: 'macOS job uploads macOS binaries',
    test: () => {
      const step = config.jobs['build-and-release'].steps.find(s => 
        s.name === 'Upload macOS Assets'
      );
      return step && 
        step.with.files.includes('forge-darwin-amd64') && 
        step.with.files.includes('forge-darwin-arm64');
    },
  },
  {
    name: 'All release actions have GITHUB_TOKEN',
    test: () => {
      const buildSteps = config.jobs['build-and-release'].steps;
      const finalizeSteps = config.jobs['finalize-release'].steps;
      
      const releaseSteps = [
        ...buildSteps.filter(s => s.uses && s.uses.includes('action-gh-release')),
        ...finalizeSteps.filter(s => s.uses && s.uses.includes('action-gh-release'))
      ];

      return releaseSteps.every(step => step.env?.GITHUB_TOKEN);
    },
  },
];

let passed = 0;
let failed = 0;

tests.forEach(({ name, test }) => {
  try {
    if (test()) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${name} (Error: ${error.message})`);
    failed++;
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}\n`);

if (failed === 0) {
  console.log('✅ All validations passed! Release workflow is race-condition free.\n');
  process.exit(0);
} else {
  console.log('❌ Some validations failed. Please review the workflow.\n');
  process.exit(1);
}
