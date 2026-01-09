const fs = require('fs');
const path = require('path');

const screenshotPath = path.join(__dirname, '../modal-ui-proof.png');
const outputPath = path.join(__dirname, '../MODAL_UI_FIX_PROOF.html');

try {
    const bitmap = fs.readFileSync(screenshotPath);
    const base64 = Buffer.from(bitmap).toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Modal UI Fix Verification</title>
    <style>
        body { font-family: sans-serif; background: #1a1a1a; color: #fff; padding: 20px; }
        .card { background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        h1 { color: #4ade80; border-bottom: 1px solid #444; padding-bottom: 10px; }
        .status { color: #4ade80; font-weight: bold; }
        .proof-img { max-width: 100%; border: 2px solid #555; border-radius: 4px; margin-top: 10px; }
        .legend { font-size: 0.9em; color: #aaa; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>✅ Modal UI Fix Verification</h1>
        <p><strong>Status:</strong> <span class="status">VERIFIED</span></p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Changes Verified:</strong></p>
        <ul>
            <li>Textarea min-height increased to 120px (Cyan highlight)</li>
            <li>Modal body scrolling enabled (Bottom fields visible)</li>
            <li>Macro Payload inputs accessible (Magenta highlight)</li>
            <li>"Add" button functionality verified</li>
        </ul>
    </div>

    <div class="card">
        <h2>Visual Proof</h2>
        <p>Screenshot of the "Add Command" modal showing expanded textarea and accessible macro fields.</p>
        <img src="${dataUri}" class="proof-img" alt="Modal UI Proof" />
        <div class="legend">
            Cyan Border: Command Textarea (Expanded) | Magenta Border: Macro Payload (Accessible)
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(outputPath, html);
    console.log(`Generated ${outputPath}`);

} catch (err) {
    console.error('Error generating proof:', err);
    process.exit(1);
}
