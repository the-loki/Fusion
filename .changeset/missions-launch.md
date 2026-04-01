---
"@gsxdsm/fusion": minor
---

Add Missions system for large-scale project planning.

The Missions system provides a hierarchical planning structure:
- **Mission** — High-level goals and projects
- **Milestone** — Major phases within missions  
- **Slice** — Parallel work areas within milestones
- **Feature** — Individual deliverables linked to tasks

**New Features:**
- SQLite database schema for mission hierarchy with automatic status rollup
- MissionStore with full CRUD operations and event emissions
- REST API endpoints for mission, milestone, slice, and feature management
- CLI commands: `fn mission create`, `list`, `show`, `delete`, `activate-slice`
- Dashboard UI components for mission management

**Usage:**
- Create missions with `fn mission create "Title" "Description"`
- View hierarchy with `fn mission show <id>`
- Link features to tasks for automatic progress tracking
