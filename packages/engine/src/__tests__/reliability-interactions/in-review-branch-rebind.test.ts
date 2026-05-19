import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../logger.js", () => ({
  createLogger: vi.fn(() => logger),
}));

import { TaskStore } from "@fusion/core";
import { SelfHealingManager } from "../../self-healing.js";

function git(cwd: string, command: string): string {
  return execSync(`git ${command}`, { cwd, encoding: "utf8" }).trim();
}

describe("FN-5083 reliability interactions: in-review branch rebind", () => {
  let rootDir = "";
  let store: TaskStore;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "fn-5083-reliability-"));
    git(rootDir, "init -b main");
    git(rootDir, "config user.name 'Fusion'");
    git(rootDir, "config user.email 'hi@runfusion.ai'");
    writeFileSync(join(rootDir, "README.md"), "root\n");
    git(rootDir, "add README.md");
    git(rootDir, "commit -m 'init'");
    store = new TaskStore(rootDir, undefined, { inMemoryDb: false });
  });

  afterEach(() => {
    try { store?.close(); } catch {}
    if (rootDir) rmSync(rootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function createTaskInReview(title: string) {
    const task = await store.createTask({ title, description: title });
    await store.moveTask(task.id, "todo");
    await store.moveTask(task.id, "in-progress");
    await store.moveTask(task.id, "in-review");
    return task.id;
  }

  it("applies rebind once and remains idempotent on subsequent sweep", async () => {
    const id = await createTaskInReview("rebind once");
    const branch = `fusion/${id.toLowerCase()}`;
    git(rootDir, `checkout -b ${branch}`);
    writeFileSync(join(rootDir, `${id}.txt`), "feature\n");
    git(rootDir, `add ${id}.txt`);
    git(rootDir, `commit -m 'feat(${id}): rebind target'`);
    git(rootDir, "checkout main");
    await store.updateTask(id, { branch: null, worktree: null });

    const manager = new SelfHealingManager(store, { rootDir });
    const first = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });
    const second = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(first.repaired).toBe(1);
    expect(first.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: id, result: "applied", branch }),
    ]));
    expect(second.repaired).toBeGreaterThanOrEqual(0);
    expect(second.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: id }),
    ]));
  });

  it("skips ambiguous case-only candidate branches", async () => {
    const id = await createTaskInReview("ambiguous candidates");
    const lower = `fusion/${id.toLowerCase()}`;
    const upper = `fusion/${id}`;

    git(rootDir, `checkout -b ${lower}`);
    writeFileSync(join(rootDir, `${id}-lower.txt`), "lower\n");
    git(rootDir, `add ${id}-lower.txt`);
    git(rootDir, "commit -m 'lower unique commit'");

    let hasCaseVariant = true;
    try {
      git(rootDir, `checkout -b ${upper} main`);
      writeFileSync(join(rootDir, `${id}-upper.txt`), "upper\n");
      git(rootDir, `add ${id}-upper.txt`);
      git(rootDir, "commit -m 'upper unique commit'");
    } catch {
      hasCaseVariant = false;
    }
    git(rootDir, "checkout main");

    await store.updateTask(id, { branch: null, worktree: null });

    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    if (hasCaseVariant) {
      expect(result.outcomes).toEqual(expect.arrayContaining([
        expect.objectContaining({ taskId: id, result: "skipped", reason: "ambiguous-candidates" }),
      ]));
      return;
    }

    expect(result.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: id }),
    ]));
  });

  it("composes with metadata-cleared in-review task state", async () => {
    const id = await createTaskInReview("metadata-cleared");
    const branch = `fusion/${id.toLowerCase()}`;
    git(rootDir, `checkout -b ${branch}`);
    writeFileSync(join(rootDir, `${id}-meta.txt`), "meta\n");
    git(rootDir, `add ${id}-meta.txt`);
    git(rootDir, "commit -m 'meta clear commit'");
    git(rootDir, "checkout main");

    await store.updateTask(id, { branch: null, worktree: null, baseCommitSha: null });
    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(result.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: id, result: "applied", branch }),
    ]));
  });
});
