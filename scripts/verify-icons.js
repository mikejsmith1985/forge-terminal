const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Icon and Favicon Changes...\n');

let allPassed = true;

function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  const status = exists && size > 0 ? '✓' : '✗';
  
  console.log(`${status} ${description}`);
  if (exists && size > 0) {
    console.log(`   Size: ${(size / 1024).toFixed(2)} KB`);
  } else {
    console.log(`   Missing or empty!`);
    allPassed = false;
  }
  return exists && size > 0;
}

console.log('📁 Frontend Favicon Files:');
checkFile(path.join(__dirname, '..', 'frontend', 'public', 'favicon.ico'), 'favicon.ico');
checkFile(path.join(__dirname, '..', 'frontend', 'public', 'favicon.png'), 'favicon.png');
checkFile(path.join(__dirname, '..', 'frontend', 'public', 'favicon-192.png'), 'favicon-192.png');
checkFile(path.join(__dirname, '..', 'frontend', 'public', 'favicon-512.png'), 'favicon-512.png');

console.log('\n📦 Build Output Files:');
checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'web', 'favicon.ico'), 'web/favicon.ico');
checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'web', 'favicon.png'), 'web/favicon.png');
checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'web', 'favicon-192.png'), 'web/favicon-192.png');
checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'web', 'favicon-512.png'), 'web/favicon-512.png');

console.log('\n🪟 Windows Icon Files:');
checkFile(path.join(__dirname, '..', 'internal', 'platform', 'windows-icon.png'), 'windows-icon.png');
checkFile(path.join(__dirname, '..', 'internal', 'platform', 'windows-icon.ico'), 'windows-icon.ico');

console.log('\n🔧 Windows Resource Files:');
const syso386 = checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'rsrc_windows_386.syso'), 'rsrc_windows_386.syso');
const sysoAmd64 = checkFile(path.join(__dirname, '..', 'cmd', 'forge', 'rsrc_windows_amd64.syso'), 'rsrc_windows_amd64.syso');

console.log('\n📄 HTML Reference Check:');
const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf-8');
const hasIco = indexContent.includes('favicon.ico');
const hasPng = indexContent.includes('favicon.png');
const has192 = indexContent.includes('favicon-192.png');
const has512 = indexContent.includes('favicon-512.png');

console.log(`${hasIco ? '✓' : '✗'} index.html references favicon.ico`);
console.log(`${hasPng ? '✓' : '✗'} index.html references favicon.png`);
console.log(`${has192 ? '✓' : '✗'} index.html references favicon-192.png`);
console.log(`${has512 ? '✓' : '✗'} index.html references favicon-512.png`);

if (!hasIco || !hasPng || !has192 || !has512) {
  allPassed = false;
}

console.log('\n💻 Test Executable:');
const testExe = path.join(__dirname, '..', 'forge-test-icon.exe');
if (checkFile(testExe, 'forge-test-icon.exe')) {
  console.log('   ℹ️  Executable built with embedded icon');
}

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All icon and favicon files verified successfully!');
  console.log('\nNext steps:');
  console.log('1. Run the test executable to see the new icon');
  console.log('2. Build with: go build -o forge.exe ./cmd/forge');
  console.log('3. The desktop shortcut will use the icon from the .exe');
  process.exit(0);
} else {
  console.log('❌ Some files are missing or have issues');
  process.exit(1);
}
