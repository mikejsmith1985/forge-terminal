# Documentation Organization

This directory contains all project documentation organized by audience and lifecycle.

## Structure

```
docs/
├── user/                    # End-user documentation
│   ├── getting-started.md
│   ├── features.md
│   └── llm-logging-guide.md
│
├── developer/              # Developer documentation  
│   ├── local-dev-guide.md
│   ├── release-process.md
│   └── architecture.md
│
└── sessions/              # Temporary session docs (gitignored)
    ├── 2025-12-08-am-logging/
    │   ├── analysis.md
    │   ├── implementation.md
    │   └── testing.md
    └── archive/           # Old session docs
```

## Documentation Types

### User Documentation (`user/`)
Documentation for people using Forge Terminal:
- Getting started guides
- Feature documentation
- Troubleshooting guides
- FAQ

**Audience:** End users  
**Lifecycle:** Permanent

### Developer Documentation (`developer/`)
Documentation for people developing Forge Terminal:
- Development setup
- Architecture overview
- Release process
- Contributing guidelines
- API documentation

**Audience:** Contributors and maintainers  
**Lifecycle:** Permanent

### Session Documentation (`sessions/`)
Temporary documentation from Copilot sessions:
- Problem analysis
- Implementation plans
- Investigation notes
- Test reports
- Work-in-progress docs

**Audience:** Current development team  
**Lifecycle:** Temporary (auto-cleanup after 30 days)

## Cleanup

Session documentation is automatically excluded from git (see `.gitignore`).

To clean up old session docs manually:
```bash
scripts/cleanup-session-docs.sh [days]
```

Default is 30 days. Example:
```bash
scripts/cleanup-session-docs.sh 14  # Clean docs older than 14 days
```

## Root Documentation

Only these files remain in the project root:
- `README.md` - Main project readme
- `PROJECT_CHARTER.md` - Project vision and goals

All other documentation belongs in this `docs/` directory.

## For Copilot

See `.github/copilot-instructions.md` for documentation placement rules.

**TL;DR:** Put conversational/session docs in `docs/sessions/YYYY-MM-DD-topic/`
