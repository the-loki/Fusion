/**
 * Global test safety guard. Runs once per worker before any test.
 *
 *  1. Records the real project root so helpers know what to protect.
 *  2. Changes process.cwd() to a per-worker temp dir (main thread only) so any
 *     accidental `process.cwd()` call resolves to a disposable path.
 *  3. Wraps `process.chdir` to reject attempts to chdir into the real .fusion.
 *  4. Wraps write-capable fs APIs so tests cannot mutate the repo's live .fusion.
 *
 * Worker temp dirs live under a single parent (FUSION_WORKER_ROOT) that is
 * wiped by the vitest globalTeardown in vitest-teardown.ts — this handles the
 * case where workers are killed (SIGKILL) and never run their exit handlers.
 */

import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import { assertOutsideRealFusionPath } from "../test-safety.js";

type FsModule = typeof import("node:fs");
type FsPromisesModule = typeof import("node:fs/promises");

const requireFromHere = createRequire(import.meta.url);
const fs = requireFromHere("node:fs") as FsModule;
const fsPromises = requireFromHere("node:fs/promises") as FsPromisesModule;
const { mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync } = fs;

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

function installFsGuards(): void {
  const guardState = globalThis as typeof globalThis & { __fusionTestFsGuardInstalled?: boolean };
  if (guardState.__fusionTestFsGuardInstalled) return;
  guardState.__fusionTestFsGuardInstalled = true;

  const mutableFs = fs as unknown as Record<string, unknown>;
  const mutableFsPromises = fsPromises as unknown as Record<string, unknown>;

  const originalFs = {
    mkdirSync: fs.mkdirSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    appendFileSync: fs.appendFileSync.bind(fs),
    rmSync: fs.rmSync.bind(fs),
    unlinkSync: fs.unlinkSync.bind(fs),
    rmdirSync: fs.rmdirSync.bind(fs),
    renameSync: fs.renameSync.bind(fs),
    copyFileSync: fs.copyFileSync.bind(fs),
    cpSync: fs.cpSync.bind(fs),
    mkdtempSync: fs.mkdtempSync.bind(fs),
    openSync: fs.openSync.bind(fs),
    createWriteStream: fs.createWriteStream.bind(fs),
    truncateSync: fs.truncateSync.bind(fs),
    linkSync: fs.linkSync.bind(fs),
    symlinkSync: fs.symlinkSync.bind(fs),
    mkdir: fs.mkdir.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    appendFile: fs.appendFile.bind(fs),
    rm: fs.rm.bind(fs),
    unlink: fs.unlink.bind(fs),
    rmdir: fs.rmdir.bind(fs),
    rename: fs.rename.bind(fs),
    copyFile: fs.copyFile.bind(fs),
    cp: fs.cp.bind(fs),
    open: fs.open.bind(fs),
    truncate: fs.truncate.bind(fs),
    link: fs.link.bind(fs),
    symlink: fs.symlink.bind(fs),
  };

  const originalFsPromises = {
    mkdir: fsPromises.mkdir.bind(fsPromises),
    writeFile: fsPromises.writeFile.bind(fsPromises),
    appendFile: fsPromises.appendFile.bind(fsPromises),
    rm: fsPromises.rm.bind(fsPromises),
    unlink: fsPromises.unlink.bind(fsPromises),
    rmdir: fsPromises.rmdir.bind(fsPromises),
    rename: fsPromises.rename.bind(fsPromises),
    copyFile: fsPromises.copyFile.bind(fsPromises),
    cp: fsPromises.cp.bind(fsPromises),
    open: fsPromises.open.bind(fsPromises),
    mkdtemp: fsPromises.mkdtemp.bind(fsPromises),
    truncate: fsPromises.truncate.bind(fsPromises),
    link: fsPromises.link.bind(fsPromises),
    symlink: fsPromises.symlink.bind(fsPromises),
  };

  const guardOne = (pathValue: unknown, context: string) => {
    if (pathValue === undefined || pathValue === null) return;
    assertOutsideRealFusionPath(pathValue as Parameters<typeof assertOutsideRealFusionPath>[0], context);
  };
  const guardBoth = (source: unknown, target: unknown, context: string) => {
    guardOne(source, `${context} source`);
    guardOne(target, `${context} target`);
  };

  mutableFs.mkdirSync = ((path, options) => {
    guardOne(path, "fs.mkdirSync");
    return originalFs.mkdirSync(path, options as Parameters<typeof fs.mkdirSync>[1]);
  }) as typeof fs.mkdirSync;
  mutableFs.writeFileSync = ((path, data, options) => {
    guardOne(path, "fs.writeFileSync");
    return originalFs.writeFileSync(path, data, options as Parameters<typeof fs.writeFileSync>[2]);
  }) as typeof fs.writeFileSync;
  mutableFs.appendFileSync = ((path, data, options) => {
    guardOne(path, "fs.appendFileSync");
    return originalFs.appendFileSync(path, data, options as Parameters<typeof fs.appendFileSync>[2]);
  }) as typeof fs.appendFileSync;
  mutableFs.rmSync = ((path, options) => {
    guardOne(path, "fs.rmSync");
    return originalFs.rmSync(path, options as Parameters<typeof fs.rmSync>[1]);
  }) as typeof fs.rmSync;
  mutableFs.unlinkSync = ((path) => {
    guardOne(path, "fs.unlinkSync");
    return originalFs.unlinkSync(path);
  }) as typeof fs.unlinkSync;
  mutableFs.rmdirSync = ((path, options) => {
    guardOne(path, "fs.rmdirSync");
    return originalFs.rmdirSync(path, options as Parameters<typeof fs.rmdirSync>[1]);
  }) as typeof fs.rmdirSync;
  mutableFs.renameSync = ((oldPath, newPath) => {
    guardBoth(oldPath, newPath, "fs.renameSync");
    return originalFs.renameSync(oldPath, newPath);
  }) as typeof fs.renameSync;
  mutableFs.copyFileSync = ((src, dest, mode) => {
    guardBoth(src, dest, "fs.copyFileSync");
    return originalFs.copyFileSync(src, dest, mode as Parameters<typeof fs.copyFileSync>[2]);
  }) as typeof fs.copyFileSync;
  mutableFs.cpSync = ((src, dest, options) => {
    guardBoth(src, dest, "fs.cpSync");
    return originalFs.cpSync(src, dest, options as Parameters<typeof fs.cpSync>[2]);
  }) as typeof fs.cpSync;
  mutableFs.mkdtempSync = ((prefix, options) => {
    guardOne(prefix, "fs.mkdtempSync");
    return originalFs.mkdtempSync(prefix, options as Parameters<typeof fs.mkdtempSync>[1]);
  }) as typeof fs.mkdtempSync;
  mutableFs.openSync = ((path, flags, mode) => {
    guardOne(path, "fs.openSync");
    return originalFs.openSync(path, flags, mode as Parameters<typeof fs.openSync>[2]);
  }) as typeof fs.openSync;
  mutableFs.createWriteStream = ((path, options) => {
    guardOne(path, "fs.createWriteStream");
    return originalFs.createWriteStream(path, options as Parameters<typeof fs.createWriteStream>[1]);
  }) as typeof fs.createWriteStream;
  mutableFs.truncateSync = ((path, len) => {
    guardOne(path, "fs.truncateSync");
    return originalFs.truncateSync(path, len as Parameters<typeof fs.truncateSync>[1]);
  }) as typeof fs.truncateSync;
  mutableFs.linkSync = ((existingPath, newPath) => {
    guardBoth(existingPath, newPath, "fs.linkSync");
    return originalFs.linkSync(existingPath, newPath);
  }) as typeof fs.linkSync;
  mutableFs.symlinkSync = ((target, path, type) => {
    guardBoth(target, path, "fs.symlinkSync");
    return originalFs.symlinkSync(target, path, type as Parameters<typeof fs.symlinkSync>[2]);
  }) as typeof fs.symlinkSync;

  mutableFs.mkdir = ((...args: Parameters<typeof fs.mkdir>) => {
    guardOne(args[0], "fs.mkdir");
    return originalFs.mkdir(...args);
  }) as typeof fs.mkdir;
  mutableFs.writeFile = ((...args: Parameters<typeof fs.writeFile>) => {
    guardOne(args[0], "fs.writeFile");
    return originalFs.writeFile(...args);
  }) as typeof fs.writeFile;
  mutableFs.appendFile = ((...args: Parameters<typeof fs.appendFile>) => {
    guardOne(args[0], "fs.appendFile");
    return originalFs.appendFile(...args);
  }) as typeof fs.appendFile;
  mutableFs.rm = ((...args: Parameters<typeof fs.rm>) => {
    guardOne(args[0], "fs.rm");
    return originalFs.rm(...args);
  }) as typeof fs.rm;
  mutableFs.unlink = ((...args: Parameters<typeof fs.unlink>) => {
    guardOne(args[0], "fs.unlink");
    return originalFs.unlink(...args);
  }) as typeof fs.unlink;
  mutableFs.rmdir = ((...args: Parameters<typeof fs.rmdir>) => {
    guardOne(args[0], "fs.rmdir");
    return originalFs.rmdir(...args);
  }) as typeof fs.rmdir;
  mutableFs.rename = ((...args: Parameters<typeof fs.rename>) => {
    guardBoth(args[0], args[1], "fs.rename");
    return originalFs.rename(...args);
  }) as typeof fs.rename;
  mutableFs.copyFile = ((...args: Parameters<typeof fs.copyFile>) => {
    guardBoth(args[0], args[1], "fs.copyFile");
    return originalFs.copyFile(...args);
  }) as typeof fs.copyFile;
  mutableFs.cp = ((...args: Parameters<typeof fs.cp>) => {
    guardBoth(args[0], args[1], "fs.cp");
    return originalFs.cp(...args);
  }) as typeof fs.cp;
  mutableFs.open = ((...args: Parameters<typeof fs.open>) => {
    guardOne(args[0], "fs.open");
    return originalFs.open(...args);
  }) as typeof fs.open;
  mutableFs.truncate = ((...args: Parameters<typeof fs.truncate>) => {
    guardOne(args[0], "fs.truncate");
    return originalFs.truncate(...args);
  }) as typeof fs.truncate;
  mutableFs.link = ((...args: Parameters<typeof fs.link>) => {
    guardBoth(args[0], args[1], "fs.link");
    return originalFs.link(...args);
  }) as typeof fs.link;
  mutableFs.symlink = ((...args: Parameters<typeof fs.symlink>) => {
    guardBoth(args[0], args[1], "fs.symlink");
    return originalFs.symlink(...args);
  }) as typeof fs.symlink;

  mutableFsPromises.mkdir = (async (...args: Parameters<typeof fsPromises.mkdir>) => {
    guardOne(args[0], "fs.promises.mkdir");
    return originalFsPromises.mkdir(...args);
  }) as typeof fsPromises.mkdir;
  mutableFsPromises.writeFile = (async (...args: Parameters<typeof fsPromises.writeFile>) => {
    guardOne(args[0], "fs.promises.writeFile");
    return originalFsPromises.writeFile(...args);
  }) as typeof fsPromises.writeFile;
  mutableFsPromises.appendFile = (async (...args: Parameters<typeof fsPromises.appendFile>) => {
    guardOne(args[0], "fs.promises.appendFile");
    return originalFsPromises.appendFile(...args);
  }) as typeof fsPromises.appendFile;
  mutableFsPromises.rm = (async (...args: Parameters<typeof fsPromises.rm>) => {
    guardOne(args[0], "fs.promises.rm");
    return originalFsPromises.rm(...args);
  }) as typeof fsPromises.rm;
  mutableFsPromises.unlink = (async (...args: Parameters<typeof fsPromises.unlink>) => {
    guardOne(args[0], "fs.promises.unlink");
    return originalFsPromises.unlink(...args);
  }) as typeof fsPromises.unlink;
  mutableFsPromises.rmdir = (async (...args: Parameters<typeof fsPromises.rmdir>) => {
    guardOne(args[0], "fs.promises.rmdir");
    return originalFsPromises.rmdir(...args);
  }) as typeof fsPromises.rmdir;
  mutableFsPromises.rename = (async (...args: Parameters<typeof fsPromises.rename>) => {
    guardBoth(args[0], args[1], "fs.promises.rename");
    return originalFsPromises.rename(...args);
  }) as typeof fsPromises.rename;
  mutableFsPromises.copyFile = (async (...args: Parameters<typeof fsPromises.copyFile>) => {
    guardBoth(args[0], args[1], "fs.promises.copyFile");
    return originalFsPromises.copyFile(...args);
  }) as typeof fsPromises.copyFile;
  mutableFsPromises.cp = (async (...args: Parameters<typeof fsPromises.cp>) => {
    guardBoth(args[0], args[1], "fs.promises.cp");
    return originalFsPromises.cp(...args);
  }) as typeof fsPromises.cp;
  mutableFsPromises.open = (async (...args: Parameters<typeof fsPromises.open>) => {
    guardOne(args[0], "fs.promises.open");
    return originalFsPromises.open(...args);
  }) as typeof fsPromises.open;
  mutableFsPromises.mkdtemp = (async (...args: Parameters<typeof fsPromises.mkdtemp>) => {
    guardOne(args[0], "fs.promises.mkdtemp");
    return originalFsPromises.mkdtemp(...args);
  }) as typeof fsPromises.mkdtemp;
  mutableFsPromises.truncate = (async (...args: Parameters<typeof fsPromises.truncate>) => {
    guardOne(args[0], "fs.promises.truncate");
    return originalFsPromises.truncate(...args);
  }) as typeof fsPromises.truncate;
  mutableFsPromises.link = (async (...args: Parameters<typeof fsPromises.link>) => {
    guardBoth(args[0], args[1], "fs.promises.link");
    return originalFsPromises.link(...args);
  }) as typeof fsPromises.link;
  mutableFsPromises.symlink = (async (...args: Parameters<typeof fsPromises.symlink>) => {
    guardBoth(args[0], args[1], "fs.promises.symlink");
    return originalFsPromises.symlink(...args);
  }) as typeof fsPromises.symlink;

  syncBuiltinESMExports();
}

installFsGuards();

const originalChdir = process.chdir.bind(process);
process.chdir = (target: string) => {
  assertOutsideRealFusionPath(target, "process.chdir");
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
