---
"@gsxdsm/fusion": patch
---

Fix ntfy duplicate notifications causing rate limiting

- Removed redundant "done" notification from `handleTaskMoved` 
- Added per-event-type deduplication to ensure only one notification per (task, event-type) pair
- Notifications now correctly sent for: in-review, merged, failed events
- Eliminated double notifications when tasks are merged to main
