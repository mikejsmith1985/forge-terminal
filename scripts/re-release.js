#!/usr/bin/env node

/**
 * Re-Release Helper Script
 * 
 * Allows manual re-release of a failed version by:
 * 1. Deleting the existing (failed) GitHub release
 * 2. Force-pushing the same tag to trigger workflow
 * 
 * Usage: node scripts/re-release.js <version>
 * Example: node scripts/re-release.js v3.12.11
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (error) {
    return null;
  }
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  const version = process.argv[2];

  if (!version) {
    console.error('❌ Error: Version required');
    console.error('Usage: node scripts/re-release.js <version>');
    console.error('Example: node scripts/re-release.js v3.12.11');
    process.exit(1);
  }

  // Ensure version starts with 'v'
  const tag = version.startsWith('v') ? version : `v${version}`;

  console.log('\n🔄 Re-Release Tool');
  console.log('==================\n');
  console.log(`Version: ${tag}\n`);

  // Check if tag exists locally
  const tagExists = exec(`git tag -l ${tag}`);
  if (!tagExists || !tagExists.trim()) {
    console.error(`❌ Error: Tag ${tag} does not exist locally`);
    console.error('Available tags:');
    console.log(exec('git tag | tail -10'));
    process.exit(1);
  }

  console.log('✅ Tag exists locally\n');

  // Check if release exists on GitHub
  console.log('🔍 Checking GitHub for existing release...');
  const releaseCheck = exec('gh release view ' + tag + ' 2>&1');
  
  if (releaseCheck && !releaseCheck.includes('release not found')) {
    console.log('📦 Found existing release on GitHub\n');
    
    const answer = await ask('⚠️  Delete existing release and re-release? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Aborted by user');
      rl.close();
      process.exit(0);
    }

    console.log('\n🗑️  Deleting existing release...');
    const deleteResult = exec(`gh release delete ${tag} --yes`);
    
    if (deleteResult === null) {
      console.error('❌ Failed to delete release');
      rl.close();
      process.exit(1);
    }
    
    console.log('✅ Release deleted');
  } else {
    console.log('ℹ️  No existing release found (tag may have failed to create release)\n');
  }

  // Force push the tag
  console.log('\n🚀 Force-pushing tag to trigger workflow...');
  
  try {
    execSync(`git push origin ${tag} --force`, { stdio: 'inherit' });
    console.log('✅ Tag pushed successfully\n');
  } catch (error) {
    console.error('\n❌ Failed to push tag');
    rl.close();
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════');
  console.log('✅ Re-release initiated!');
  console.log('═══════════════════════════════════════════\n');
  console.log('📊 Monitor the workflow at:');
  console.log('   https://github.com/mikejsmith1985/forge-terminal/actions\n');
  console.log('The workflow will:');
  console.log('  1. Clean up any remaining release artifacts');
  console.log('  2. Build all platform binaries');
  console.log('  3. Create a new release with the same version\n');

  rl.close();
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  rl.close();
  process.exit(1);
});
