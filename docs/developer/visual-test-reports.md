# Visual Test Reports - Forge Vision Integration

**Date:** 2025-12-11T21:03:33Z  
**Status:** ✅ Complete - Auto-generating HTML visuals  

---

## Overview

Your test suite now automatically generates beautiful HTML visual reports that display in Forge vision whenever you run tests. No extra steps needed!

---

## What Happens When You Run Tests

### Step-by-Step

1. **Run Test**
   ```bash
   ./scripts/test-model-comparison.sh neural-chat:7b
   ```

2. **Test Executes** (5-7 minutes)
   - Tests 20 questions
   - Calculates accuracy, scores, difficulty breakdown
   - Saves JSON results

3. **Visual Generated Automatically**
   - HTML report created instantly
   - Browser opens automatically (if available)
   - Beautiful dashboard displayed

4. **View Results**
   - See accuracy with circular progress indicator
   - View pass/fail counts
   - Performance by difficulty level
   - Status badge (Excellent/Good/Fair/Poor)

---

## Visual Dashboard Features

### Displayed Metrics

✅ **Overall Accuracy**
- Large circular progress indicator
- Color-coded: Green (90+%), Blue (80-89%), Orange (70-79%), Red (<70%)
- Percentage display in center

✅ **Test Results**
- Passed/Total count (e.g., 16/20)
- Average score percentage

✅ **Difficulty Breakdown**
- Easy: Pass count / 6 total
- Medium: Pass count / 7 total
- Hard: Pass count / 7 total

✅ **Status Badge**
- ✅ Excellent (90%+)
- ✓ Good (80-89%)
- ⚠️ Fair (70-79%)
- ❌ Poor (<70%)

✅ **Test Information**
- Model name
- Test date
- Timestamp
- Responsive design

---

## File Locations

### Scripts

**Test Runner (Auto-calls Visual):**
```
scripts/test-model-comparison.sh
```
- Runs tests
- Calls visual generator on completion
- Opens browser if available

**Visual Generator:**
```
scripts/generate-test-visual.sh
```
- Creates HTML reports
- Can be called manually
- Generates from latest result or specified file

### Output Files

**Test Results (JSON):**
```
test-results/model-comparisons/model-<name>-<timestamp>.json
```

**Visual Reports (HTML):**
```
test-results/model-comparisons/model-<name>-<timestamp>.html
```

---

## How to Use

### Automatic (Recommended)

Just run the test - visual is created automatically:

```bash
./scripts/test-model-comparison.sh neural-chat:7b
```

The HTML report opens automatically in your default browser.

### Manual Generation

Generate a visual for an existing result:

```bash
./scripts/generate-test-visual.sh /path/to/result.json
```

Or generate for the latest result:

```bash
./scripts/generate-test-visual.sh
```

### View HTML Files

Open any `.html` file from `test-results/model-comparisons/`:

```bash
open test-results/model-comparisons/model-neural-chat_7b_20251211-123456.html
```

---

## Visual Design

### Color Scheme

