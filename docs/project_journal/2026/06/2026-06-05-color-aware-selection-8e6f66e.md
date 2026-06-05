---
id: 20260605-8e6f66e-color-aware-selection
title: Color-Aware Candidate Selection
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/color-aware-selection
pr:
supersedes: []
superseded_by:
---

# Color-Aware Candidate Selection

## Summary

- Add source-average-color influence to candidate selection for grouped color strategies.
- Keep the existing density bucket prefilter and feature distance as the primary matching path.
- Leave intrinsic colored glyph and emoji sampling for a separate follow-up.

## Current State

- `glyph`, `font`, and `glyph-font` color strategies add a bounded RGB-distance penalty between the source cell average color and the candidate's grouped foreground color.
- `source` and `uniform` strategies remain feature-only during candidate selection because candidate color is either already the source color or identical for every candidate.
- Switching into, between, or out of grouped color strategies marks the current mosaic stale so exports cannot reuse glyphs chosen under a different selection policy.
- The preview still redraws immediately for grouped color strategy changes, so users can see the visual color strategy update before regenerating candidate choices.
- The matcher now accepts an optional candidate scoring hook, allowing future worker or index implementations to keep feature indexing separate from caller-specific ranking policy.

## Next Steps

- Implement intrinsic colored glyph and emoji sampling in a separate workstream.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 10 files / 50 tests passed
- E2E coverage: 33 passed / 5 skipped across desktop and mobile projects
