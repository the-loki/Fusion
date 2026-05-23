import { beforeEach, describe, expect, it, vi } from "vitest";
import "./executor-test-helpers.js";
import { TaskExecutor, parseWorkflowStepVerdict } from "../executor.js";
import { mockedCreateFnAgent, createMockStore, resetExecutorMocks } from "./executor-test-helpers.js";

function buildTask() {
  return {
    id: "FN-5205",
    title: "Workflow test",
    description: "",
    column: "in-progress" as const,
    dependencies: [],
    steps: [{ name: "Preflight", status: "done" as const }],
    currentStep: 0,
    log: [],
    enabledWorkflowSteps: ["WS-004"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildStep() {
  return {
    id: "WS-004",
    templateId: "browser-verification",
    name: "Browser Verification",
    mode: "prompt",
    toolMode: "readonly",
    prompt: "verify",
    gateMode: "gate",
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function scriptedSession(output: string) {
  const subscribers: Array<(event: any) => void> = [];
  return {
    state: {},
    subscribe: (cb: (event: any) => void) => subscribers.push(cb),
    prompt: vi.fn(async () => {
      subscribers.forEach((cb) => cb({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: output } }));
    }),
    dispose: vi.fn(),
    getSessionStats: () => ({ tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 } }),
  };
}

describe("workflow-step test mode routing", () => {
  beforeEach(() => {
    resetExecutorMocks();
  });

  it("FN-5205 test mode browser verification defaults to APPROVE", async () => {
    const store = createMockStore();
    const task = buildTask();
    store.getTask.mockResolvedValue(task as any);
    store.getWorkflowStep.mockResolvedValue(buildStep() as any);
    vi.spyOn(TaskExecutor.prototype as any, "captureModifiedFiles").mockResolvedValue([]);

    mockedCreateFnAgent.mockResolvedValue({ session: scriptedSession('{"verdict":"APPROVE","notes":""}\n') as any, sessionFile: undefined } as any);

    const executor = new TaskExecutor(store as any, "/tmp/test", {} as any);
    const result = await (executor as any).runWorkflowSteps(task as any, "/tmp/test", { testMode: true, defaultProvider: "anthropic", defaultModelId: "claude-sonnet-4-5" });

    expect(result.allPassed).toBe(true);
    const args = mockedCreateFnAgent.mock.calls.at(-1)?.[0] as any;
    expect(args?.defaultProvider).toBe("mock");
    expect(args?.defaultModelId).toBe("scripted");
    expect(args?.runtimeContext).toEqual({ workflowStepId: "WS-004", workflowStepTemplateId: "browser-verification" });
    const parsed = parseWorkflowStepVerdict('{"verdict":"APPROVE","notes":""}');
    expect(parsed?.verdict).toBe("APPROVE");
  });

  it("test mode per-template REVISE override blocks merge path", async () => {
    const store = createMockStore();
    const task = buildTask();
    store.getTask.mockResolvedValue(task as any);
    store.getWorkflowStep.mockResolvedValue(buildStep() as any);
    vi.spyOn(TaskExecutor.prototype as any, "captureModifiedFiles").mockResolvedValue([]);

    mockedCreateFnAgent.mockResolvedValue({ session: scriptedSession('{"verdict":"REVISE","notes":"forced FAIL via FN-5205 override"}\n') as any, sessionFile: undefined } as any);

    const executor = new TaskExecutor(store as any, "/tmp/test", {} as any);
    const result = await (executor as any).runWorkflowSteps(task as any, "/tmp/test", { testMode: true, defaultProvider: "anthropic", defaultModelId: "claude-sonnet-4-5" });

    expect(result).toEqual(expect.objectContaining({ allPassed: false, revisionRequested: true, stepName: "Browser Verification" }));
    expect(String((result as any).feedback)).toContain("forced FAIL");
  });

  it("test mode off preserves real-provider selection while forwarding template context", async () => {
    const store = createMockStore();
    const task = buildTask();
    store.getTask.mockResolvedValue(task as any);
    store.getWorkflowStep.mockResolvedValue(buildStep() as any);

    const executor = new TaskExecutor(store as any, "/tmp/test", {} as any);
    mockedCreateFnAgent.mockResolvedValue({ session: scriptedSession('{"verdict":"APPROVE","notes":""}\n') as any, sessionFile: undefined } as any);

    await (executor as any).executeWorkflowStep(task as any, buildStep() as any, "/tmp/test", {
      defaultProvider: "anthropic",
      defaultModelId: "claude-sonnet-4-5",
    }, undefined);

    const args = mockedCreateFnAgent.mock.calls.at(-1)?.[0] as any;
    expect(args?.defaultProvider).toBe("anthropic");
    expect(args?.runtimeContext?.workflowStepTemplateId).toBe("browser-verification");
  });

  it("FN-5205 mock workflow-step path does not spawn browser harness or bash tools", async () => {
    const store = createMockStore();
    const task = buildTask();
    store.getWorkflowStep.mockResolvedValue(buildStep() as any);
    mockedCreateFnAgent.mockResolvedValue({ session: scriptedSession('{"verdict":"APPROVE","notes":""}\n') as any, sessionFile: undefined } as any);

    const executor = new TaskExecutor(store as any, "/tmp/test", {} as any);
    await (executor as any).executeWorkflowStep(task as any, buildStep() as any, "/tmp/test", { testMode: true, defaultProvider: "mock", defaultModelId: "scripted" }, undefined);

    const args = mockedCreateFnAgent.mock.calls.at(-1)?.[0] as any;
    expect(args?.tools).toBe("readonly");
    expect((args?.customTools ?? []).some((tool: { name?: string }) => {
      const name = String(tool.name ?? "");
      return name === "bash" || name === "Bash" || name.startsWith("agent-browser");
    })).toBe(false);
  });
});
