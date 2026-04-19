/**
 * Vitest globalSetup hook. The returned function runs once after the entire
 * test run completes, regardless of whether individual workers exited cleanly.
 * Wipes the shared FUSION_TEST_WORKER_ROOT directory that holds per-worker
 * temp dirs created by vitest-setup.ts.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKER_ROOT = join(tmpdir(), "fusion-test-workers");

export default function setup(): () => Promise<void> {
  // Set the env var here too so vitest-setup.ts workers pick it up even if
  // their own mkdir runs after globalSetup.
  process.env.FUSION_TEST_WORKER_ROOT = WORKER_ROOT;

  return async function teardown() {
    // Intentionally no-op.
    //
    // Worker temp dirs are cleaned by vitest-setup.ts using process.on("exit")
    // after first chdir-ing out of the worker dir. Deleting shared temp roots
    // from global teardown is unsafe under some Vitest pool modes because it
    // can run while other suites are still active, causing ENOENT uv_cwd.
  };
}