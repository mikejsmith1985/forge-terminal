const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

const frontendPublic = path.join(__dirname, '..', 'frontend', 'public');
const internalPlatform = path.join(__dirname, '..', 'internal', 'platform');

async function convertToIco() {
  console.log('Converting PNG to ICO...');
  
  // Convert favicon.png to favicon.ico
  const faviconPng = path.join(frontendPublic, 'favicon.png');
  const faviconIco = path.join(frontendPublic, 'favicon.ico');
  
  const faviconBuffer = await toIco([fs.readFileSync(faviconPng)]);
  fs.writeFileSync(faviconIco, faviconBuffer);
  console.log('✓ Created favicon.ico');

  // Convert windows-icon.png to windows-icon.ico
  const windowsIconPng = path.join(internalPlatform, 'windows-icon.png');
  const windowsIconIco = path.join(internalPlatform, 'windows-icon.ico');
  
  const iconBuffer = await toIco([fs.readFileSync(windowsIconPng)]);
  fs.writeFileSync(windowsIconIco, iconBuffer);
  console.log('✓ Created windows-icon.ico');
  
  console.log('✓ All ICO files generated successfully!');
}

convertToIco().catch(console.error);
