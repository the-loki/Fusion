---
"@runfusion/fusion": patch
---

Surface exhausted soft-deleted in-review blockers through opt-in visibility paths so operators can diagnose stalled dependent chains without direct DB access. `fn_task_show` now falls back to include soft-deleted task reads and prints a `[SOFT-DELETED at ...]` marker, while `fn_task_list` adds an `includeDeleted` flag for listing hidden blockers.

Also adds dashboard/API visibility with `GET /api/tasks/exhausted-in-review` (including `?includeDeleted=true`), `GET /api/tasks/:id?includeDeleted=true`, and a ReliabilityView panel for exhausted hidden blockers plus blocked dependents.
