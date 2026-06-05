---
id: 20260605-17e5af6-preview-fit
title: Preview Fit Sizing
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/fix-preview-fit
pr:
supersedes: []
superseded_by:
---

# Preview Fit Sizing

## Summary

- Fix preview fit so small generated mosaics can scale up to the available preview frame.
- Keep the generated canvas contained by the available preview width and height instead of capping fit at 100%.
- Pin the workspace preview frame to the flexible grid row so hidden source-editor content cannot collapse the preview area.

## Current State

- `Fit` computes the contain scale from the rendered preview frame after subtracting frame padding.
- The preview workspace uses explicit grid areas for toolbar, source editor, preview, and stats rows.
- When the source editor is hidden, the preview frame remains the only flexible row and receives the remaining vertical space.
- A desktop E2E regression test verifies that a small mosaic fills the available frame while staying contained.

## Next Steps

- None for this workstream.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 8 files / 43 tests passed
- E2E coverage: 29 passed / 3 skipped across desktop and mobile projects
