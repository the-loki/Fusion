---
"@gsxdsm/fusion": minor
---

Add plugin hot-reload capability for runtime plugin updates. Plugins can now be reloaded without restarting the engine or dashboard. The reload endpoint is available at `POST /api/plugins/:id/reload` and the dashboard includes a reload button for running plugins. Hot-loaded plugins' tools are immediately available to new task executions.
