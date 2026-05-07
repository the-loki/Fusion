import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@fusion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphTaskNode } from "../GraphTaskNode";
import { TaskCard } from "@fusion/dashboard/app/components/TaskCard";

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-TEST",
    description: "Task description",
    column: "todo",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    ...overrides,
  } as Task;
}

function createProps(task: Task) {
  return {
    task,
    projectId: "proj-1",
    onOpenDetail: vi.fn(),
    addToast: vi.fn(),
    onUpdateTask: vi.fn(),
    onArchiveTask: vi.fn(),
    onUnarchiveTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onRetryTask: vi.fn(),
    onOpenDetailWithTab: vi.fn(),
    onMoveTask: vi.fn(),
    onOpenMission: vi.fn(),
    taskStuckTimeoutMs: 60_000,
    lastFetchTimeMs: Date.now(),
    workflowStepNameLookup: new Map<string, string>(),
  };
}

afterEach(() => {
  cleanup();
});

describe("GraphTaskNode", () => {
  it("renders a TaskCard and passes core props through", () => {
    const props = createProps(createTask());
    const { container } = render(<GraphTaskNode {...props} style={{ left: 10, top: 20 }} />);

    const node = screen.getByTestId("graph-task-node-FN-TEST");
    expect(node).toBeTruthy();
    expect(container.querySelector(".card-title")?.textContent).toContain("Task description");
    expect(node.getAttribute("draggable")).toBe("false");
    expect(container.querySelector(".card")?.getAttribute("draggable")).toBe("false");
  });

  it("shows steps expanded and agent-active styling for in-progress executing tasks", () => {
    const props = createProps(
      createTask({
        column: "in-progress",
        status: "executing",
        steps: [
          { name: "step one", status: "in-progress" },
          { name: "step two", status: "pending" },
        ],
        currentStep: 0,
      }),
    );

    const { container } = render(<GraphTaskNode {...props} />);
    expect(container.querySelector(".card")?.className).toContain("agent-active");
    expect(container.querySelector(".card-steps-list")).toBeTruthy();
  });

  it("clicking card opens task detail", () => {
    const props = createProps(createTask());
    const { container } = render(<GraphTaskNode {...props} />);

    const card = container.querySelector(".card");
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(props.onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: "FN-TEST" }));
  });

  it("applies highlighted class only when requested", () => {
    const highlightedProps = createProps(createTask({ id: "FN-HL" }));
    const neutralProps = createProps(createTask({ id: "FN-NEUTRAL" }));

    const { unmount } = render(<GraphTaskNode {...highlightedProps} isHighlighted={true} />);
    expect(screen.getByTestId("graph-task-node-FN-HL").className).toContain("graph-task-node--highlighted");
    unmount();

    render(<GraphTaskNode {...neutralProps} />);
    const neutral = screen.getByTestId("graph-task-node-FN-NEUTRAL");
    expect(neutral.className).not.toContain("graph-task-node--highlighted");
    expect(neutral.className).not.toContain("graph-task-node--dimmed");
  });

  it("renders the same TaskCard structure as board usage", () => {
    const task = createTask({
      id: "FN-SAME",
      column: "in-progress",
      status: "executing",
      error: "Execution failed",
      missionId: "M-1",
      sourceType: "automation",
      sourceAgentId: "agent-1",
      steps: [{ name: "sync", status: "in-progress" }],
      currentStep: 0,
    });
    const props = createProps(task);

    const { container } = render(
      <div>
        <TaskCard {...props} disableDrag={true} />
        <GraphTaskNode {...props} />
      </div>,
    );

    const cards = container.querySelectorAll(".card");
    expect(cards.length).toBe(2);

    const [boardCard, graphCard] = cards;
    const selectors = [
      ".card-id",
      ".card-title",
      ".card-status-badge",
      ".card-step-dot",
      ".card-step-name",
      ".card-progress",
      ".card-progress-fill",
      ".card-error",
      ".card-mission-badge",
      ".card-provider-icons",
      ".card-agent-badge",
    ];

    for (const selector of selectors) {
      expect(Boolean(boardCard.querySelector(selector))).toBe(Boolean(graphCard.querySelector(selector)));
    }

    expect(Boolean(boardCard.querySelector(".card-error"))).toBe(Boolean(graphCard.querySelector(".card-error")));
    expect(boardCard.querySelector(".card-id")?.textContent).toBe(graphCard.querySelector(".card-id")?.textContent);
    expect(boardCard.querySelector(".card-title")?.textContent).toBe(graphCard.querySelector(".card-title")?.textContent);
  });
});
