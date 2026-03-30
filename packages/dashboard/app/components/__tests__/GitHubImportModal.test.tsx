import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GitHubImportModal } from "../GitHubImportModal";
import { apiFetchGitHubIssues, apiImportGitHubIssue } from "../../api";
import type { Task } from "@kb/core";

// Mock the API module
vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    apiFetchGitHubIssues: vi.fn(),
    apiImportGitHubIssue: vi.fn(),
    fetchGitRemotes: vi.fn().mockResolvedValue([]),
  };
});

const mockTask: Task = {
  id: "KB-001",
  title: "Test Issue",
  description: "Test body\n\nSource: https://github.com/owner/repo/issues/1",
  column: "triage",
  dependencies: [],
  steps: [],
  currentStep: 0,
  log: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("GitHubImportModal", () => {
  const onClose = vi.fn();
  const onImport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when isOpen is true", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    expect(screen.getByText("Import from GitHub")).toBeTruthy();
  });

  it("does not render when isOpen is false", () => {
    render(<GitHubImportModal isOpen={false} onClose={onClose} onImport={onImport} tasks={[]} />);
    expect(screen.queryByText("Import from GitHub")).toBeNull();
  });

  it("has owner and repo inputs", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    expect(screen.getByLabelText("Owner")).toBeTruthy();
    expect(screen.getByLabelText("Repo")).toBeTruthy();
  });

  it("has optional labels input", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    expect(screen.getByLabelText(/Labels/)).toBeTruthy();
  });

  it("disables Load button when owner or repo is empty", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    const loadButton = screen.getByRole("button", { name: /Load/i }) as HTMLButtonElement;
    expect(loadButton.disabled).toBe(true);
  });

  it("enables Load button when owner and repo are filled", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    const ownerInput = screen.getByLabelText("Owner");
    const repoInput = screen.getByLabelText("Repo");

    fireEvent.change(ownerInput, { target: { value: "dustinbyrne" } });
    fireEvent.change(repoInput, { target: { value: "kb" } });

    const loadButton = screen.getByRole("button", { name: /Load/i }) as HTMLButtonElement;
    expect(loadButton.disabled).toBe(false);
  });

  it("calls apiFetchGitHubIssues when Load is clicked", async () => {
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce([]);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    const ownerInput = screen.getByLabelText("Owner");
    const repoInput = screen.getByLabelText("Repo");

    fireEvent.change(ownerInput, { target: { value: "dustinbyrne" } });
    fireEvent.change(repoInput, { target: { value: "kb" } });

    const loadButton = screen.getByRole("button", { name: /Load/i });
    fireEvent.click(loadButton);

    await waitFor(() => {
      expect(apiFetchGitHubIssues).toHaveBeenCalledWith("dustinbyrne", "kb", 30, undefined);
    });
  });

  it("displays fetched issues after loading", async () => {
    const issues = [
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
      { number: 2, title: "Second Issue", body: "Body 2", html_url: "https://github.com/owner/repo/issues/2", labels: [] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    const ownerInput = screen.getByLabelText("Owner");
    const repoInput = screen.getByLabelText("Repo");

    fireEvent.change(ownerInput, { target: { value: "owner" } });
    fireEvent.change(repoInput, { target: { value: "repo" } });

    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("First Issue")).toBeTruthy();
      expect(screen.getByText("Second Issue")).toBeTruthy();
    });
  });

  it("selects an issue when clicked", async () => {
    const issues = [
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("First Issue")).toBeTruthy();
    });

    const radio = screen.getByRole("radio") as HTMLInputElement;
    fireEvent.click(radio);

    expect(radio.checked).toBe(true);
  });

  it("disables Import button when no issue is selected", async () => {
    const issues = [
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("First Issue")).toBeTruthy();
    });

    const importButton = screen.getByRole("button", { name: /Import$/i }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
  });

  it("calls apiImportGitHubIssue and onImport when Import is clicked", async () => {
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce([
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
    ]);
    vi.mocked(apiImportGitHubIssue).mockResolvedValueOnce(mockTask);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("First Issue")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("radio"));
    fireEvent.click(screen.getByRole("button", { name: /Import$/i }));

    await waitFor(() => {
      expect(apiImportGitHubIssue).toHaveBeenCalledWith("owner", "repo", 1);
      expect(onImport).toHaveBeenCalledWith(mockTask);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows 'Imported' badge for already imported issues", async () => {
    const existingTask: Task = {
      ...mockTask,
      description: "Existing\n\nSource: https://github.com/owner/repo/issues/1",
    };
    const issues = [
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[existingTask]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("Imported")).toBeTruthy();
    });
  });

  it("disables radio buttons for already imported issues", async () => {
    const existingTask: Task = {
      ...mockTask,
      description: "Existing\n\nSource: https://github.com/owner/repo/issues/1",
    };
    const issues = [
      { number: 1, title: "First Issue", body: "Body 1", html_url: "https://github.com/owner/repo/issues/1", labels: [] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[existingTask]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      const radio = screen.getByRole("radio") as HTMLInputElement;
      expect(radio.disabled).toBe(true);
    });
  });

  it("displays error on fetch failure", async () => {
    vi.mocked(apiFetchGitHubIssues).mockRejectedValueOnce(new Error("Repository not found"));

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("Repository not found")).toBeTruthy();
    });
  });

  it("closes modal on Cancel button click", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes modal on X button click", () => {
    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.click(screen.getByText("×"));
    expect(onClose).toHaveBeenCalled();
  });

  it("displays label chips for issues with labels", async () => {
    const issues = [
      { number: 1, title: "Bug Issue", body: "Body", html_url: "https://github.com/owner/repo/issues/1", labels: [{ name: "bug" }, { name: "urgent" }] },
    ];
    vi.mocked(apiFetchGitHubIssues).mockResolvedValueOnce(issues);

    render(<GitHubImportModal isOpen={true} onClose={onClose} onImport={onImport} tasks={[]} />);
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Repo"), { target: { value: "repo" } });
    fireEvent.click(screen.getByRole("button", { name: /Load/i }));

    await waitFor(() => {
      expect(screen.getByText("bug")).toBeTruthy();
      expect(screen.getByText("urgent")).toBeTruthy();
    });
  });
});
