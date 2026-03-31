---
"@gsxdsm/fusion": minor
---

Add "refine task" feature for creating follow-up tasks from completed or in-review work

- New `kb task refine <id>` CLI command with interactive and `--feedback` flag modes
- New `kb_task_refine` pi extension tool for AI agents
- Dashboard UI with "Request Refinement" button on done/in-review task detail modal
- Creates new task in triage with dependency on original task
- Supports feedback text up to 2000 characters
