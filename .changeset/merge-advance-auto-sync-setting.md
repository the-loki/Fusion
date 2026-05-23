---
"@fusion/core": minor
---

feat(core): add `mergeAdvanceAutoSync` project setting (`"off" | "ff-only" | "stash-and-ff"`)

Adds the schema for a new project setting that controls what happens in **other** worktrees still checked out on the integration branch when the merger advances the branch ref. Previously the merger only updated `refs/heads/<branch>` and left every other checkout's index and working tree pinned at the old tip, so `git status` in the user's project-root checkout reported the new commits as inverted "staged changes to be committed."

Modes (default `"stash-and-ff"`):
- `"off"` — preserve the legacy behavior; user must `git pull` or click the Merge Advance Notice banner Pull button.
- `"ff-only"` — auto-fast-forward only clean worktrees; dirty worktrees stay untouched and the banner still surfaces.
- `"stash-and-ff"` — run the Smart Pull pipeline (stash → fast-forward → pop). Pop conflicts emit `merge:auto-sync` audit events with `outcome: "stash-pop-conflict"` and surface through the existing dashboard stash-conflict modal.

Schema-only in this changeset; the merger hook that consumes the setting lands in the follow-up engine change.
