---
"@fusion/dashboard": patch
---

fix(dashboard): unbreak Merge Advance Notice banner dismiss and suppress when auto-sync already handled it

Two bugs were keeping the banner stuck on screen even when there was nothing for the user to do:

- **Dismiss was dead.** The `notice` memo never applied `dismissedShas`, so clicking the close button (or a successful Pull, which calls `dismiss()` after the API returns) updated localStorage but the same advance event kept matching the filter and the banner re-rendered immediately.
- **Auto-sync success was ignored.** With the new `mergeAdvanceAutoSync` setting at its `stash-and-ff` default, the merger snaps the project-root checkout forward as part of the merge — there is nothing left to pull. The banner kept appearing anyway because the route's `autoSync` payload wasn't consulted. Clicking Pull then hit `/api/git/pull`, which fetched origin (no change, since the merger only advanced the local ref) and returned `pull-clean` with no actual work done.

The `notice` memo now (a) filters out `dismissedShas`, and (b) suppresses any advance event whose `autoSync` entry for the *current user's* `worktreePath` reports `clean-sync` or `synced-with-edits-restored`. Conflict and skipped outcomes (`synced-with-pop-conflict`, `skipped-dirty`, `skipped-*`, `failed`) still surface the banner so the user can recover.

Banner suppression checks the per-worktree path, so a multi-checkout project where auto-sync handled one root and a sibling root is still stale will keep showing the banner on the stale one.
