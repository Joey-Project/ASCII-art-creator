---
id: 20260605-17e5af6-preview-fit
title: Preview Fit Sizing
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/fix-preview-fit
pr: 6
supersedes: []
superseded_by:
---

# Preview Fit Sizing

## Summary

- Fix preview fit so small generated mosaics can scale up to the available preview frame.
- Keep the generated canvas contained by the available preview width and height instead of capping fit at 100%.
- Pin the workspace preview frame to the flexible grid row so hidden source-editor content cannot collapse the preview area.
- Give mobile preview workspaces a fixed small-viewport height and smaller narrow-screen preview padding so portrait images can keep scaling when vertical space is available without letting the previous canvas size stretch the fit frame.

## Current State

- `Fit` computes the contain scale from the rendered preview frame after subtracting frame padding.
- The preview workspace uses explicit grid areas for toolbar, source editor, preview, and stats rows.
- When the source editor is hidden, the preview frame remains the only flexible row and receives the remaining vertical space.
- A desktop E2E regression test verifies that a small mosaic fills the available frame while staying contained.
- A mobile E2E regression test verifies that a portrait source can fit to the available preview width without exceeding the frame height.
- A mobile resize E2E regression test verifies that a fitted preview shrinks again after the viewport height is reduced.

## Next Steps

- None for this workstream.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 8 files / 43 tests passed
- E2E coverage: 31 passed / 5 skipped across desktop and mobile projects
- Manual mobile probe with `/Users/hoteng/Downloads/Hatsune_miku_v2.png` at 390x844: preview frame increased from about 362x417 to 362x670, canvas increased from about 262x391 to 344x514, and Fit increased from 30% to 39%.
- Manual mobile resize probe with the same image at 390x1100 then 390x500: before the fixed-height workspace change, the shrunken viewport still left the workspace at about 706px high; after the change, workspace height followed 500px and ResizeObserver refit the canvas from about 344x514 to 206x308.
