---
name: code-tutor-workflow
description: "Integrates Code Tutor with enterprise workflow. Activates on keywords: tutor, teach, explain, walkthrough, learn, understand."
---

# Code Tutor Integration

## Behavior

When Code Tutor is active in the workflow:

1. **File change notifications** — When files are created or modified, the system sends a notification: "N files changed — want a walkthrough?"
2. **Explanation depth levels:**
   - **Overview** — General, mildly technical summary suitable for project managers
   - **Technical** — Standard developer-level explanation of logic and patterns
   - **Line-by-Line** — Detailed walk-through of every significant line
3. **Quality auditing** — Tutor explanations flag naming violations, missing comments, and readability concerns

## Agent Integration

When creating or modifying files with Code Tutor active:

1. Write code that is optimized for learning — clear structure, logical flow
2. Add brief inline comments on non-obvious logic (the "why" moments)
3. Use architecture decision blocks for significant structural decisions
4. Ensure every public/exported symbol has a documentation comment
