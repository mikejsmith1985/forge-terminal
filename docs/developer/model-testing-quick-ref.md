# LLM Model Testing - Quick Reference

## 📊 Current Baselines (2025-12-11)

### Phase 1: System Prompt Only (Mistral 7B)
```
Accuracy: 87%  |  Passed: 5/5  |  Questions: 5
Model: mistral:7b-instruct
```

### Phase 2: RAG Framework (Ollama Default)
```
Accuracy: 66.7%  |  Passed: 8/12  |  Questions: 20
Average Score: 79.3%
```

---

## 🚀 Quick Commands

### Test Your New Model
```bash
./scripts/test-model-comparison.sh your-model:tag
```

### Compare Two Models
```bash
./scripts/test-model-comparison.sh your-model:tag mistral:7b-instruct
```

### Compare Your Last Two Runs
```bash
./scripts/test-model-comparison.sh --compare-last-two
```

### List All Test Results
```bash
./scripts/test-model-comparison.sh --list-results
```

---

## 📈 Interpreting Results

| Accuracy | Status | Next Action |
|----------|--------|------------|
| 90-100% | ✅ Excellent | Use in production |
| 80-89% | ✓ Good | Consider for use |
| 70-79% | ⚠️ Fair | Needs improvement |
| <70% | ❌ Poor | Investigate/redesign |

---

## 📋 What's Tested

**20 Questions covering:**
- AM logging (easy)
- Tab shortcuts (easy)
- Vision detection (medium)
- WSL integration (medium)
- Deployment modes (medium)
- Custom themes (hard)
- Command cards (easy)
- Troubleshooting (hard)
- Assistant features (medium)
- API access (hard)
- Session persistence (medium)
- Terminal search (easy)
- Split panes (medium)
- System requirements (easy)
- Configuration backup (medium)
- Monitoring & logging (hard)
- Integrations (hard)
- Security & privacy (hard)
- Keybindings & macros (medium)
- Getting help (easy)

**Test Data:** `test-data/rag-test-questions.json`

---

## 📊 How Scoring Works

```
1. Each question has expected keywords
2. Model response is checked for keywords
3. Score = (matched keywords / total keywords) × 100%
4. Pass threshold: ≥80%
5. Overall accuracy = (passed tests / total tests) × 100%
```

**Example:**
```
Q: "How do I enable AM logging?"
Keywords: ["right-click", "tab", "AM Logging", ".forge/am"]
Response mentions: "AM Logging", ".forge/am"
Score: 2/4 = 50% (FAIL)
```

---

## 🔍 Understanding Model Differences

When comparing models, look at:
- **Easy questions:** Basic feature knowledge
- **Medium questions:** Integrated features, context
- **Hard questions:** Advanced topics, API details

If your model scores:
- ✅ High on easy → Good general knowledge
- ✅ High on medium → Understands context well
- ✅ High on hard → Good for advanced queries

---

## 📁 Result Files

```
test-results/model-comparisons/
├── model-mistral_7b-instruct_20251211-012345.json
├── model-your-model_tag_20251211-020000.json
└── ...
```

Each file contains:
- `overall_accuracy`: Main metric (0-100)
- `passed_tests` / `total_tests`: Count
- `average_score`: Average of all test scores
- `results[]`: Per-question breakdown

---

## ⚡ Tips for Best Results

1. **Ensure Forge is running:**
   ```bash
   ./forge --port 8080  # or 8333
   ```

2. **Check model is available:**
   ```bash
   ollama list
   ollama pull your-model:tag  # if needed
   ```

3. **Run multiple times for consistency:**
   - Run test 2-3 times
   - Average the results
   - Look for variance

4. **Track parameters:**
   - Model name and version
   - Quantization level (Q4, Q5, etc.)
   - Temperature setting
   - Any hardware/env notes

---

## 🎯 What's Not Tested

- Streaming responses
- Long context handling (>8K tokens)
- Multi-turn conversations
- Edge cases
- Performance metrics
- Error handling

If you need those, create additional tests in `test-data/` directory.

---

## 📖 Full Documentation

See `docs/developer/model-testing-baseline.md` for:
- Detailed methodology
- How to extend tests
- Historical tracking
- Benchmarking best practices
- Model parameter guidelines
- Fine-tuning recommendations

---

## 🤔 Common Questions

**Q: My model scores 75%, is that good?**  
A: Fair performance. Consider improvements or try a different model.

**Q: Why does it ask Forge API, not the model directly?**  
A: Tests the full pipeline (model + Forge context integration).

**Q: Can I modify the test questions?**  
A: Yes, but then you can't compare to baseline. Create new test set instead.

**Q: How do I improve from 66% to 85%?**  
A: Likely needs RAG integration or fine-tuning. See baseline documentation.

---

**Last Updated:** 2025-12-11  
**Baseline Established:** 2025-12-11  
**Test Framework:** `scripts/test-model-comparison.sh`
