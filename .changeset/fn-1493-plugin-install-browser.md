---
"@gsxdsm/fusion": patch
---

Plugin install from directory browser now resolves manifest.json from dist folders and package roots. Selecting a package root probes `dist/manifest.json`; selecting a dist folder probes the parent for `manifest.json`. Path validation enforces absolute paths and rejects traversal sequences.
