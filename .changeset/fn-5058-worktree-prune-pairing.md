---
"@runfusion/fusion": patch
---

Pair raw worktree directory deletions in the engine with best-effort `git worktree prune` to prevent stale admin-entry leaks.
