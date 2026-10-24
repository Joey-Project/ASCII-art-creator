---
id: 20261024-v2212-event
title: Codex Review Gate v2.2.13 Consumer Event Upgrade
status: completed
created: 2026-10-24
updated: 2026-10-24
branch: wip/review-gate-stacked-retarget
pr: https://github.com/Joey-Project/ASCII-art-creator/pull/16
supersedes: []
superseded_by:
---

# Codex Review Gate Event Upgrade

## Summary

- Replaced the v2.2.12 edited-event bypass with the canonical v2.2.13 verifier/controller pair.

## Current State

- All six configured `pull_request` activity types now run the same verifier job. Edited events no longer skip the check or use a dynamic ignored-edit run title.
- The stable `codex-review-gate-verifier/<PR>/<SHA>` title matches the controller's expected workflow-run prefix. Verifier concurrency remains scoped to one cancellable group per pull request.
- The controller is unchanged. The floating `@v2` action, configurable runner labels and fallback, token and request settings, limits profile, and permission envelope remain canonical.
- No production rulesets or repository settings were changed.

## Evidence

- Both workflow files match the v2.2.13 canonical consumer pair byte-for-byte. Exported canonical validators and `git diff --check` pass.
- Installed actionlint 1.7.12 reports only `invalid activity type "stacked" for "pull_request" Webhook event.`; the same known schema limitation applies to the canonical verifier.
- These are local workflow checks only; no remote CI or runtime execution is claimed.
