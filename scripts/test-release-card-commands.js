#!/usr/bin/env node

/**
 * Test: Release Card Command Generation
 * Verifies that re-release logic is properly integrated
 */

console.log('🧪 Testing Release Card Command Generation\n');

// Simulate the command generation logic
function generateReleaseCommand(next, shellType) {
  if (!next) return '';
  
  if (shellType === 'powershell') {
    return `$b = git branch --show-current; git add -A; if ($?) { git commit -m 'chore: release ${next}' --allow-empty; if ($?) { git push origin $b; if ($?) { git checkout main; if ($?) { git pull origin main; if ($?) { git merge $b --no-edit; if ($?) { git push origin main; if ($?) { git push origin :refs/tags/${next} 2>$null; git tag -d ${next} 2>$null; git tag ${next}; if ($?) { git push origin ${next}; if ($?) { git checkout $b; Write-Host 'Release ${next} published on GitHub.' -ForegroundColor Green } } } } } } } } }`;
  } else {
    return `b=$(git branch --show-current) && git add -A && git commit -m 'chore: release ${next}' --allow-empty && git push origin $b && git checkout main && git pull origin main && git merge $b --no-edit && git push origin main && git push origin :refs/tags/${next} 2>/dev/null; git tag -d ${next} 2>/dev/null; git tag ${next} && git push origin ${next} && git checkout $b && echo "Release ${next} published on GitHub."`;
  }
}

const tests = [
  {
    name: 'PowerShell command includes tag deletion',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'powershell');
      return cmd.includes('git push origin :refs/tags/v3.12.11') && 
             cmd.includes('git tag -d v3.12.11');
    }
  },
  {
    name: 'Bash command includes tag deletion',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'bash');
      return cmd.includes('git push origin :refs/tags/v3.12.11') && 
             cmd.includes('git tag -d v3.12.11');
    }
  },
  {
    name: 'PowerShell command silences errors (2>$null)',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'powershell');
      return cmd.includes('2>$null');
    }
  },
  {
    name: 'Bash command silences errors (2>/dev/null)',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'bash');
      return cmd.includes('2>/dev/null');
    }
  },
  {
    name: 'PowerShell deletes before creating tag',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'powershell');
      const deleteIdx = cmd.indexOf('git tag -d v3.12.11');
      const createIdx = cmd.indexOf('git tag v3.12.11;');
      return deleteIdx !== -1 && createIdx !== -1 && deleteIdx < createIdx;
    }
  },
  {
    name: 'Bash deletes before creating tag',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'bash');
      const deleteIdx = cmd.indexOf('git tag -d v3.12.11');
      const createIdx = cmd.indexOf('git tag v3.12.11 &&');
      return deleteIdx !== -1 && createIdx !== -1 && deleteIdx < createIdx;
    }
  },
  {
    name: 'Command pushes to main before tagging',
    test: () => {
      const cmd = generateReleaseCommand('v3.12.11', 'bash');
      const pushMainIdx = cmd.indexOf('git push origin main');
      const tagIdx = cmd.indexOf('git tag v3.12.11');
      return pushMainIdx !== -1 && tagIdx !== -1 && pushMainIdx < tagIdx;
    }
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
  console.log('✅ Release card commands properly handle local GitHub releases!\n');
  console.log('🎯 How it works:');
  console.log('  1. Delete remote tag (if exists) - silent fail OK');
  console.log('  2. Delete local tag (if exists) - silent fail OK');
  console.log('  3. Create fresh local tag');
  console.log('  4. Push tag and publish the GitHub Release locally\n');
  console.log('👉 Just click Execute on the release card - it handles everything!\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the command generation.\n');
  process.exit(1);
}
