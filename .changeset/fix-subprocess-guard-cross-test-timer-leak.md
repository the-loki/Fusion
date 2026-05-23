---
"@fusion/core": patch
---

fix(test-utils): cancel subprocess tracking timer for every proc in afterEach

The vitest subprocess guard registered a 60 s "command timed out" timer for
each tracked child process and relied on `afterEach` to cancel it. Under
concurrent load (`pnpm` recursive test runs) the timer could outlive the
originating test and fire during a later test's `afterEach`, surfacing as
spurious "Test subprocess guard detected unsafe child-process usage:
Timed out after 60000ms" failures attributed to a different test name.

The cleanup loop now scopes "Left running" failure reporting + SIGKILL to
processes spawned by the current test, but unconditionally clears each
tracked subprocess's timer so the 60 s timeout cannot fire after the
afterEach completes. The grace period before declaring a process leaked
is also raised from 200 ms to 1 s to absorb event-loop contention from
slow git shells under recursive test load.
