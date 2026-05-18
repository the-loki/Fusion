---
"@runfusion/fusion": patch
---

SelfHealingManager.reapUnregisteredOrphans now defers reaping paths that are bound to a live active session, restoring the FN-4811 guard lost during the auto-archive incident.
