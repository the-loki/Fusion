---
"@gsxdsm/fusion": patch
---

Fix documents view returning "not found" error due to inconsistent ENOENT error handling.

The GET /documents route handler was always returning 500 for errors, unlike the GET /tasks/:id/documents route which properly checks for ENOENT and returns 404. This caused users to see "not found" errors when the task_documents table was missing or other ENOENT errors occurred.
