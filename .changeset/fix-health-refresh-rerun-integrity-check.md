---
"@runfusion/fusion": patch
---

Make the dashboard's "Refresh health" button actually re-run the SQLite integrity check. The background scheduler in `Database.scheduleBackgroundIntegrityCheck` only ran the check once at engine boot, so once `corruptionDetected` flipped to `true` it was sticky for the life of the process — the refresh action just re-read the same cached flag and the corruption banner could not be cleared even after the user repaired the DB (e.g. via `REINDEX`). `POST /api/health/refresh` now calls a new `TaskStore.refreshDatabaseHealth` which synchronously re-runs the integrity check and updates the cached state before responding.
