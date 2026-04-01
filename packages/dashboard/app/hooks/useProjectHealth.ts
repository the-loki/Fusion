import { useState, useEffect, useRef, useCallback } from "react";
import type { ProjectHealth } from "../api";
import { fetchProjectHealth } from "../api";

export interface UseMultiProjectHealthResult {
  /** Map of project ID to health data */
  healthMap: Record<string, ProjectHealth | null>;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: string | null;
  /** Manually refresh all health data */
  refresh: () => Promise<void>;
  /** Refresh a specific project's health */
  refreshProject: (projectId: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 10000; // 10 seconds
const BATCH_SIZE = 5; // Number of concurrent health fetches

/**
 * Hook for fetching health metrics for multiple projects.
 * 
 * Automatically polls every 10 seconds when the ProjectOverview is visible.
 * Stops polling when component unmounts.
 * Fetches health in batches to avoid overwhelming the server.
 */
export function useProjectHealth(projectIds: string[]): UseMultiProjectHealthResult {
  const [healthMap, setHealthMap] = useState<Record<string, ProjectHealth | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (projectIds.length === 0) {
      setHealthMap({});
      return;
    }

    // Cancel any in-flight requests
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // Fetch health in batches
      const newHealthMap: Record<string, ProjectHealth | null> = {};
      
      for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
        const batch = projectIds.slice(i, i + BATCH_SIZE);
        
        // Fetch this batch concurrently
        const batchResults = await Promise.allSettled(
          batch.map(async (id) => {
            try {
              return await fetchProjectHealth(id);
            } catch {
              return null;
            }
          })
        );

        batch.forEach((id, index) => {
          const result = batchResults[index];
          newHealthMap[id] = result.status === "fulfilled" ? result.value : null;
        });

        // Check for cancellation between batches
        if (abortRef.current?.signal.aborted) {
          return;
        }
      }

      setHealthMap(newHealthMap);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Ignore abort errors
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to fetch health data");
    } finally {
      setLoading(false);
    }
  }, [projectIds]);

  const refreshProject = useCallback(async (projectId: string) => {
    try {
      const health = await fetchProjectHealth(projectId);
      setHealthMap((prev) => ({
        ...prev,
        [projectId]: health,
      }));
    } catch (err) {
      console.error(`Failed to fetch health for project ${projectId}:`, err);
    }
  }, []);

  // Initial fetch and when project IDs change
  useEffect(() => {
    refresh();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [refresh]);

  // Polling - refresh every 10 seconds
  useEffect(() => {
    if (projectIds.length === 0) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Start new polling interval
    intervalRef.current = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refresh, projectIds.length]);

  return {
    healthMap,
    loading,
    error,
    refresh,
    refreshProject,
  };
}
