---
"@runfusion/fusion": patch
---

Replace dashboard `PrSection` with `PrPanel`, removing the inline PR title/description creation textbox in task details. The new panel focuses on read-only PR visibility (state, checks rollup, review decision, and comments) and keeps creation delegated to the upcoming modal flow (FN-4756/FN-4758) without changing CLI or API surfaces.
