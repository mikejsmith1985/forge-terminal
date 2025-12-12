# LLM Model Testing Baseline

## Overview

This document describes the standardized baseline testing system for evaluating and comparing LLM models used in the Forge Assistant.

**Last Updated:** 2025-12-11  
**Framework Version:** v1.22.0 (Comprehensive Indexing)  
**Current Baseline Metrics:** See [Baseline Results](#baseline-results)

## 🚀 New in v1.22.0: Comprehensive Indexing

The indexing framework now supports the **entire codebase**, not just documentation:

### What's Indexed Now
- ✅ **Documentation** (147 .md files) - User guides, developer docs, release notes
- ✅ **Go Source Code** (71 .go files) - Implementation details, APIs, handlers
- ✅ **JavaScript/React** (66 .js/.jsx/.ts/.tsx files) - Frontend components, hooks
- ✅ **Configuration Files** (JSON, YAML, Makefile) - Build configs, package definitions
- ✅ **Shell Scripts** (40+ .sh files) - Automation scripts, test runners
- ✅ **Build Files** (go.mod, package.json, etc.) - Dependency specifications
- ✅ **Optional: Gitignored Content** (docs/sessions/, .forge/) - Real user data

### Quick Start: Index Everything
```bash
# Index entire codebase (recommended)
./scripts/index-full-codebase.sh

# Include gitignored content too
./scripts/index-full-codebase.sh --with-gitignored
```

**Expected Results:**
- **Files Indexed:** 284+ (up from 147)
- **Document Chunks:** 1200+ (up from 400)
- **Accuracy Improvement:** +10-20% on technical questions
- **Duration:** ~2-3 minutes with Ollama embeddings

## Baseline Results

### Phase 1 - System Prompt Injection (Mistral 7B)

**Date:** 2025-12-11  
**Model:** Mistral 7B (mistral:7b-instruct via Ollama)  
**Method:** System prompt knowledge injection only (no RAG)

| Metric | Result |
|--------|--------|
| **Overall Accuracy** | 87% |
| **Questions Tested** | 5 |
| **Perfect Answers** | 2/5 (40%) |
| **Good Answers** | 2/5 (40%) |
| **Acceptable Answers** | 1/5 (20%) |

**Questions:**
- Q1: Enable session logging → 80%
- Q2: Open multiple tabs → 100% ✓
- Q3: Search for text → 100% ✓
- Q4: Disconnect reasons → 75%
- Q5: Session persistence → 80%

**Result Files:**
- `test-results/accuracy-2025-12-10-200834/summary.json`
- Documentation: `docs/sessions/2025-12-11-phase1-testing-results.md`

### Phase 2 - RAG Framework Baseline (Ollama Default Model)

**Date:** 2025-12-11  
**Method:** RAG framework with keyword matching (12 questions)

| Metric | Result |
|--------|--------|
| **Overall Accuracy** | 66.7% |
| **Passed Tests** | 8/12 (≥80%) |
| **Failed Tests** | 4/12 (<80%) |
| **Average Score** | 79.3% |
| **Pass Average** | 94.3% |
| **Fail Average** | 53% |

**Breakdown by Category:**
- Features (5): Mixed results
- Configuration (1): 80% pass
- Shortcuts (1): 75% fail
- Deployment (1): 100% pass
- Troubleshooting (1): 40% fail
- API (1): 60% fail
- Difficulty → Easy (4): 2 pass, 2 fail
- Difficulty → Medium (5): 4 pass, 1 fail
- Difficulty → Hard (3): 2 pass, 1 fail

**Result Files:**
- Test data: `test-data/rag-test-questions.json`
- Documentation: `docs/sessions/2025-12-11-rag-testing-baseline-results.md`

## Testing Framework

### Test Data

**File:** `test-data/rag-test-questions.json`

Contains 20 Forge-specific questions covering:
- **Features:** AM logging, vision detection, assistant capabilities, session persistence, command cards
- **Shortcuts:** Keyboard shortcuts
- **Configuration:** Custom themes
- **Deployment:** Deployment modes
- **Troubleshooting:** Connection issues
- **API:** API access

**Difficulty levels:**
- Easy (6 questions): Basic features
- Medium (7 questions): Integrated features
- Hard (7 questions): Advanced topics

**Format:**
```json
{
  "tests": [
    {
      "id": "q1",
      "question": "How do I enable AM logging in Forge?",
      "expected_keywords": ["right-click", "tab", "AM Logging", ".forge/am"],
      "category": "features",
      "difficulty": "easy",
      "source": "docs/features/am-logging.md"
    }
  ]
}
```

### Scoring Methodology

For each question:
1. **Keywords Defined:** Pre-defined relevant terms for each question
2. **Match Scoring:** (matched_keywords / total_keywords) × 100%
3. **Pass Threshold:** ≥80% keyword match rate
4. **Matching:** Case-insensitive substring matching
5. **Calculation:** Average of all test scores = overall accuracy

**Example:**
```
Q1: "How do I enable AM logging?"
Expected: ["right-click", "tab", "AM Logging", ".forge/am"]
Response mentions: "AM Logging" and ".forge/am"
Score: 2/4 × 100% = 50% (FAIL)
```

## Running Tests

### Quick Start: Compare Your New Model

```bash
# Test your new model against the baseline
./scripts/test-model-comparison.sh your-model:tag

# Compare with the current baseline
./scripts/test-model-comparison.sh your-model:tag mistral:7b-instruct
```

### Available Test Commands

#### Test a Single Model
```bash
./scripts/test-model-comparison.sh --baseline-only mistral:7b-instruct
```

#### Test Multiple Models and Compare
```bash
./scripts/test-model-comparison.sh mistral:7b-instruct neural-chat:7b llama:13b
```

#### Compare Your Last Two Runs
```bash
./scripts/test-model-comparison.sh --compare-last-two
```

#### List All Test Results
```bash
./scripts/test-model-comparison.sh --list-results
```

### Full Test Data (Phase 1 Only - 5 Questions)

If you prefer the original 5-question Phase 1 test:

```bash
./scripts/test-accuracy-improved.sh
```

This tests the system prompt knowledge base accuracy and takes ~2 minutes.

## Test Results Storage

### Directory Structure
```
test-results/
├── model-comparisons/
│   ├── model-mistral_7b-instruct_20251211-012345.json
│   ├── model-neural-chat_7b_20251211-020000.json
│   └── model-your-model_tag_20251211-030000.json
└── accuracy-2025-12-10-200834/
    ├── summary.json
    └── qa.txt
```

### Result JSON Format
```json
{
  "timestamp": "2025-12-11T01:22:00Z",
  "model": "mistral:7b-instruct",
  "phase": "Model Comparison",
  "total_tests": 12,
  "passed_tests": 8,
  "failed_tests": 4,
  "overall_accuracy": 66,
  "average_score": 79,
  "results": [
    {
      "id": "q1",
      "score": 100,
      "status": "PASS",
      "matched": 4,
      "total": 4
    }
  ]
}
```

## Interpreting Results

### Accuracy Ranges

| Range | Interpretation | Action |
|-------|-----------------|--------|
| 90-100% | Excellent | Ready for production |
| 80-89% | Good | Monitor, consider improvements |
| 70-79% | Fair | Needs enhancement |
| <70% | Poor | Investigate root cause |

### Common Issues

**Low accuracy on "easy" questions?**
- System prompt missing basic knowledge
- Model doesn't understand question phrasing
- Keywords don't match response terminology

**Low accuracy on "hard" questions?**
- Complex topics need RAG context
- Model lacks domain-specific knowledge
- Increase context window or add fine-tuning

**Inconsistent results between runs?**
- Model temperature too high (use 0-0.3 for consistency)
- Model has variability in outputs
- Run multiple times to get average

## Extending the Baseline

### Adding New Test Questions

1. Edit `test-data/rag-test-questions.json`
2. Add test object with:
   - `id`: Unique identifier (q13, q14, etc.)
   - `question`: The actual question
   - `expected_keywords`: Array of keywords to match
   - `category`: Feature area
   - `difficulty`: easy, medium, or hard
   - `source`: Documentation source file
3. Run test again: `./scripts/test-model-comparison.sh <model>`

### Creating a New Baseline

If you want to establish a different baseline (e.g., for a specific use case):

1. Create new question set: `test-data/rag-test-questions-<purpose>.json`
2. Create test script: `scripts/test-<purpose>-baseline.sh`
3. Document baseline results in `docs/sessions/YYYY-MM-DD-<purpose>-baseline.md`
4. Record expected scores and methodology

## Monitoring Model Performance

### Historical Comparison

Track model performance over time:

```bash
# List all results with accuracy
./scripts/test-model-comparison.sh --list-results

# Compare first and last result
results=(test-results/model-comparisons/model-*.json)
./scripts/compare-results.sh "${results[0]}" "${results[-1]}"
```

### Regression Detection

If a new model scores lower than baseline:
1. Check test results: `test-results/model-comparisons/`
2. Identify which questions fail
3. Review failing question keywords in `test-data/rag-test-questions.json`
4. Adjust model parameters or increase training

## Benchmarking Best Practices

1. **Run on consistent hardware** - Same server/GPU for comparable results
2. **Test multiple times** - Run 2-3 times, average the results
3. **Use same seed** - Set model seed for reproducible results
4. **Control temperature** - Use 0.1-0.3 for consistency, 0.7+ for creativity
5. **Document context** - Note any model parameter changes
6. **Keep baseline stable** - Don't change test questions after baseline
7. **Track cumulative results** - Compare against all historical runs

## Model Parameters to Track

When testing a new model, document:
- **Model name and version**
- **Quantization level** (if applicable)
- **Temperature setting**
- **Max tokens**
- **Context window size**
- **Framework** (Ollama, LLaMA.cpp, vLLM, etc.)
- **Hardware** (CPU, GPU model)

Example:
```
Model: mistral:7b-instruct
Quantization: Q4 (4-bit)
Temperature: 0.3
Max Tokens: 500
Context: 8K
Framework: Ollama
Hardware: RTX 4090
```

## FAQ

**Q: How do I change the model being tested?**  
A: Pass the model name: `./scripts/test-model-comparison.sh your-model:tag`

**Q: Can I run tests with a remote API?**  
A: Currently tests use local Forge API on port 8080/8333. Modify scripts to support remote endpoints.

**Q: How long does testing take?**  
A: ~2-3 minutes for 12 questions (20 seconds per question on average).

**Q: What if Forge API doesn't return results?**  
A: Check Forge is running: `curl http://localhost:8080/` and verify model is available: `ollama list`

**Q: Can I use this for fine-tuning?**  
A: Yes! Use the test data to create a fine-tuning dataset. See `docs/developer/fine-tuning.md`.

## References

- Test Data: `test-data/rag-test-questions.json`
- Test Script: `scripts/test-model-comparison.sh`
- Phase 1 Results: `docs/sessions/2025-12-11-phase1-testing-results.md`
- Phase 2 Results: `docs/sessions/2025-12-11-rag-testing-baseline-results.md`
- Original Test: `scripts/test-accuracy-improved.sh`

## Related Documents

- [Forge Assistant Architecture](./assistant-architecture.md)
- [RAG Implementation](./rag-implementation.md)
- [Fine-Tuning Guide](./fine-tuning.md)
