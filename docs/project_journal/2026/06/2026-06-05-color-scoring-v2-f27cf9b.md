---
id: 20260605-f27cf9b-color-scoring-v2
title: Color Scoring V2
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/color-scoring-v2
pr:
supersedes: []
superseded_by:
---

# Color Scoring V2

## Summary

- Add user-controlled color influence for candidate selection in color mode.
- Score projected output color for source, uniform, grouped, and intrinsic-colored glyph candidates.
- Keep feature matching as the base ranking path, with color influence able to be disabled.

## Current State

- Color-mode candidate scoring now blends the active background with the candidate foreground according to glyph density, then compares that projected average output color with the source cell average.
- The Color influence slider ranges from `0` to `2`; `0` disables color-aware selection, `1` is the balanced default, and values above `1` make color similarity more competitive against shape and texture.
- Source and uniform strategies can now affect candidate selection for recolorable glyphs because density changes how much foreground and background appear in the final cell.
- Intrinsic colored glyphs still use sampled native color for scoring; weak intrinsic color blends with the app-assigned foreground before projection.
- Candidate-selection invalidation now includes color influence, background/transparent-background semantics, and uniform foreground when those settings can affect selected glyphs.
- Review hardening: projected color distance is calculated directly in RGB space so cell-specific projection colors do not become unbounded module-level cache keys.

## Next Steps

- None for this workstream.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Project journal validation: `project_journal.py validate --repo /Users/hoteng/Program/GitHub/Joey-Project/ASCII-art-creator`
- Unit coverage: 10 files / 65 tests passed
- E2E coverage: 33 passed / 5 skipped across desktop and mobile projects
