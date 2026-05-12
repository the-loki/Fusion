---
"@runfusion/fusion": patch
---

Unify local task creation on the distributed task-ID allocator lifecycle and remove runtime reliance on `config.nextId` as an allocation counter. Local allocator state now self-heals on startup by reconciling to existing task IDs for each prefix.