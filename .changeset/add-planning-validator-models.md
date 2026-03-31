---
"@gsxdsm/fusion": minor
---

Add separate planning and verification model settings

Users can now configure separate AI models for:
- **Planning Model**: Used for triage/specification when writing PROMPT.md files
- **Validator Model**: Used for code and specification review

Both settings are available in the dashboard under Settings > Model, alongside the existing Default Model setting. When not configured, they fall back to the Default Model.

This allows using specialized models for different phases of task execution - for example, a fast/cheap model for planning and a powerful model for verification.
