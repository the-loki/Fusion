---
"@fusion/dashboard": patch
---

fix(dashboard): remove duplicate integration-advances UI; Sync working tree is now pure-local (no origin fetch)

**Removed duplicate UI** — Git Manager → Status had two overlapping sections rendering the same data: a `Sync local tip` button + a `Recent integration advances` list, sitting above the highlighted `Recent integration-branch advances` block (the one with the lost-work warnings). Deleted the duplicate (`gm-integration-actions` + `gm-recent-advances`) along with the dead `mergeAdvanceEvents` state, fetcher, and SSE subscription that only fed it.

**Sync working tree is now pure-local** — for the "N need action" case the merger has already advanced `refs/heads/<integration>` locally and the worktree just needs to follow. Previously the button called the integration-mode pull which ran `tryFastForwardFromOrigin` first, silently pulling in unrelated remote commits. New `skipOriginFetch` option on `PullGitBranchOptions.integration` (and the matching `POST /api/git/pull` body field) skips the origin step entirely. The Sync button passes `skipOriginFetch: true`, so the sequence is: auto-stash → `git reset --hard refs/heads/<integration>` → restore stash. Origin is not touched.

Help disclosure updated to match the new behavior.