**Accuracy Backgrounds:**
- 90%+: Green (#27ae60)
- 80-89%: Blue (#3498db)
- 70-79%: Orange (#f39c12)
- <70%: Red (#e74c3c)

**Difficulty Cards:**
- Easy: Blue-Green gradient
- Medium: Pink-Yellow gradient
- Hard: Cyan-Purple gradient

**Overall Theme:**
- Purple gradient header
- Clean white cards
- Modern shadows and rounded corners
- Responsive grid layout

---

## Command Card Integration

The `llm-model-test.card` now includes visual reporting metadata:

```json
{
  "visualReporting": {
    "enabled": true,
    "format": "HTML",
    "autoOpen": true,
    "script": "scripts/generate-test-visual.sh"
  }
}
```

### From Forge Assistant

```
/llm-model-test neural-chat:7b
```

This will:
1. Execute the test
2. Generate the visual
3. Show in Forge vision

---

## Browser Auto-Open

The test script automatically opens generated HTML in:

| System | Opens With |
|--------|-----------|
| macOS | `open` command |
| Linux | `xdg-open` command |
| Windows WSL | `wslview` command |
| Other | Manual: `open file.html` |

If auto-open doesn't work, find the HTML file in:
```
test-results/model-comparisons/model-*.html
```

And open it manually in your browser.

---

## Example Output

When you run:
```bash
./scripts/test-model-comparison.sh mistral:7b-instruct
```

You'll see:
```
Testing model: mistral:7b-instruct
Output: test-results/model-comparisons/model-mistral_7b-instruct_20251211-213033.json

[Test runs for 5-7 minutes...]

Results saved: test-results/model-comparisons/model-mistral_7b-instruct_20251211-213033.json
Generating visual report...
✅ HTML report generated: test-results/model-comparisons/model-mistral_7b-instruct_20251211-213033.html

[Browser opens showing beautiful dashboard]
```

---

## Visual Structure

The HTML includes:

### Header Section
```
🧪 LLM Model Test Results
Comprehensive Model Evaluation Dashboard
```

### Main Card
- Model name
- Test date
- Large accuracy circle with percentage
- Status badge
- Test metrics (Passed/Total, Average Score)
- Difficulty breakdown

### Responsive Design
- Desktop: Multi-column grid
- Tablet: 2-column layout
- Mobile: Single column

---

## Features Summary

✅ **Automatic Generation**
- Runs immediately after tests complete
- No manual steps required

✅ **Beautiful Design**
- Gradient backgrounds
- Circular progress indicators
- Color-coded status
- Modern typography

✅ **Responsive Layout**
- Works on desktop, tablet, mobile
- Self-contained HTML (no external resources)

✅ **Complete Metrics**
- Overall accuracy
- Pass/fail counts
- Average score
- Difficulty breakdown
- Status classification

✅ **Auto-Open Browser**
- Opens in default browser automatically
- Works on macOS, Linux, Windows WSL

✅ **Easy Access**
- Results always saved
- Can regenerate anytime
- Manual viewing available

---

## Next Steps

1. **Run a Test**
   ```bash
   ./scripts/test-model-comparison.sh your-model:tag
   ```

2. **Enjoy the Visual**
   - Browser opens automatically
   - See beautiful dashboard
   - Share HTML file with others

3. **Compare Visually**
   ```bash
   ./scripts/test-model-comparison.sh model1:tag model2:tag
   ```
   - Two HTML reports generated
   - Easy side-by-side comparison

4. **Archive Results**
   - All HTMLs saved in test-results/
   - Perfect for documentation
   - Can be emailed or shared

---

## Technical Details

### HTML Generation

**Uses:**
- Pure HTML5 with embedded CSS
- No external dependencies
- CSS Grid for responsive layout
- CSS conic-gradient for circular progress
- Self-contained (single file)

**Advantages:**
- Loads instantly
- Works offline
- Easy to email
- Perfect for Forge vision
- No JavaScript required

### File Naming

```
model-<model_name>_<timestamp>.html

Examples:
  model-mistral_7b-instruct_20251211-213033.html
  model-neural-chat_7b_20251211-213045.html
  model-your-model_tag_20251211-213100.html
```

---

## Troubleshooting

**Visual not generating?**
- Check if `generate-test-visual.sh` is executable: `ls -l scripts/generate-test-visual.sh`
- Make sure `jq` is installed: `which jq`

**Browser not opening?**
- Find the HTML file manually: `ls test-results/model-comparisons/`
- Open with: `open model-*.html` (macOS) or `xdg-open model-*.html` (Linux)

**Wrong metrics displayed?**
- Visual calculates from JSON file
- Ensure test completed successfully
- JSON file exists with results

**Styling issues?**
- HTML is self-contained (no external CSS)
- Works in all modern browsers
- Try different browser if styling looks odd

---

## Files Created/Updated

✅ `scripts/generate-test-visual.sh` - New visual generator  
✅ `scripts/test-model-comparison.sh` - Updated to call visual generator  
✅ `command-cards/llm-model-test.card` - Updated with visual metadata  

---

## Summary

You now have:

✅ **Automatic visual generation** when tests complete  
✅ **Beautiful HTML dashboards** showing all metrics  
✅ **Auto-opening browser** for instant viewing  
✅ **Responsive design** for any device  
✅ **Self-contained HTML** with no dependencies  
✅ **Easy sharing** of results with others  

**Just run tests and enjoy the beautiful visuals!**

---

**Created:** 2025-12-11T21:03:33Z  
**Script:** scripts/generate-test-visual.sh  
**Status:** Ready to use - automatic on test completion
