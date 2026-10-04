---
id: 20261004-cg001
title: Codex Review Gate V2 Consumer Migration
status: active
created: 2026-10-04
updated: 2026-10-04
branch: codex/install-review-gate-v2-20261004
pr:
supersedes: []
superseded_by:
---

# Codex Review Gate V2 Consumer Migration

## Summary
- Replace the dedicated v1 review-gate producer with the canonical v2 verifier and controller for default-branch pull requests.

## Current State
- The v2 verifier and controller match the canonical consumer templates; the verifier requests `actions: read` and the canonical author-permission setting.
- The controller and `.github/CODEOWNERS` protect the workflow control plane under `@JoeyTeng`; unrelated CI and Pages workflows remain unchanged.
- Repository ruleset transitions remain coordinator-owned and are not part of this consumer installation.

## Temporary Merge Maintenance Window
- This consumer removes the v1 producer before the existing `codex/review-gate` requirement is retired. Until the coordinator activates v2, verifies its native required context, and then retires v1, ordinary same-repository PRs targeting the default branch remain blocked with the legacy context `Expected`. This is an intentional, temporary fail-closed maintenance window, not a completed or permanent state; pause other merges during it.
- Before ordinary merges resume, validate native v2 on one separate default-base, same-repository canary PR and leave that canary unmerged. The coordinator then performs the approved v2 activation/readback and v1 retirement; resume ordinary PR merges only after that readback.
- This installation covers ordinary same-repository PRs targeting the default branch only. It does not claim support for, or restore requirements on, `release/*` branches.

## Next Steps
- Run the separate unmerged default-base canary, then complete the coordinator-owned v2 activation/readback and v1 retirement. Keep `release/*` policy out of this migration.

## Evidence
- Canonical consumer installation runbook: `JoeyTeng/codex-review-gate` `docs/install/agent.md`.
