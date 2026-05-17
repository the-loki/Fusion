import { beforeEach, describe, expect, it, vi } from "vitest";

import { SWR_CACHE_KEYS, clearCache, readCache, writeCache } from "../swrCache";

describe("swrCache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns null on cache miss", () => {
    expect(readCache("missing")).toBeNull();
  });

  it("writes and reads cache payload", () => {
    const payload = { value: "ok", count: 2 };
    writeCache("demo", payload);

    expect(readCache<typeof payload>("demo")).toEqual(payload);
  });

  it("does not write when payload exceeds maxBytes", () => {
    writeCache("large", { value: "0123456789" }, { maxBytes: 5 });

    expect(localStorage.getItem("large")).toBeNull();
  });

  it("clearCache removes only matching prefix keys", () => {
    const backing = new Map<string, string>();
    const storage = {
      get length() {
        return backing.size;
      },
      key: (index: number) => Array.from(backing.keys())[index] ?? null,
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => {
        backing.clear();
      },
    } satisfies Storage;

    vi.stubGlobal("localStorage", storage);

    writeCache(`${SWR_CACHE_KEYS.TASKS_PREFIX}a`, [{ id: "1" }]);
    writeCache(`${SWR_CACHE_KEYS.TASKS_PREFIX}b`, [{ id: "2" }]);
    writeCache(SWR_CACHE_KEYS.PROJECTS, [{ id: "p" }]);

    clearCache(SWR_CACHE_KEYS.TASKS_PREFIX);

    expect(readCache(`${SWR_CACHE_KEYS.TASKS_PREFIX}a`)).toBeNull();
    expect(readCache(`${SWR_CACHE_KEYS.TASKS_PREFIX}b`)).toBeNull();
    expect(readCache(SWR_CACHE_KEYS.PROJECTS)).toEqual([{ id: "p" }]);
  });

  it("exports expected extended cache keys", () => {
    expect(SWR_CACHE_KEYS.INSIGHTS_PREFIX).toBe("kb-dashboard-insights-cache:");
    expect(SWR_CACHE_KEYS.INSIGHT_LATEST_RUN_PREFIX).toBe("kb-dashboard-insight-latest-run-cache:");
    expect(SWR_CACHE_KEYS.RESEARCH_RUNS_PREFIX).toBe("kb-dashboard-research-runs-cache:");
    expect(SWR_CACHE_KEYS.RESEARCH_SELECTED_ID_PREFIX).toBe("kb-dashboard-research-selected-cache:");
    expect(SWR_CACHE_KEYS.EVALS_RUNS_PREFIX).toBe("kb-dashboard-evals-runs-cache:");
    expect(SWR_CACHE_KEYS.EVALS_RESULTS_PREFIX).toBe("kb-dashboard-evals-results-cache:");
    expect(SWR_CACHE_KEYS.MISSIONS_PREFIX).toBe("kb-dashboard-missions-cache:");
    expect(SWR_CACHE_KEYS.MISSIONS_SELECTED_ID_PREFIX).toBe("kb-dashboard-mission-selected-cache:");
    expect(SWR_CACHE_KEYS.MAILBOX_INBOX_PREFIX).toBe("kb-dashboard-mailbox-inbox-cache:");
    expect(SWR_CACHE_KEYS.MAILBOX_OUTBOX_PREFIX).toBe("kb-dashboard-mailbox-outbox-cache:");
    expect(SWR_CACHE_KEYS.MAILBOX_UNREAD_COUNT_PREFIX).toBe("kb-dashboard-mailbox-unread-cache:");
  });

  it("swallows quota errors", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => writeCache("quota", { ok: true })).not.toThrow();
  });
});
