# Forge Terminal v3.5.0 - Smart Routing with Embedded SLM

## Design Specification

**Author:** Architecture Session 2025-12-29  
**Status:** Draft  
**Target:** v3.5.0  

---

## Executive Summary

Forge Terminal v3.5.0 introduces an embedded Small Language Model (SLM) that makes intelligent model selection decisions **before** prompts are sent to CLI tools. The system learns from each user's patterns over time, optimizing for both cost efficiency and task success.

### Key Principles

1. **Pre-prompt decision** - Model selected BEFORE prompt sent (no wasted credits)
2. **Zero user cost** - Embedded SLM runs locally, no API calls for routing
3. **Continuous learning** - Adapts to each user's prompt patterns and preferences
4. **Privacy-first** - All learning is local, no data leaves the machine
5. **Hidden until vetted** - Features behind Dev Mode toggle until production-ready

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART ROUTING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────────────────────────────────────┐   │
│  │   User      │    │                    FORGE CORE                    │   │
│  │   Prompt    │───▶│                                                  │   │
│  └─────────────┘    │  ┌────────────────────────────────────────────┐  │   │
│                     │  │           ROUTING ENGINE                    │  │   │
│                     │  │                                             │  │   │
│                     │  │  ┌─────────────┐    ┌─────────────────┐    │  │   │
│                     │  │  │ Embedded    │    │ CFO Calculator  │    │  │   │
│                     │  │  │ SLM         │───▶│                 │    │  │   │
│                     │  │  │ (~300MB)    │    │ Budget + Cost   │    │  │   │
│                     │  │  │             │    │ Analysis        │    │  │   │
│                     │  │  │ Predicts:   │    │                 │    │  │   │
│                     │  │  │ - Complexity│    │ Outputs:        │    │  │   │
│                     │  │  │ - Task Type │    │ - Selected Model│    │  │   │
│                     │  │  │ - Iterations│    │ - Confidence    │    │  │   │
│                     │  │  └─────────────┘    └────────┬────────┘    │  │   │
│                     │  │                              │             │  │   │
│                     │  │  ┌─────────────┐             │             │  │   │
│                     │  │  │ User LoRA   │─────────────┘             │  │   │
│                     │  │  │ Adapter     │  (personalizes predictions)│  │   │
│                     │  │  │ (~10-50MB)  │                            │  │   │
│                     │  │  └─────────────┘                            │  │   │
│                     │  └────────────────────────────────────────────┘  │   │
│                     │                       │                          │   │
│                     │                       ▼                          │   │
│                     │  ┌────────────────────────────────────────────┐  │   │
│                     │  │           EXECUTION LAYER                   │  │   │
│                     │  │                                             │  │   │
│                     │  │  1. Ensure CLI is set to selected model     │  │   │
│                     │  │  2. Send prompt to Terminal PTY             │  │   │
│                     │  │  3. Stream response back to UI              │  │   │
│                     │  └────────────────────────────────────────────┘  │   │
│                     │                       │                          │   │
│                     │                       ▼                          │   │
│                     │  ┌────────────────────────────────────────────┐  │   │
│                     │  │           FEEDBACK LOOP                     │  │   │
│                     │  │                                             │  │   │
│                     │  │  AM observes:                               │  │   │
│                     │  │  - Actual iterations taken                  │  │   │
│                     │  │  - Success/failure outcome                  │  │   │
│                     │  │  - Time to completion                       │  │   │
│                     │  │                                             │  │   │
│                     │  │  Feeds back to LoRA training                │  │   │
│                     │  └────────────────────────────────────────────┘  │   │
│                     └──────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Embedded SLM

#### 1.1 Model Selection

| Candidate | Parameters | Quantized Size | CPU Latency | Recommendation |
|-----------|------------|----------------|-------------|----------------|
| TinyLlama 1.1B | 1.1B | ~550MB (Q4) | 100-200ms | ✅ Best balance |
| Qwen2.5 0.5B | 0.5B | ~300MB (Q4) | 50-100ms | ✅ Faster, less capable |
| Phi-3 Mini | 3.8B | ~2GB (Q4) | 300-500ms | ❌ Too large |
| DistilBERT | 66M | ~250MB | 20-50ms | ⚠️ Classification only |

