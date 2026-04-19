/**
 * Global test safety guard. Runs once per worker before any test.
 *
 *  1. Records the real project root so helpers know what to protect.
 *  2. Changes process.cwd() to a per-worker temp dir (main thread only) so any
 *     accidental `process.cwd()` call resolves to a disposable path.
 *  3. Wraps `process.chdir` to reject attempts to chdir into the real .fusion.
 *
 * Worker temp dirs live under a single parent (FUSION_WORKER_ROOT) that is
 * wiped by the vitest globalTeardown in vitest-teardown.ts — this handles the
 * case where workers are killed (SIGKILL) and never run their exit handlers.
 */

import { mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { isMainThread } from "node:worker_threads";

const originalCwd = process.cwd.bind(process);

function ensureValidCwd(): string {
  try {
    return originalCwd();
  } catch {
    const fallback = tmpdir();
    try {
      process.chdir(fallback);
    } catch {
      // Ignore — if this fails too, callers will still get fallback.
    }
    return fallback;
  }
}

// Guard against uv_cwd crashes if a prior test removed the current directory.
process.cwd = (() => {
  return function guardedCwd() {
    return ensureValidCwd();
  };
})() as typeof process.cwd;

const realProjectRootRaw = ensureValidCwd();
const realProjectRoot = (() => {
  try {
    return realpathSync(realProjectRootRaw);
  } catch {
    return resolve(realProjectRootRaw);
  }
})();

function findRepoRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(join(current, ".fusion")) || existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

const repoRoot = findRepoRoot(realProjectRoot);
process.env.FUSION_TEST_REAL_ROOT = repoRoot;

// Shared parent directory for all worker temp dirs in this run.
// globalTeardown wipes this at the end of the suite.
const WORKER_ROOT = join(tmpdir(), "fusion-test-workers");
try { mkdirSync(WORKER_ROOT, { recursive: true }); } catch { /* ignore */ }
process.env.FUSION_TEST_WORKER_ROOT = WORKER_ROOT;

let workerTempDir: string | null = null;
if (isMainThread) {
  workerTempDir = realpathSync(
    mkdtempSync(join(WORKER_ROOT, `w-${process.pid}-`))
  );
  process.chdir(workerTempDir);
}

const originalChdir = process.chdir.bind(process);
process.chdir = (target: string) => {
  const resolvedTarget = (() => {
    try {
      return realpathSync(target);
    } catch {
      return resolve(target);
    }
  })();
  const realFusion = join(repoRoot, ".fusion");
  if (resolvedTarget === realFusion || resolvedTarget.startsWith(realFusion + sep)) {
    throw new Error(
      `[test-safety] Test attempted process.chdir into real .fusion directory: ${resolvedTarget}\n` +
      `Use useIsolatedCwd() from __test-utils__/workspace.ts instead.`
    );
  }
  originalChdir(target);
};

process.on("exit", () => {
  if (!workerTempDir) return;
  try {
    originalChdir(tmpdir());
    rmSync(workerTempDir, { recursive: true, force: true });
  } catch {
    // Ignore — globalTeardown sweeps WORKER_ROOT anyway.
  }
});
