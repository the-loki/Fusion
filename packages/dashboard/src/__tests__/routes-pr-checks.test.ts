// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Task, TaskStore } from "@fusion/core";
import { createServer } from "../server.js";
import { get as performGet } from "../test-request.js";
import { GitHubClient } from "../github.js";
import { githubRateLimiter } from "../github-poll.js";

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "KB-001",
    title: "Task",
    status: "todo",
    description: "desc",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prInfo: {
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
      status: "open",
      title: "PR",
      headBranch: "feature",
      baseBranch: "main",
      commentCount: 0,
    },
    ...overrides,
  } as Task;
}

function createMockStore(task: Task): TaskStore {
  return {
    getTask: vi.fn().mockResolvedValue(task),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    mergeTask: vi.fn(),
    archiveTask: vi.fn(),
    unarchiveTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn(),
    logEntry: vi.fn().mockResolvedValue(undefined),
    getAgentLogs: vi.fn().mockResolvedValue([]),
    addSteeringComment: vi.fn(),
    updatePrInfo: vi.fn().mockResolvedValue(undefined),
    updateIssueInfo: vi.fn().mockResolvedValue(undefined),
    getRootDir: vi.fn().mockReturnValue("/fake/root"),
    getFusionDir: vi.fn().mockReturnValue("/fake/root/.fusion"),
    getDatabase: vi.fn().mockReturnValue({
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 0 }), get: vi.fn(), all: vi.fn().mockReturnValue([]) }),
    }),
    getMissionStore: vi.fn().mockReturnValue({
      listMissions: vi.fn().mockReturnValue([]),
      createMission: vi.fn(),
      getMissionWithHierarchy: vi.fn(),
      updateMission: vi.fn(),
      getMission: vi.fn(),
      deleteMission: vi.fn(),
      listMilestonesByMission: vi.fn().mockReturnValue([]),
      createMilestone: vi.fn(),
      updateMilestone: vi.fn(),
      getMilestone: vi.fn(),
      deleteMilestone: vi.fn(),
      listTasksByMilestone: vi.fn().mockReturnValue([]),
      createMissionTask: vi.fn(),
      updateMissionTask: vi.fn(),
      getMissionTask: vi.fn(),
      deleteMissionTask: vi.fn(),
    }),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as TaskStore;
}

describe("GET /api/tasks/:id/pr/checks", () => {
  beforeEach(() => {
    vi.spyOn(githubRateLimiter, "canMakeRequest").mockReturnValue(true);
    vi.spyOn(githubRateLimiter, "getResetTime").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns checks payload", async () => {
    vi.spyOn(GitHubClient.prototype, "getAllPrChecks").mockResolvedValue({
      checks: [{ name: "ci", required: true, state: "success", detailsUrl: "https://example.com" }],
      rollupRequired: "success",
    });

    const app = createServer(createMockStore(createMockTask()));
    const response = await performGet(app, "/api/tasks/KB-001/pr/checks");

    expect(response.status).toBe(200);
    expect(response.body.rollup).toBe("success");
    expect(response.body.checks).toHaveLength(1);
    expect(response.body.lastCheckedAt).toEqual(expect.any(String));
  });

  it("returns 404 when task has no PR", async () => {
    const app = createServer(createMockStore(createMockTask({ prInfo: undefined })));
    const response = await performGet(app, "/api/tasks/KB-001/pr/checks");

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("no associated PR");
  });

  it("returns 429 when rate limited", async () => {
    vi.spyOn(githubRateLimiter, "canMakeRequest").mockReturnValue(false);
    vi.spyOn(githubRateLimiter, "getResetTime").mockReturnValue(new Date(Date.now() + 30_000));

    const app = createServer(createMockStore(createMockTask()));
    const response = await performGet(app, "/api/tasks/KB-001/pr/checks");

    expect(response.status).toBe(429);
    expect(response.body.error).toContain("rate limit");
    expect(response.body.details.retryAfter).toEqual(expect.any(Number));
  });

  it("returns required-only rollup from mixed checks", async () => {
    vi.spyOn(GitHubClient.prototype, "getAllPrChecks").mockResolvedValue({
      checks: [
        { name: "required", required: true, state: "pending" },
        { name: "optional", required: false, state: "failure" },
      ],
      rollupRequired: "pending",
    });

    const app = createServer(createMockStore(createMockTask()));
    const response = await performGet(app, "/api/tasks/KB-001/pr/checks");

    expect(response.status).toBe(200);
    expect(response.body.rollup).toBe("pending");
  });
});