**Recommendation:** Start with **Qwen2.5 0.5B Q4** for minimal size, upgrade path to TinyLlama if needed.

#### 1.2 Embedding Strategy

**Option A: llama.cpp Static Link (Recommended)**
- Compile llama.cpp as static library
- Link into forge.exe via CGO
- Model weights embedded or downloaded on first run
- Single binary distribution

**Option B: Sidecar Binary**
- Ship `forge-slm.exe` alongside `forge.exe`
- Communicate via local socket/pipe
- Easier to update model independently
- Slightly more complex deployment

**Decision:** Option A (static link) for seamless UX, with model weights as separate download (~300MB) on first use.

#### 1.3 Model Location

```
~/.forge/
├── models/
│   ├── base/
│   │   └── qwen2.5-0.5b-q4.gguf    # Base model (~300MB)
│   └── adapters/
│       └── user_lora.bin            # User-specific LoRA (~10-50MB)
├── learning/
│   ├── feedback.jsonl               # Raw feedback data
│   └── training_state.json          # LoRA training progress
└── ledger.json                      # Budget tracking (existing)
```

#### 1.4 SLM Input/Output Schema

**Input:**
```json
{
  "prompt": "Debug this race condition in the mutex handler that causes deadlock under high load",
  "context": {
    "file_count": 3,
    "total_tokens": 2400,
    "file_types": ["go", "go", "go"],
    "has_error_output": true,
    "has_stack_trace": true
  },
  "budget": {
    "remaining_credits": 400,
    "days_until_reset": 8,
    "current_model": "claude-sonnet-4"
  }
}
```

**Output:**
```json
{
  "complexity": 8,
  "task_type": "debug",
  "estimated_iterations": {
    "haiku": 4,
    "sonnet": 2,
    "opus": 1,
    "gemini-3": 1
  },
  "confidence": 0.82,
  "reasoning": "Race condition debugging with stack traces typically requires multiple iterations on smaller models"
}
```

---

### 2. CFO Calculator

#### 2.1 Decision Algorithm

```go
// CalculateOptimalModel determines the best model given SLM analysis and budget
func (c *CFO) CalculateOptimalModel(analysis SLMOutput, budget BudgetState, models []ModelOption) ModelDecision {
    
    candidates := []ModelCandidate{}
    
    for _, model := range models {
        iterations := analysis.EstimatedIterations[model.ID]
        costPerIteration := model.CreditMultiplier
        totalCost := float64(iterations) * costPerIteration
        
        // Value score: capability per credit spent
        valueScore := model.Capability / totalCost
        
        // Risk adjustment: penalize if cost exceeds safe threshold
        safeThreshold := budget.Remaining / float64(budget.DaysLeft)
        riskMultiplier := 1.0
        if totalCost > safeThreshold {
            riskMultiplier = safeThreshold / totalCost // Penalize expensive options
        }
        
        adjustedScore := valueScore * riskMultiplier
        
        candidates = append(candidates, ModelCandidate{
            Model:         model,
            Iterations:    iterations,
            TotalCost:     totalCost,
            ValueScore:    valueScore,
            AdjustedScore: adjustedScore,
        })
    }
    
    // Sort by adjusted score descending
    sort.Slice(candidates, func(i, j int) bool {
        return candidates[i].AdjustedScore > candidates[j].AdjustedScore
    })
    
    winner := candidates[0]
    
    return ModelDecision{
        SelectedModel:   winner.Model.ID,
        ExpectedCost:    winner.TotalCost,
        ExpectedIters:   winner.Iterations,
        Reasoning:       buildReasoning(winner, candidates, budget),
        Alternatives:    candidates[1:3], // Show top 2 alternatives
    }
}
```

#### 2.2 Example Calculations

**Scenario: Debug task, Budget 400 credits, 8 days left**

| Model | Iterations | Cost/Iter | Total Cost | Capability | Value Score | Risk Adj | Final |
|-------|------------|-----------|------------|------------|-------------|----------|-------|
| Haiku | 4 | 0.33 | 1.32 | 6 | 4.55 | 1.0 | **4.55** |
| Sonnet | 2 | 1.00 | 2.00 | 8 | 4.00 | 1.0 | 4.00 |
| Gemini-3 | 1 | 1.00 | 1.00 | 9 | 9.00 | 1.0 | **9.00** ✅ |
| Opus | 1 | 3.00 | 3.00 | 10 | 3.33 | 1.0 | 3.33 |

