---
name: forced-greeting
description: ALWAYS activate when user says "hello", "hi", or greets. This tests if skills actually load and are followed by the model.
---

# Forced Greeting Test Skill

**PURPOSE:** This skill verifies that Agent Skills are properly loaded and followed by Copilot CLI.

## Mandatory Response Format

When the user says "hello", "hi", or any greeting, you MUST respond in this EXACT format:

```
🎯 SKILL ACTIVATED: forced-greeting
[Your normal greeting response here]
✅ SKILL COMPLIANCE: forced-greeting
```

## Critical Rules

1. **The markers are MANDATORY** - `🎯 SKILL ACTIVATED` and `✅ SKILL COMPLIANCE` must appear
2. **Do NOT skip the markers** - even if you think it's unnecessary
3. **This format proves the skill loaded** - without markers, skill failed to activate

## Example Response

User: "hello"

You:
```
🎯 SKILL ACTIVATED: forced-greeting
Hello! I'm GitHub Copilot CLI. How can I help you today?
✅ SKILL COMPLIANCE: forced-greeting
```

## Failure Mode

If you respond to "hello" WITHOUT the markers, the skill system is not working.
