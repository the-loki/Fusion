---
"@runfusion/fusion": patch
---

Engine reliability: post-session branch-attribution audit catches contamination within minutes instead of days.

- The executor already checks branch contamination at *acquisition* time (`assertCleanBranchAtBase`) and at *reclaim* time. The gap was the *active session window* itself: commits added to `fusion/<id>` between acquisition and merge handoff went undetected until merge-time refusal, which is how FN-5233 ended up with two untrailered `feat(FN-5353):` commits sitting on `fusion/fn-5233`.
- New `reportBranchAttribution(repoDir, branch, baseSha, taskId)` walks `base..branch` and classifies every commit into four buckets: `ownTrailed` (subject tag + `Fusion-Task-Id` trailer — healthy), `ownUntrailed` (subject tag but missing trailer — signals the commit-msg hook didn't fire), `foreign` (different FN-id via subject or trailer — contamination), and `unattributed` (neither — typically a hand-merge or plumbing commit).
- Wired into the executor's post-session path (right after `captureModifiedFiles`): if any anomaly bucket is non-empty, the executor logs a structured `branch:attribution-anomaly` audit event and a task log entry. Failures in the audit itself are caught and warn-only — the audit must never destabilize a completing session. New `branch:attribution-anomaly` and `branch:auto-reattach-authoritative` git-mutation types accept the structured metadata.
- Five new vitest cases cover the four anomaly buckets and the empty-range no-op.
