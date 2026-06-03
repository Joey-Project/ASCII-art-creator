---
id: 20260603-59fb6c9-source-editor
title: Source Image Editor
status: completed
created: 2026-06-03
updated: 2026-06-03
branch: wip/source-image-editor
pr:
supersedes: []
superseded_by:
---

# Source Image Editor

## Summary

- Add a browser-local source editing step between uploaded images and mosaic generation.
- Keep original image data, replayable edit operations, and confirmed canvas cache separate.
- Support crop, expand crop with transparent padding, 90 degree rotation, free rotation, horizontal/vertical flip, reset all, and feature-specific reset.

## Current State

- Uploading a new image opens the source editor and waits for `Confirm` before generation.
- `Load sample` remains a direct-generate fast path, with `Edit source` available afterwards.
- The editor blocks generation and source-editor reopening while unconfirmed edits are open, so a previous source cannot silently replace the current upload.
- Edit operations replay in user order. Free-rotation clipping is deferred until final render so a later expanded crop can include content that would otherwise be clipped.
- Interactive crop/rotate previews cache the replay stage before the active operation and coalesce pointer-driven redraws with `requestAnimationFrame`.
- The generator continues to consume the same image/canvas source interface after confirmation.

## Next Steps

- None for this workstream.

## Evidence

- User-facing docs: `README.md`
- Design doc: `docs/design/architecture.md`
- Validation: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`
- Unit coverage: 8 files / 40 tests passed
- E2E coverage: 13 passed / 1 skipped across desktop and mobile projects
- Internal review: `codex-readonly` isolated review `.codex-tmp/isolated-review-ieo00xdn`, final artifact `LGTM`
