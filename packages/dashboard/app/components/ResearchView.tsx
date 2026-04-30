import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResearchRun, ResearchRunStatus } from "@fusion/core";
import { getResearchStats, listResearchRuns } from "../api";
import "./ResearchView.css";

interface ResearchViewProps {
  projectId?: string;
  addToast?: (message: string, type?: "success" | "error" | "info") => void;
}

interface ResearchStats {
  total: number;
  byStatus: Record<ResearchRunStatus, number>;
}

const STATUS_LABELS: Record<ResearchRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function ResearchView({ projectId, addToast }: ResearchViewProps) {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [runsResponse, statsResponse] = await Promise.all([
        listResearchRuns({ limit: 50 }, projectId),
        getResearchStats(projectId),
      ]);
      setRuns(runsResponse.runs);
      setStats(statsResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load research runs";
      setError(message);
      addToast?.(message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasResults = useMemo(
    () => runs.some((run) => run.status === "completed" && run.results?.summary),
    [runs],
  );

  return (
    <section className="research-view" aria-label="Research view">
      <header className="research-view__header">
        <div>
          <h2 className="research-view__title">Research</h2>
          <p className="research-view__subtitle">Track synthesis runs, source collection, and export artifacts.</p>
        </div>
        <button className="btn" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {isLoading && (
        <div className="research-view__state card" data-testid="research-state-loading">
          Loading research runs…
        </div>
      )}

      {!isLoading && error && (
        <div className="research-view__state research-view__state--error card" data-testid="research-state-error">
          <p>{error}</p>
          <button className="btn btn-danger" type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && runs.length === 0 && (
        <div className="research-view__state card" data-testid="research-state-empty">
          No research runs yet. Start a run from the API or upcoming orchestration workflow.
        </div>
      )}

      {!isLoading && !error && runs.length > 0 && (
        <>
          <div className="research-view__stats" data-testid="research-state-running">
            <div className="card research-view__stat-card">
              <div className="research-view__stat-label">Total Runs</div>
              <div className="research-view__stat-value">{stats?.total ?? runs.length}</div>
            </div>
            <div className="card research-view__stat-card">
              <div className="research-view__stat-label">Running</div>
              <div className="research-view__stat-value">{stats?.byStatus.running ?? 0}</div>
            </div>
            <div className="card research-view__stat-card">
              <div className="research-view__stat-label">Completed</div>
              <div className="research-view__stat-value">{stats?.byStatus.completed ?? 0}</div>
            </div>
          </div>

          <div className="research-view__list">
            {runs.map((run) => (
              <article key={run.id} className="card research-view__run-card">
                <div className="research-view__run-head">
                  <span
                    className={`card-status-badge ${
                      run.status === "failed"
                        ? "research-view__status-badge--failed"
                        : `card-status-badge--${
                            run.status === "pending"
                              ? "todo"
                              : run.status === "running"
                                ? "in-progress"
                                : run.status === "completed"
                                  ? "done"
                                  : "archived"
                          }`
                    }`}
                  >
                    {STATUS_LABELS[run.status]}
                  </span>
                  <span className="card-id">{run.id}</span>
                </div>
                <h3 className="research-view__run-title">{run.topic || run.query}</h3>
                <p className="research-view__run-query">{run.query}</p>
                {run.results?.summary && <p data-testid="research-state-results">{run.results.summary}</p>}
              </article>
            ))}
          </div>

          {!hasResults && (
            <p className="research-view__hint">Runs are active, but no summarized results are available yet.</p>
          )}
        </>
      )}
    </section>
  );
}
