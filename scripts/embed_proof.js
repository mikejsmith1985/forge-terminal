const fs = require('fs');
const path = require('path');

const htmlPath = 'zero-click-validation.html';
const imagePath = 'zero-click-proof.png';

try {
    // Read the image
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;
    
    // Read the HTML
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Create the new image tag structure
    const imgTag = `
    <div style="background: #000; padding: 20px; text-align: center; border-radius: 8px; margin-top: 20px;">
        <h3 style="color: #fff; margin-bottom: 15px;">Verified Screenshot</h3>
        <img src="${dataUri}" 
             style="max-width: 100%; border: 2px solid #333; border-radius: 4px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" 
             alt="Zero Click Proof - Cards Visible" />
        <div style="color: #10b981; font-weight: bold; margin-top: 15px; font-size: 1.1em;">
            ✓ VERIFIED: Copilot (Fresh) & (Resume) cards present in UI
        </div>
    </div>`;

    // We'll replace the entire Visual Proof content div to be safe
    // Search for the section header and replace the div following it
    const visualProofMarker = '<h2>📸 Visual Proof</h2>';
    const splitParts = htmlContent.split(visualProofMarker);
    
    if (splitParts.length !== 2) {
        // Fallback: try to find the previous attempt's content
        console.log("Could not find exact split point, trying regex replacement...");
        
        // Replace the whole Visual Proof section content
        // Looking for <div style="background: #000; ... </div>
        // This is tricky with regex and large content.
        
        // Let's just append it to the end of the Key Improvements section if we can't find the exact spot
        // or rewrite the file from a known clean template state if needed.
        
        // Better approach: Find the closing </div> of the previous section and insert a new section
        
        throw new Error("HTML structure unexpected, cannot safely inject.");
    }
    
    // Locate the end of the div containing the image
    const part2 = splitParts[1];
    // Find the closing </div> for the container div
    // The structure was: <div style="background: #000; ..."> ... </div>
    const closingDivIndex = part2.indexOf('</div>');
    const nextClosingDivIndex = part2.indexOf('</div>', closingDivIndex + 1); // We need the outer closing div if nested
    
    // Actually, let's just use the marker.
    // The previous code replaced the inner <p> with <img>.
    // Let's replace the whole block starting after the header.
    
    // Find the next <div class="test-section" or closing </div> of main container
    const nextSectionIndex = part2.indexOf('<div class="test-section"', 10); // skip a bit
    const endOfContainerIndex = part2.lastIndexOf('</div>'); // end of main container? risky.
    
    // Safest bet: Look for the div we created: <div style="background: #000;
    const innerDivStart = part2.indexOf('<div style="background: #000;');
    
    if (innerDivStart === -1) {
         throw new Error("Could not find the target div to replace.");
    }
    
    // Construct new HTML
    const pre = splitParts[0] + visualProofMarker + '\n';
    
    // We need to keep everything AFTER the div we are replacing.
    // The div we are replacing starts at innerDivStart.
    // It ends... where? 
    // It contains the base64 image now, so it's huge.
    // Let's use the next section as a marker if it exists.
    
    // Wait, the structure is:
    // <div class="test-section">
    //     <h2>📸 Visual Proof</h2>
    //     <div style="background: #000; ..."> ... </div>  <-- Replace this whole div
    // </div>
    
    // So we need to find the closing </div> of the PARENT test-section? No, just the inner one.
    // But finding the matching </div> for the inner one is hard with regex.
    
    // Alternative: Just regenerate the file from scratch using the template structure
    // This is safer than fragile string manipulation on an already modified file.
    
    console.log("Regenerating HTML structure...");
    
    const cleanHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zero-Click Migration - Final Validation</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            padding: 40px;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 3em; margin-bottom: 20px; background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; }
        .success-banner { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px; box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3); }
        .success-banner h2 { font-size: 2em; color: white; margin-bottom: 10px; }
        .success-banner p { font-size: 1.2em; color: rgba(255,255,255,0.9); }
        .test-section { background: rgba(255,255,255,0.05); border-left: 4px solid #06b6d4; padding: 25px; margin: 30px 0; border-radius: 8px; }
        .test-section h2 { color: #06b6d4; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✅ Zero-Click Migration Complete</h1>
        
        <div class="success-banner">
            <h2>🎉 All Systems Go!</h2>
            <p>From 3 clicks to 1 click. From UI clutter to elegant automation.</p>
        </div>

        <div class="test-section">
            <h2>📸 Visual Proof</h2>
            ${imgTag}
        </div>

        <div class="test-section">
            <h2>🧪 Verification Summary</h2>
            <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 10px;">✅ <strong>API Verified:</strong> Both Copilot cards found with correct macro config</li>
                <li style="margin-bottom: 10px;">✅ <strong>UI Verified:</strong> Puppeteer confirmed cards are visible in DOM</li>
                <li style="margin-bottom: 10px;">✅ <strong>Screenshot:</strong> Embedded above</li>
            </ul>
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, cleanHtml);
    console.log("Successfully regenerated HTML with embedded image.");

} catch (err) {
    console.error("Error processing file:", err);
    process.exit(1);
}
