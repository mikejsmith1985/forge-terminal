---
date: 1970-01-01
topic: TOPICS
status: active
related_issues: []
related_commits: []
future_scope: []
---

# Session Document Topics Taxonomy

This file defines the standard topic tags used in session document frontmatter.
Each session doc must use exactly ONE topic from this list.

## Topic Categories

### Core Features
- **assistant** - AI assistant, model selection, responses, training
- **am-logging** - Artificial Memory logging, output capture, session recovery
- **ui-features** - UI components, sidebar, resizable elements, layout
- **backend** - Backend services, PTY, WebSocket, terminal infrastructure
- **commands** - Command cards, shortcuts, command management

### Release & Deployment
- **release** - Release automation, versioning, build process
- **macos** - macOS-specific issues (codesigning, notarization, fork compatibility)
- **windows** - Windows-specific issues (PowerShell, WSL, paths)

### Documentation & Process
- **documentation** - Doc structure, guidelines, tooling, organization
- **refactoring** - Code refactoring, cleanup, tech debt
- **testing** - Test improvements, coverage, automation
- **performance** - Optimization, benchmarking, profiling

### Bug Fixes & Issues
- **bug-fix** - Debugging investigations and resolutions
- **issue-analysis** - Analysis of specific GitHub issues
- **security** - Security concerns, fixes, authentication

### Maintenance
- **dependencies** - Package updates, dependency management
- **infrastructure** - Build system, CI/CD, tooling
- **investigation** - Exploratory analysis, spike work

---

## Usage

In session document frontmatter:
```yaml
topic: assistant  # Must be from this list
```

### Validation

The `validate-session-frontmatter.sh` script checks that all session docs use valid topics from this list.

Invalid topics will cause validation to fail:
```bash
❌ Invalid topic: "ai-stuff" (not in taxonomy)
✅ Valid topic: "assistant" (in taxonomy)
```

---

## Adding New Topics

To add a new topic:
1. Add it to this file under appropriate category
2. Update any search/index scripts
3. Document the new topic in the Category description

---

**Last Updated**: 2025-12-09
