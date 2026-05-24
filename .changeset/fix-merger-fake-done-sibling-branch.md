---
"@fusion/core": patch
"@fusion/engine": patch
---

fix(merger): two root-cause fixes for tasks landing in Done with no commit on main

**Bug 1: sibling fusion/fn-\* branch as merge target** — `resolveTaskMergeTarget`
previously returned `task.baseBranch` unconditionally before falling back to the
project default. When a task was dispatched as a sibling/dependent off another
in-flight task's worktree, `baseBranch` ended up as the upstream's
`fusion/fn-<id>` branch. The merger then detached onto that sibling, squashed
on top of it, and advanced `refs/heads/fusion/fn-<id>` — never main. FN-5233's
squash (`84563e549`) stranded on `fusion/fn-5339`; FN-5530's
(`4140a3e0a`) stranded on `fusion/fn-5543`. The resolver now refuses any
`fusion/fn-\*` candidate as a merge destination and falls through to the
project default. The merger emits a new `merge:merge-target-rejected-fusion-sibling`
audit event so the upstream `baseBranch`-propagation bug stays observable.

**Bug 2: deadlock-recovery mis-attributed tasks to unrelated commits** —
`findLandedTaskCommit` step (4) used `git log --grep=FN-XXXX` which matches the
entire commit message (not just the subject) and blindly accepted the first
hit. FN-5441 and FN-5446 were both marked done against `e3dbfaae` — an
FN-5483 commit whose body merely *mentioned* them by name in a paragraph about
a refusal. The grep fallback now fetches each candidate's body and re-verifies
ownership via a tightened `commitOwnedByTask`: trailers must be line-anchored
(`(?:^|\n)Fusion-Task-Id: <id>(?:\n|$)`), and the subject fallback must match
a conventional-commit form (`<type>(<id>):` or `<id>:`), not a substring.
Prose mentions can no longer claim a task.

The historical recovery for FN-5233 has been cherry-picked to main as
`2d2e5b809`. The other 11 affected tasks (FN-5441, FN-5446, FN-5472, FN-5484,
FN-5487, FN-5490, FN-5515, FN-5517, FN-5526, FN-5539, FN-5540, FN-5542)
remain in Done but need separate triage — 3 look like legitimate
verification-only no-ops, the remaining 9 likely lost real work.
