---
"@gsxdsm/fusion": patch
---

Add filesystem cleanup for archived tasks. Archived tasks can now be condensed into a compact archive.jsonl entry and removed from the filesystem to save space. Tasks can be restored from the archive log when unarchived.

New TaskStore methods:
- `archiveTask(id, cleanup)` - Optional cleanup parameter to archive and clean up immediately
- `archiveTaskAndCleanup(id)` - Convenience method for immediate cleanup
- `cleanupArchivedTasks()` - Bulk cleanup of all archived tasks with existing directories
- `readArchiveLog()` - Parse archive.jsonl entries
- `findInArchive(id)` - Find a specific task in the archive log
- `unarchiveTask(id)` - Now restores from archive if directory is missing
