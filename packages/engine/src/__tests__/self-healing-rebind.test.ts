import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../logger.js", () => ({
  createLogger: vi.fn(() => logger),
}));

import { TaskStore } from "@fusion/core";
import { SelfHealingManager } from "../self-healing.js";

function git(cwd: string, command: string): string {
  return execSync(`git ${command}`, { cwd, encoding: "utf8" }).trim();
}

describe("reconcileInReviewBranchRebind", () => {
  let rootDir = "";
  let store: TaskStore;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), "fn-5083-rebind-"));
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

  async function createInReviewTask(title: string) {
    const task = await store.createTask({ title, description: title });
    await store.moveTask(task.id, "todo");
    await store.moveTask(task.id, "in-progress");
    await store.moveTask(task.id, "in-review");
    return task.id;
  }

  it("returns no-live-branch when no candidate exists", async () => {
    const id = await createInReviewTask("no branch");
    await store.updateTask(id, { branch: null, worktree: null });

    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(result.repaired).toBe(0);
    expect(result.outcomes).toContainEqual({ taskId: id, result: "skipped", reason: "no-live-branch" });
  });

  it("applies rebind when one candidate has unique work", async () => {
    const id = await createInReviewTask("single candidate");
    const branch = `fusion/${id.toLowerCase()}`;
    git(rootDir, `checkout -b ${branch}`);
    writeFileSync(join(rootDir, `${id}.txt`), "feature\n");
    git(rootDir, `add ${id}.txt`);
    git(rootDir, `commit -m 'feat(${id}): change'`);
    git(rootDir, "checkout main");
    await store.updateTask(id, { branch: null, worktree: null, baseCommitSha: null });

    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(result.repaired).toBe(1);
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: id, result: "applied", branch }),
      ]),
    );
  });

  it("skips no-unique-work when candidates are not ahead", async () => {
    const id = await createInReviewTask("no unique work");
    const branch = `fusion/${id.toLowerCase()}`;
    git(rootDir, `branch ${branch}`);
    await store.updateTask(id, { branch: null, worktree: null });

    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(result.repaired).toBe(0);
    expect(result.outcomes).toContainEqual({ taskId: id, result: "skipped", reason: "no-unique-work" });
  });

  it("records binding-intact when current branch exists", async () => {
    const id = await createInReviewTask("binding intact");
    const branch = `fusion/${id.toLowerCase()}`;
    git(rootDir, `branch ${branch}`);
    await store.updateTask(id, { branch });

    const manager = new SelfHealingManager(store, { rootDir });
    const result = await manager.reconcileInReviewBranchRebind({ includeTaskIds: new Set([id]) });

    expect(result.repaired).toBe(0);
    expect(result.outcomes).toContainEqual({ taskId: id, result: "skipped", reason: "binding-intact" });
  });
});
