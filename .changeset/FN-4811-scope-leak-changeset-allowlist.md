---
"@runfusion/fusion": patch
---

fix(FN-4811): scope-leak guard always allows `.changeset/` paths

The `[scope-leak]` warning was firing on many in-progress tasks for off-scope `.changeset/FN-XXXX-*.md` files (the reproducible signature on FN-4789, FN-4801, FN-4818). By convention every task may add its own changeset entry under `.changeset/` per AGENTS.md's "Finalizing Changes" section, so changeset files are now treated as always-allowed by the scope-leak guard regardless of the task's declared file scope. Cross-task changeset leakage is still caught by stronger downstream guards (file-scope invariant at squash, post-merge audit) at a much higher signal-to-noise ratio.
