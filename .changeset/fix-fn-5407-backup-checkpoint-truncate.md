---
"@runfusion/fusion": patch
---

Fix `fn backup` corrupting the live database. The paired-central-backup feature opened a second `node:sqlite` connection against the live `fusion.db` and ran `PRAGMA wal_checkpoint(TRUNCATE)` before the file copy. A `node:sqlite` SIGSEGV mid-checkpoint (a known recurring crash mode for this codebase) could leave the main DB file extended-but-zeroed. Backups now copy the main DB plus any sibling `-wal`/`-shm` files via plain `cp`; SQLite replays the WAL on first open, so uncheckpointed pages are preserved without us ever opening a second connection against the live database.
