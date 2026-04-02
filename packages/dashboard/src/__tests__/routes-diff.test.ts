import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Task } from "@fusion/core";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { get } from "../test-request.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { createServer } from "../server.js";

const mockExecSync = vi.mocked(childProcess.execSync);
const mockExistsSync = vi.mocked(fs.existsSync);

class MockStore extends EventEmitter {
  private tasks = new Map<string, Task>();

  getRootDir(): string {
    return "/tmp/fn-679";
  }

  getMissionStore() {
    return {
      listMissions: vi.fn().mockResolvedValue([]),
      createMission: vi.fn(),
      getMission: vi.fn(),
      updateMission: vi.fn(),
      deleteMission: vi.fn(),
      listTemplates: vi.fn().mockResolvedValue([]),
      createTemplate: vi.fn(),
      getTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      instantiateMission: vi.fn(),
    };
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-679",
    title: "Test task",
    description: "Test description",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    columnMovedAt: "2026-04-01T00:00:00.000Z",
    worktree: "/tmp/fn-679",
    baseBranch: "main",
    ...overrides,
  };
}

async function requestDiff(app: Parameters<typeof get>[0], taskId = "FN-679", worktree?: string): Promise<{ status: number; body: any }> {
  const url = `/api/tasks/${taskId}/diff${worktree ? `?worktree=${encodeURIComponent(worktree)}` : ""}`;
  return await get(app, url);
}

describe("GET /api/tasks/:id/diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses merge-base syntax with baseBranch from task", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "develop" }));
    mockExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === "git diff --name-status develop...HEAD") {
        return "M\tsrc/app.ts\nA\tsrc/new.ts\n" as any;
      }
      if (cmd === 'git diff develop...HEAD -- "src/app.ts"') {
        return `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 const foo = "bar";
+const baz = "qux";
` as any;
      }
      if (cmd === 'git diff develop...HEAD -- "src/new.ts"') {
        return `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+const newFile = true;
` as any;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(2);
    expect(response.body.files[0].path).toBe("src/app.ts");
    expect(response.body.files[0].status).toBe("modified");
    expect(response.body.files[1].path).toBe("src/new.ts");
    expect(response.body.files[1].status).toBe("added");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status develop...HEAD",
      expect.objectContaining({ cwd: "/tmp/fn-679" }),
    );
  });

  it("defaults to main when baseBranch is not set", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: undefined }));
    mockExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === "git diff --name-status main...HEAD") {
        return "M\tsrc/index.ts\n" as any;
      }
      if (cmd === 'git diff main...HEAD -- "src/index.ts"') {
        return `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 const app = true;
+const initialized = true;
` as any;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status main...HEAD",
      expect.objectContaining({ cwd: "/tmp/fn-679" }),
    );
  });

  it("returns 404 when task not found", async () => {
    const store = new MockStore();

    const app = createServer(store as any);
    const response = await requestDiff(app, "NONEXISTENT");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Task not found");
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("uses provided worktree path from query param", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "feature" }));
    mockExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === "git diff --name-status feature...HEAD") {
        return "M\tpackage.json\n" as any;
      }
      if (cmd === 'git diff feature...HEAD -- "package.json"') {
        return `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
 {
   "name": "test",
+  "version": "1.0.0"
 }
` as any;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const app = createServer(store as any);
    const response = await requestDiff(app, "FN-679", "/custom/worktree/path");

    expect(response.status).toBe(200);
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status feature...HEAD",
      expect.objectContaining({ cwd: "/custom/worktree/path" }),
    );
  });

  it("falls back to HEAD when merge-base fails", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "nonexistent" }));
    mockExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === "git diff --name-status nonexistent...HEAD") {
        throw new Error("merge-base failed");
      }
      if (cmd === "git diff --name-status HEAD") {
        return "M\tREADME.md\n" as any;
      }
      if (cmd === 'git diff HEAD -- "README.md"') {
        return `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # Test
+New content
` as any;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status HEAD",
      expect.objectContaining({ cwd: "/tmp/fn-679" }),
    );
  });

  it("returns empty files array when no changes", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "main" }));
    mockExecSync.mockReturnValue("" as any);

    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
    expect(response.body.stats).toEqual({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("correctly counts additions and deletions in patches", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "main" }));
    mockExecSync.mockImplementation((command) => {
      const cmd = String(command);
      if (cmd === "git diff --name-status main...HEAD") {
        return "M\tsrc/changes.ts\n" as any;
      }
      if (cmd === 'git diff main...HEAD -- "src/changes.ts"') {
        return `diff --git a/src/changes.ts b/src/changes.ts
--- a/src/changes.ts
+++ b/src/changes.ts
@@ -1,5 +1,8 @@
 const original = true;
-const removed = true;
 const unchanged = true;
+const added1 = true;
+const added2 = true;
+const added3 = true;
` as any;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0].additions).toBe(3);
    expect(response.body.files[0].deletions).toBe(1);
    expect(response.body.stats).toEqual({
      filesChanged: 1,
      additions: 3,
      deletions: 1,
    });
  });
});
