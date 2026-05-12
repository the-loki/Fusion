---
"@runfusion/fusion": patch
---

Memoize startup slim `listTasks` reads across dashboard/engine boot paths to reduce duplicate task-list SQL and JSON parsing work without introducing long-lived stale cache behavior.
