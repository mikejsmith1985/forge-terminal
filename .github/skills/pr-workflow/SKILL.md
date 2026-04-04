---
name: pr-workflow
description: "Enforces pull request standards. Activates on keywords: PR, pull request, merge, review, code review."
---

# Pull Request Workflow

## PR Requirements

1. **Title:** Clear, descriptive — matches commit message format (`type: description`)
2. **Description:** Explain WHY, not just WHAT. Link to related issues.
3. **Checklist:** Complete the PR template checklist (all items checked)
4. **CHANGELOG:** MUST be updated if the PR changes functionality
5. **Tests:** All new/changed code must have tests. CI must pass.
6. **Review:** At least one approval required before merge.

## Merge Strategy

- **Feature branches:** Squash merge (clean single commit on main)
- **Release branches:** Merge commit (preserve release history)
- **Hotfix branches:** Squash merge

## After Merge

1. Delete the feature branch
2. Verify CI passes on main
3. If applicable, tag a release
