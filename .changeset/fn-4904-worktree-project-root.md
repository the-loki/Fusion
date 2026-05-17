---
"@runfusion/fusion": patch
---

Fix `fn_task_show`, `fn_task_list`, and other pi-extension task tools so they resolve the canonical project root when invoked from inside a Fusion task worktree, instead of binding to a stray worktree-local `.fusion` database.
