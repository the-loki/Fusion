---
"@gsxdsm/fusion": patch
---

Fix failed status badge persisting when moving tasks from in-progress to todo/triage

Previously, when a failed task was moved from "in-progress" back to "todo" or "triage" for retry, the `status: "failed"` and `error` fields were not cleared. This caused the dashboard to continue showing the red "failed" badge even though the task was ready for re-execution.

The `moveTask` function now clears `status`, `error`, `worktree`, and `blockedBy` fields when moving from "in-progress" to "todo" or "triage", consistent with the existing behavior when moving to "done".
