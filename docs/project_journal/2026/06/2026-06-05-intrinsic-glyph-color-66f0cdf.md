---
id: 20260605-66f0cdf-intrinsic-glyph-color
title: Intrinsic Glyph Color Sampling
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/intrinsic-glyph-color
pr:
supersedes: []
superseded_by:
---

# Intrinsic Glyph Color Sampling

## Summary

- Sample native rendered color for glyph candidates whose browser rendering is not purely recolorable.
- Use the sampled intrinsic color during color-aware candidate scoring, especially for emoji.
- Keep the output model static and GitHub Pages friendly; no server-side font or emoji processing is required.

## Current State

- Glyph sampling still extracts alpha/density features for shape matching, but now also records an alpha-weighted average intrinsic color and a color-strength score when rendered pixels are visibly non-black.
- Dark native glyphs are checked with a high-saturation probe render so emoji such as black circles or hearts are still recognized as intrinsic colored glyphs instead of recolorable text.
- In color mode, strong intrinsic glyph color overrides app-assigned grouping color for candidate scoring; weaker intrinsic color blends with the assigned color.
- Source and uniform strategies remain feature-only for recolorable glyphs, but intrinsic colored glyphs compare their sampled native color against the source cell average.
- Mono mode remains feature-only so grayscale matching behavior is unchanged.
- Switching between mono and color source/uniform marks the mosaic stale because intrinsic color can change candidate selection; switching between source and uniform inside color mode stays visual-only.

## Next Steps

- Keep browser compatibility notes open for platform-specific emoji and font fallback behavior.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 10 files / 56 tests passed
- E2E coverage: 33 passed / 5 skipped across desktop and mobile projects
