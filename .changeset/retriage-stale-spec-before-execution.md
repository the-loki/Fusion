---
"@gsxdsm/fusion": patch
---

Prevent execution from starting with stale specifications. When spec staleness enforcement is enabled via `specStalenessEnabled: true` and `specStalenessMaxAgeMs` settings, tasks whose PROMPT.md age exceeds the configured threshold are automatically moved back to triage with `status: "needs-respecify"` before execution begins. This guard applies both at scheduler dispatch and executor startup/resume, preventing manual moves, orphan resume, and unpause paths from bypassing the policy. Behavior is unchanged when enforcement is disabled.
