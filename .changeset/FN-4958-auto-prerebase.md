---
"@runfusion/fusion": patch
---

Add a merger auto-prerebase policy that can rebase task branches onto local main before the existing Stage 1/2 rebase cascade when divergence from `task.baseCommitSha` crosses a threshold or touches configured shared-infra hot files. This introduces project settings `prerebaseAutoEnabled`, `prerebaseHotFiles`, and `prerebaseDivergenceThreshold`, and emits run-audit events `merge:auto-prerebase:applied`, `merge:auto-prerebase:skipped`, and `merge:auto-prerebase:failed`.
