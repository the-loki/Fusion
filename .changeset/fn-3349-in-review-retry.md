---
"@runfusion/fusion": patch
---

Retrying failed `in-review` tasks now keeps them in `in-review` and only clears retry/error state so auto-merge can re-attempt without resetting task worktree state.
