---
"@runfusion/fusion": patch
---

Cap per-package Vitest worker fan-out to 6 (from `cpus().length - 1`) and lower the root `pnpm test` workspace concurrency from 4 to 2. On high-core developer machines this prevents `pnpm test` from spawning 100+ worker threads, which was saturating CPU and slowing the dashboard while agents ran tests. Override is still available via `VITEST_MAX_WORKERS`.
