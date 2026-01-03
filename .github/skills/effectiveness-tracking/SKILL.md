---
name: effectiveness-tracking
description: Tracks task success metrics to improve future model routing. Use when completing any implementation, refactor, bugfix, or testing task.
---

# Effectiveness Tracking Protocol

## On Task Completion

After tests pass and task is complete, log effectiveness data for smart routing learning.

## Required Metrics

1. **Task Pattern:** Which pattern did this task follow?
   - `architecture` - System design, integration planning
   - `multi-file-refactor` - Restructuring 5+ files
   - `bugfix` - Fixing broken functionality
   - `feature` - Adding new capability (2-5 files)
   - `testing` - Writing test coverage
   - `documentation` - Markdown/docs updates

2. **Model Used:** Which model completed this task
   - Example: `claude-sonnet-4.5`, `claude-opus-4.5`, `gpt-5`

3. **Prompts Used:** Total conversation turns to completion
   - Count from task start to passing tests

4. **Success:** Did tests pass?
   - `true` or `false`

5. **Timestamp:** When completed
   - ISO 8601 format

## Storage Format

Append to `dev-data/effectiveness-log.jsonl` (JSON Lines format):

```json
{"pattern":"multi-file-refactor","model":"claude-sonnet-4.5","prompts":2,"success":true,"timestamp":"2026-01-03T12:00:00Z","files_changed":7}
{"pattern":"bugfix","model":"claude-haiku","prompts":1,"success":true,"timestamp":"2026-01-03T12:15:00Z","files_changed":1}
{"pattern":"feature","model":"claude-opus-4.5","prompts":3,"success":true,"timestamp":"2026-01-03T12:30:00Z","files_changed":4}
```

## Querying Historical Data

Before starting complex tasks, query effectiveness log:

```javascript
// Example: What's the best model for multi-file refactor?
const logs = readJsonLines('dev-data/effectiveness-log.jsonl');
const pattern = logs.filter(l => l.pattern === 'multi-file-refactor' && l.success);

const byModel = groupBy(pattern, 'model');
const avgPrompts = {
  opus: average(byModel.opus.map(l => l.prompts)),
  sonnet: average(byModel.sonnet.map(l => l.prompts)),
  haiku: average(byModel.haiku.map(l => l.prompts))
};

// Recommend model with lowest average prompts
```

## Integration with Smart Router

The effectiveness log feeds the smart routing recommendation engine:

1. User starts task → pattern detected
2. Query log for similar past tasks
3. Calculate average prompts by model
4. Recommend model with best effectiveness (fewest prompts)
5. Show cost as secondary info

## Example Recommendation

```
📊 Smart Router Recommendation

Task Pattern: Multi-file refactor (7 files)
Historical Data: 15 similar tasks

Model Performance:
  • Opus:   avg 2.3 prompts (90% success) ← RECOMMENDED
  • Sonnet: avg 4.8 prompts (75% success)
  • Haiku:  avg 8.2 prompts (50% success)

Cost Delta: +0.8 credits for Opus vs Sonnet
Prompts Saved: ~2.5 prompts (worth the cost)
```

## Auto-Logging

If possible, log automatically on task completion:

```javascript
// Backend middleware example
app.post('/api/task/complete', (req, res) => {
  const log = {
    pattern: classifyTask(req.body.description),
    model: req.body.model,
    prompts: req.body.conversationLength,
    success: req.body.testsPassed,
    timestamp: new Date().toISOString(),
    files_changed: req.body.filesChanged
  };
  
  appendToFile('dev-data/effectiveness-log.jsonl', JSON.stringify(log) + '\n');
});
```
