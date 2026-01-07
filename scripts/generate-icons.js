const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceImage = 'C:\\Users\\mikej\\AppData\\Local\\Temp\\clipboard-1767795776445938000.png';
const frontendPublic = path.join(__dirname, '..', 'frontend', 'public');
const internalPlatform = path.join(__dirname, '..', 'internal', 'platform');

async function generateIcons() {
  console.log('Generating icons from:', sourceImage);
  
  // Ensure directories exist
  if (!fs.existsSync(frontendPublic)) {
    fs.mkdirSync(frontendPublic, { recursive: true });
  }
  if (!fs.existsSync(internalPlatform)) {
    fs.mkdirSync(internalPlatform, { recursive: true });
  }

  // Read the source image
  const image = sharp(sourceImage);
  const metadata = await image.metadata();
  
  console.log('Source image:', metadata.width, 'x', metadata.height);

  // Generate favicon.ico (32x32, transparent background)
  console.log('Generating favicon.ico (32x32)...');
  await image
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(frontendPublic, 'favicon.png'));
  
  // Generate larger favicon (192x192)
  console.log('Generating favicon-192.png...');
  await image
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(frontendPublic, 'favicon-192.png'));

  // Generate large favicon (512x512)
  console.log('Generating favicon-512.png...');
  await image
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(frontendPublic, 'favicon-512.png'));

  // Generate Windows icon (256x256) - keep original background
  console.log('Generating windows-icon.png (256x256)...');
  await sharp(sourceImage)
    .resize(256, 256, { fit: 'contain', background: { r: 43, g: 48, b: 53, alpha: 1 } })
    .png()
    .toFile(path.join(internalPlatform, 'windows-icon.png'));

  console.log('✓ All icons generated successfully!');
}

generateIcons().catch(console.error);
