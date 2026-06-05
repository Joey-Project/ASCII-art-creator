---
id: 20260605-17e5af6-minimal-defaults
title: Minimal Default Candidate Selection
status: completed
created: 2026-06-05
updated: 2026-06-05
branch: wip/minimal-defaults
pr:
supersedes: []
superseded_by:
---

# Minimal Default Candidate Selection

## Summary

- Reduce default candidate selection to ASCII, one built-in font, and one weight.
- Clarify that user-entered glyphs are added on top of selected glyph packs unless packs are unchecked.
- Rename the math glyph pack to `Math Symbols`.

## Current State

- ASCII remains the only default glyph pack.
- Monospace is the only default selected font.
- `400 Regular` is the only default selected font weight.
- Font search still uses fuzzy matching by default with an exact-match toggle.
- User-facing docs and architecture notes describe the lighter default selection.

## Next Steps

- None for this workstream.

## Evidence

- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 9 files / 46 tests passed
- E2E coverage: 28 passed / 2 skipped across desktop and mobile projects
