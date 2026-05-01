---
"@runfusion/fusion": patch
---

Fix backup routine sync failures on legacy SQLite databases by backfilling missing `routines` columns (including `agentId`) during database initialization. Auto-backup settings now create/update the `Database Backup` routine without logging `table routines has no column named agentId` on upgraded installs.