**Winner: Gemini-3** (highest value per credit)

**Scenario: Same task, Budget 50 credits, 8 days left (tight budget)**

| Model | Total Cost | Safe Threshold | Risk Multiplier | Final Score |
|-------|------------|----------------|-----------------|-------------|
| Haiku | 1.32 | 6.25 | 1.0 | 4.55 |
| Sonnet | 2.00 | 6.25 | 1.0 | 4.00 |
| Gemini-3 | 1.00 | 6.25 | 1.0 | **9.00** ✅ |
| Opus | 3.00 | 6.25 | 1.0 | 3.33 |

**Winner: Still Gemini-3** (even under budget pressure, it's the best value)

**Scenario: Same task, Budget 5 credits, 8 days left (critical budget)**

| Model | Total Cost | Safe Threshold | Risk Multiplier | Final Score |
|-------|------------|----------------|-----------------|-------------|
| Haiku | 1.32 | 0.625 | 0.47 | **2.15** ✅ |
| Sonnet | 2.00 | 0.625 | 0.31 | 1.24 |
| Gemini-3 | 1.00 | 0.625 | 0.625 | 5.63 |
| Opus | 3.00 | 0.625 | 0.21 | 0.70 |

**Winner: Gemini-3 still wins** but if it fails, system would fall back to Haiku.

---

### 3. Feedback Collection (AM Integration)

#### 3.1 What AM Tracks

For each prompt execution, AM records:

```go
type PromptFeedback struct {
    // Identity
    Timestamp     time.Time `json:"timestamp"`
    PromptHash    string    `json:"prompt_hash"`     // SHA256 of prompt (privacy)
    PromptPreview string    `json:"prompt_preview"`  // First 50 chars (for debugging)
    
    // Prediction (what SLM said)
    PredictedModel      string  `json:"predicted_model"`
    PredictedIterations int     `json:"predicted_iterations"`
    PredictedComplexity int     `json:"predicted_complexity"`
    
    // Actual (what happened)
    ActualModel       string  `json:"actual_model"`       // May differ if user overrode
    ActualIterations  int     `json:"actual_iterations"`  // How many back-and-forths
    ActualTokensIn    int     `json:"actual_tokens_in"`
    ActualTokensOut   int     `json:"actual_tokens_out"`
    DurationSeconds   float64 `json:"duration_seconds"`
    
    // Outcome
    Outcome     string `json:"outcome"`      // "success", "partial", "failed", "abandoned"
    UserOverride bool  `json:"user_override"` // Did user manually switch models?
    
    // Context
    TaskType    string   `json:"task_type"`    // "debug", "explain", "refactor", etc.
    FileTypes   []string `json:"file_types"`   // ["go", "jsx", "md"]
    FileCount   int      `json:"file_count"`
}
```

#### 3.2 Iteration Detection

AM detects "iterations" by observing the conversation pattern:

```
User sends prompt → Assistant responds → User sends follow-up → Assistant responds...
```

**Iteration boundaries detected by:**
1. User input after assistant output (clear turn boundary)
2. Time gap > 5 seconds between exchanges
3. Explicit "try again" / "that didn't work" patterns in user input

#### 3.3 Outcome Detection

| Outcome | Detection Method |
|---------|------------------|
| `success` | Task completed, no follow-up needed, user moves to new topic |
| `partial` | Some follow-up needed but task eventually completed |
| `failed` | User switched models mid-task OR abandoned after multiple tries |
| `abandoned` | User stopped without completing, started different task |

---

### 4. Local LoRA Training

#### 4.1 Training Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL LORA TRAINING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  feedback.jsonl (accumulates over time)                         │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Training Trigger (runs when):                            │   │
│  │ - 50+ new feedback entries since last train              │   │
│  │ - System is idle (no active prompts)                     │   │
│  │ - User explicitly requests via Settings                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ LoRA Fine-Tuning (background, low priority)              │   │
│  │                                                          │   │
│  │ - Loads base model + existing LoRA                       │   │
│  │ - Trains on prediction errors:                           │   │
│  │   "Predicted 2 iterations, actual was 4"                 │   │
│  │ - Updates LoRA weights                                   │   │
│  │ - Saves to user_lora.bin                                 │   │
│  │                                                          │   │
│  │ Duration: 2-10 minutes depending on data size            │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  Next prediction uses updated LoRA                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.2 Training Data Format

Convert feedback to training examples:

```jsonl
{"input": "Debug race condition in mutex handler\nFiles: 3 Go files\nTokens: 2400", "output": "complexity:8 task:debug haiku:4 sonnet:2 opus:1"}
{"input": "Explain what this regex does\nFiles: 1 JS file\nTokens: 150", "output": "complexity:3 task:explain haiku:1 sonnet:1 opus:1"}
{"input": "Refactor entire authentication module\nFiles: 12 mixed files\nTokens: 8500", "output": "complexity:9 task:refactor haiku:6 sonnet:3 opus:2"}
```

#### 4.3 Training Configuration

```go
type LoRATrainingConfig struct {
    // LoRA hyperparameters
    Rank          int     `json:"rank"`           // 8-64, lower = smaller adapter
    Alpha         float64 `json:"alpha"`          // Scaling factor
    TargetModules []string `json:"target_modules"` // Which layers to adapt
    
    // Training parameters
    LearningRate  float64 `json:"learning_rate"`  // 1e-4 to 1e-5
    BatchSize     int     `json:"batch_size"`     // 1-4 for local training
    MaxSteps      int     `json:"max_steps"`      // Cap training time
    
    // Resource limits
    MaxMemoryMB   int `json:"max_memory_mb"`   // Don't exceed this RAM
    MaxCPUPercent int `json:"max_cpu_percent"` // Background priority
}

var DefaultLoRAConfig = LoRATrainingConfig{
    Rank:          16,
    Alpha:         32,
    TargetModules: []string{"q_proj", "v_proj"},
    LearningRate:  1e-4,
    BatchSize:     2,
    MaxSteps:      500,
    MaxMemoryMB:   2048,
    MaxCPUPercent: 25, // Stay in background
}
```

---

### 5. Ollama Upgrade Path

#### 5.1 Detection and Fallback

```go
func (r *RoutingEngine) GetSLM() SLMProvider {
    // Check if user prefers Ollama (from settings)
    if r.config.PreferOllama {
        if ollama := r.tryOllama(); ollama != nil {
            return ollama
        }
    }
    
    // Check if Ollama is available with a suitable model
    if ollama := r.tryOllama(); ollama != nil && r.config.UseOllamaIfAvailable {
        return ollama
    }
    
    // Fall back to embedded SLM
    return r.embeddedSLM
}

func (r *RoutingEngine) tryOllama() SLMProvider {
    // Check if Ollama is running
    resp, err := http.Get("http://localhost:11434/api/version")
    if err != nil {
        return nil
    }
    defer resp.Body.Close()
    
    // Check for suitable models
    models := r.listOllamaModels()
    for _, preferred := range []string{"qwen2.5:3b", "llama3.2:3b", "phi-3"} {
        if contains(models, preferred) {
            return NewOllamaSLM(preferred)
        }
    }
    
    return nil
}
```

#### 5.2 Ollama vs Embedded Comparison

| Aspect | Embedded (Qwen 0.5B) | Ollama (Qwen 3B) |
|--------|---------------------|------------------|
| Accuracy | Good | Better |
| Latency | 50-100ms | 100-200ms |
| Memory | ~500MB | ~2GB |
| Setup | Automatic | User installs Ollama |
| Updates | With Forge releases | Independent |

---

### 6. Settings UI

#### 6.1 New "Intelligence" Tab (Dev Mode Only)

```jsx
// Only visible when devMode === true
const IntelligenceTab = () => (
  <div>
    <h4>🧠 Smart Routing (Beta)</h4>
    
    {/* Model Status */}
    <Section title="Routing Engine">
      <StatusRow 
        label="Active Engine" 
        value={slmStatus.engine} // "Embedded SLM" or "Ollama (qwen2.5:3b)"
      />
      <StatusRow 
        label="Model Status" 
        value={slmStatus.loaded ? "✅ Ready" : "⏳ Loading..."}
      />
      <StatusRow 
        label="User Adapter" 
        value={loraStatus.trained ? `✅ Trained on ${loraStatus.samples} samples` : "⚠️ Not yet trained"}
      />
    </Section>
    
    {/* Budget (existing) */}
    <Section title="Budget">
      <BudgetProgressBar />
      <BudgetConfig />
    </Section>
    
    {/* Learning Stats */}
    <Section title="Learning">
      <StatusRow 
        label="Feedback Collected" 
        value={`${learningStats.totalSamples} prompts`}
      />
      <StatusRow 
        label="Prediction Accuracy" 
        value={`${learningStats.accuracy}%`}
      />
      <StatusRow 
        label="Last Training" 
        value={learningStats.lastTrained || "Never"}
      />
      <Button onClick={triggerTraining}>Train Now</Button>
      <Button onClick={clearLearningData} variant="danger">Reset Learning</Button>
    </Section>
    
    {/* Model Preferences */}
    <Section title="Model Preferences">
      <Dropdown 
        label="Preferred Model (budget healthy)"
        options={availableModels}
        value={prefs.healthyModel}
        onChange={...}
      />
      <Dropdown 
        label="Fallback Model (budget tight)"
        options={availableModels}
        value={prefs.fallbackModel}
        onChange={...}
      />
      <MultiSelect
        label="Never Use"
        options={availableModels}
        value={prefs.blacklist}
        onChange={...}
      />
    </Section>
    
    {/* Ollama Integration */}
    <Section title="Ollama Integration">
      <Toggle 
        label="Use Ollama if available"
        checked={prefs.useOllamaIfAvailable}
        onChange={...}
      />
      <Toggle 
        label="Prefer Ollama over embedded"
        checked={prefs.preferOllama}
        disabled={!ollamaAvailable}
        onChange={...}
      />
      <StatusRow 
        label="Ollama Status" 
        value={ollamaAvailable ? "✅ Running" : "❌ Not detected"}
      />
    </Section>
  </div>
);
```

---

### 7. File Structure

```
internal/
├── slm/
│   ├── engine.go           # SLM abstraction layer
│   ├── embedded.go         # llama.cpp integration
│   ├── ollama.go           # Ollama client
│   ├── training.go         # LoRA training pipeline
│   └── types.go            # Shared types
├── llm/
│   ├── cfo/
│   │   ├── router.go       # Existing CFO (to be enhanced)
│   │   ├── calculator.go   # New: value/risk calculations
│   │   └── cfo_test.go     # Enhanced tests
│   ├── ledger/
│   │   └── ledger.go       # Existing (unchanged)
│   └── pricing/
│       └── registry.go     # Existing (unchanged)
├── am/
│   ├── capture.go          # Existing
│   ├── feedback.go         # New: iteration tracking
│   └── learning.go         # New: feedback storage

frontend/src/
├── components/
│   ├── SettingsModal.jsx   # Add Intelligence tab (Dev Mode)
│   └── IntelligencePanel/  # New components
│       ├── BudgetWidget.jsx
│       ├── LearningStats.jsx
│       ├── ModelPrefs.jsx
│       └── OllamaStatus.jsx

~/.forge/
├── models/
│   ├── base/
│   │   └── qwen2.5-0.5b-q4.gguf
│   └── adapters/
│       └── user_lora.bin
├── learning/
│   ├── feedback.jsonl
│   └── training_state.json
└── ledger.json
```

---

### 8. API Endpoints

#### 8.1 New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/slm/status` | SLM engine status |
| GET | `/api/slm/learning` | Learning statistics |
| POST | `/api/slm/train` | Trigger LoRA training |
| DELETE | `/api/slm/learning` | Reset learning data |
| GET | `/api/slm/predict` | Test prediction (debug) |
| GET | `/api/ollama/status` | Ollama availability |
| GET | `/api/routing/preferences` | Model preferences |
| POST | `/api/routing/preferences` | Update preferences |

---

### 9. Implementation Phases

#### Phase 1: Foundation (Week 1-2)
- [ ] Embed llama.cpp into Go binary
- [ ] Download/load Qwen 0.5B model on first run
- [ ] Basic SLM inference (complexity scoring)
- [ ] Wire into CFO router (replace heuristics)
- [ ] Hide behind Dev Mode toggle

#### Phase 2: Feedback Loop (Week 3-4)
- [ ] AM tracks iterations per prompt
- [ ] Outcome detection (success/failed/abandoned)
- [ ] Feedback storage (feedback.jsonl)
- [ ] Learning stats in Settings UI

#### Phase 3: Local Training (Week 5-6)
- [ ] LoRA training pipeline
- [ ] Background training trigger
- [ ] User adapter loading on startup
- [ ] Training controls in Settings UI

#### Phase 4: Ollama Integration (Week 7)
- [ ] Ollama detection
- [ ] Ollama SLM provider
- [ ] Preference toggle in Settings
- [ ] Graceful fallback

#### Phase 5: Polish & Testing (Week 8)
- [ ] Real-world testing with AM logs
- [ ] Performance optimization
- [ ] Edge case handling
- [ ] Documentation

---

### 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routing Latency | < 150ms | Time from prompt submit to model decision |
| Prediction Accuracy | > 70% | Predicted iterations within ±1 of actual |
| Budget Efficiency | > 20% savings | Credits used vs. "always use Sonnet" baseline |
| User Override Rate | < 15% | How often users manually switch models |
| Learning Improvement | +10% accuracy | After 100 feedback samples |

---

### 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model download fails | Feature unusable | Graceful fallback to heuristics, retry logic |
| Training corrupts adapter | Bad predictions | Keep backup, validate before applying |
| SLM too slow on old hardware | Bad UX | Configurable timeout, skip if > 500ms |
| Ollama version incompatible | Ollama path broken | Version detection, clear error message |
| Privacy concerns | User distrust | Clear docs, local-only, easy data deletion |

---

### 12. Open Questions

1. **Base model choice:** Qwen 0.5B vs TinyLlama 1.1B? Need benchmarking.
2. **Training frequency:** After 50 samples? Daily? User-triggered only?
3. **Cold start:** What do we do before any feedback? Use base model's general knowledge.
4. **Cross-device sync:** Should we support syncing adapters between machines? (Future)

---

## Appendix A: Training Data Bootstrap

We will seed the base model with training data extracted from your existing AM logs.

### A.1 Data Extraction Script

```go
// Extract training data from AM conversation logs
func ExtractTrainingData(amLogDir string) ([]TrainingExample, error) {
    examples := []TrainingExample{}
    
    files, _ := filepath.Glob(filepath.Join(amLogDir, "*.json"))
    for _, f := range files {
        conv := loadConversation(f)
        
        for _, turn := range conv.Turns {
            if turn.Role != "user" {
                continue
            }
            
            // Count iterations until next user turn or end
            iterations := countIterationsAfter(conv, turn)
            outcome := detectOutcome(conv, turn)
            
            examples = append(examples, TrainingExample{
                Prompt:     turn.Content,
                Model:      detectModel(conv),
                Iterations: iterations,
                Outcome:    outcome,
                Complexity: estimateComplexity(turn.Content),
            })
        }
    }
    
    return examples, nil
}
```

### A.2 Initial Dataset Size

Target: 500-1000 examples from your AM logs for initial fine-tuning.

---

## Appendix B: Prompt Templates

### B.1 SLM Analysis Prompt

```
Analyze this coding task and predict model requirements.

TASK:
{user_prompt}

CONTEXT:
- Files: {file_count} files ({file_types})
- Estimated tokens: {token_count}
- Contains error output: {has_errors}
- Contains stack trace: {has_stack}

Respond with JSON:
{
  "complexity": 1-10,
  "task_type": "debug|explain|refactor|generate|simple",
  "iterations": {
    "haiku": N,
    "sonnet": N,
    "opus": N
  },
  "reasoning": "brief explanation"
}
```

### B.2 CFO Decision Prompt (for Ollama upgrade path)

```
You are a budget optimizer for AI model selection.

TASK ANALYSIS:
{slm_output}

BUDGET STATE:
- Remaining: {remaining} credits
- Days until reset: {days}
- Safe daily spend: {safe_daily}

AVAILABLE MODELS:
{model_table}

Select the optimal model. Consider:
1. Can cheaper models handle this with acceptable iteration count?
2. Is the budget healthy enough for expensive models?
3. What's the best value (capability per credit)?

Respond with JSON:
{
  "selected_model": "model_id",
  "expected_cost": N.NN,
  "reasoning": "brief explanation"
}
```

---

*End of Design Specification*
