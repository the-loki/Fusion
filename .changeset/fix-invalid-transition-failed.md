---
"@gsxdsm/fusion": patch
---

Fix executor to handle "Invalid transition" errors gracefully instead of marking tasks as failed. When a task is moved by the user while the executor is running, the executor's attempt to move the task will fail with an invalid transition error. This no longer marks the task as failed - instead it logs the situation and exits gracefully since the task is already in the desired state.
