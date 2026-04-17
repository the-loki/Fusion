import { useState, useEffect, useCallback } from "react";
import type { Agent, AgentState, AgentCapability, AgentStats } from "../api";
import { fetchAgents, fetchAgentStats } from "../api";
import { isEphemeralAgent } from "@fusion/core";
import { subscribeSse } from "../sse-bus";

export function useAgents(projectId?: string) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAgents = useCallback(async (filter?: { state?: AgentState; role?: AgentCapability }) => {
    setIsLoading(true);
    try {
      // By default, fetchAgents excludes ephemeral agents (handled by API)
      const data = await fetchAgents(filter, projectId);
      setAgents(data);
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchAgentStats(projectId);
      setStats(data);
    } catch (err) {
      console.error("Failed to load agent stats:", err);
    }
  }, [projectId]);

  useEffect(() => {
    void loadAgents();
    void loadStats();
  }, [loadAgents, loadStats]);

  // SSE subscription for agent events
  useEffect(() => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const refresh = () => {
      void loadAgents();
      void loadStats();
    };

    return subscribeSse(`/api/events${query}`, {
      events: {
        "agent:created": refresh,
        "agent:updated": refresh,
        "agent:deleted": refresh,
        "agent:stateChanged": refresh,
      },
    });
  }, [projectId, loadAgents, loadStats]);

  const activeAgents = agents.filter(a =>
    (a.state === "active" || a.state === "running") && !isEphemeralAgent(a)
  );

  return { agents, activeAgents, stats, isLoading, loadAgents, loadStats };
}
