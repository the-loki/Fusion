---
"@runfusion/fusion": patch
---

Worktree setup now removes `packages/desktop/dist` and `packages/desktop/dist-electron` from acquired task worktrees to avoid carrying stale ~900MB Electron build artifacts across recycled worktrees.
