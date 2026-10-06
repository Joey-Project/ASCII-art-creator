---
id: 20261005-crc01
title: Completion Report Controller Update
status: completed
created: 2026-10-05
updated: 2026-10-06
branch: codex/completion-report-v217
pr:
supersedes: []
superseded_by:
---

# Completion Report Controller Update

## Summary

- Route verifier workflow completions through the published v2.1.7 controller contract.

## Current State

- The controller binds workflow-run events to the repository verifier workflow and uses metadata-only `report-completion` by default.
- `begin-review` and review requests remain limited to the configured automatic-request path for a first failed run associated with one pull request.
- Workflow-run path matching accepts only the exact verifier path or its `@refs/pull/.../merge` form; unassociated runs fall back to workflow-run/run IDs for distinct concurrency keys instead of sharing an empty key.
- Verifier permissions, controller triggers and permissions, runner selection, CODEOWNERS, and repository rules/variables remain unchanged.

## Next Steps

- No additional repository file changes are required for this slice. Deployment completion remains subject to the protected PR delivery and live completion-observer evidence.

## Evidence

- `cmp -s`: controller byte-matched the published v2.1.7 canonical template.
- `actionlint`: passed for the verifier and controller workflows.
- Prettier 3.8.3 `--check`: passed for the controller workflow and this journal note.
- `project_journal.py validate --repo <repository>`: passed.
- `git diff --check`: passed.
- Bootstrap default dry-run (`--prepare-worktree`, without `--apply`): verifier, controller, and CODEOWNERS already matched canonical state; no files were written.
