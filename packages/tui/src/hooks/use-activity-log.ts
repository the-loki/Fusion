/**
 * useActivityLog - React hook for subscribing to activity log events and maintaining live entries.
 *
 * This hook bridges the gap between Node.js EventEmitter and React's state model,
 * enabling TUI components to display live activity data without polling.
 */

import { useState, useEffect, useCallback } from "react";
import type { ActivityLogEntry, ActivityEventType, AgentLogEntry } from "@fusion/core";
import { useFusion } from "../fusion-context.js";

/**
 * Options for the useActivityLog hook.
 */
export interface UseActivityLogOptions {
  /** Maximum number of entries to keep (oldest trimmed from tail) */
  limit?: number;
  /** Filter to only show entries of this type */
  type?: ActivityEventType;
}

/**
 * Return type for the useActivityLog hook.
 */
export interface UseActivityLogResult {
  /** Current list of activity log entries (most recent first) */
  entries: ActivityLogEntry[];
  /** Whether initial data fetch is in progress */
  loading: boolean;
  /** Error from initial fetch, or null if successful */
  error: Error | null;
  /** Manual refresh function to re-fetch entries from the store */
  refresh: () => Promise<void>;
}

/**
 * Hook that subscribes to activity log events and maintains a live list of entries.
 *
 * - On mount, fetches initial entries from `store.getActivityLog()`
 * - Subscribes to TaskStore's `agent:log` event
 * - Prepends new entries to the list (most recent first)
 * - Respects the `limit` option by trimming from the tail
 * - If `type` filter is set, only includes entries matching that type
 * - Cleans up event listeners on unmount
 *
 * @param options - Optional configuration: `{ limit?: number; type?: ActivityEventType }`
 * @returns { entries: ActivityLogEntry[], loading: boolean, error: Error | null, refresh: () => Promise<void> }
 *
 * @example
 * ```tsx
 * function ActivityFeed() {
 *   const { entries, loading, error, refresh } = useActivityLog({ limit: 50 });
 *
 *   if (loading) return <Text>Loading activity...</Text>;
 *   if (error) return <Text color="red">{error.message}</Text>;
 *
 *   return (
 *     <Box flexDirection="column">
 *       {entries.map(entry => (
 *         <Text key={entry.id}>{entry.type}: {entry.details}</Text>
 *       ))}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useActivityLog(options?: UseActivityLogOptions): UseActivityLogResult {
  const { store } = useFusion();
  const { limit = 100, type } = options ?? {};

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial entries
  const fetchEntries = useCallback(async () => {
    try {
      const initialEntries = await store.getActivityLog({ limit, type });
      setEntries(initialEntries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [store, limit, type]);

  useEffect(() => {
    let cancelled = false;

    // Fetch initial entries
    fetchEntries().then(() => {
      if (cancelled) return;
    });

    // Handler for agent:log events - convert AgentLogEntry to ActivityLogEntry format
    const handleAgentLog = (entry: AgentLogEntry) => {
      // Convert AgentLogEntry to ActivityLogEntry for display
      const activityEntry: ActivityLogEntry = {
        id: `agent-${entry.taskId}-${entry.timestamp}`,
        taskId: entry.taskId,
        timestamp: entry.timestamp,
        type: "task:updated" as ActivityEventType, // agent:log doesn't map directly to activity types
        details: entry.detail ?? entry.text,
      };

      // If type filter is set, only include matching entries
      if (type && activityEntry.type !== type) {
        return;
      }

      setEntries((prev) => {
        const newEntries = [activityEntry, ...prev];
        // Trim to limit
        if (limit && newEntries.length > limit) {
          return newEntries.slice(0, limit);
        }
        return newEntries;
      });
    };

    // Subscribe to event
    store.on("agent:log", handleAgentLog);

    // Cleanup function
    return () => {
      cancelled = true;
      store.off("agent:log", handleAgentLog);
    };
  }, [store, limit, type, fetchEntries]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, error, refresh };
}
