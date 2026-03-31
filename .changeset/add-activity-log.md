---
"@gsxdsm/fusion": minor
---

Add Global Activity Log feature to dashboard

- New Activity Log modal accessible from header (history icon)
- Captures task lifecycle events: created, moved, merged, failed, deleted
- Records settings changes for important configuration updates
- Filter events by type
- Auto-refresh every 30 seconds when modal is open
- REST API: GET /api/activity and DELETE /api/activity
