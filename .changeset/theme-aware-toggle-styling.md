---
"@gsxdsm/fusion": patch
---

Fix theme-aware styling for UsageIndicator toggle buttons

The UsageIndicator view toggle (Used/Remaining) now uses consistent theme-aware color variables (`var(--todo)` for active background, `var(--bg)` for text) matching the Header view toggle styling. This ensures proper contrast across all color themes (dark, light, high-contrast, ocean, forest, sunset).
