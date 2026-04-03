import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SelfHealingManager } from "./self-healing.js";
import type { TaskStore, Settings, Task } from "@fusion/core";
import { EventEmitter } from "node:events";

// ── Mock helpers ────────────────────────────────────────────────────

/** TaskStore mock backed by a real EventEmitter so settings:updated works. */
function createMockStore(overrides: Record<string, unknown> = {}): TaskStore & EventEmitter {
  const emitter = new EventEmitter();
  const store = Object.assign(emitter, {
    getSettings: vi.fn().mockResolvedValue({
      autoUnpauseEnabled: true,
      autoUnpauseBaseDelayMs: 100,
      autoUnpauseMaxDelayMs: 800,
      maxStuckKills: 3,
      maintenanceIntervalMs: 0,
      maxWorktrees: 4,
      globalPause: true, // default: paused (for auto-unpause tests)
    } as unknown as Settings),
    updateSettings: vi.fn().mockResolvedValue({} as Settings),
    getTask: vi.fn().mockResolvedValue({
      id: "FN-001",
      stuckKillCount: 0,
    } as unknown as Task),
    updateTask: vi.fn().mockResolvedValue({} as Task),
    logEntry: vi.fn().mockResolvedValue(undefined),
    moveTask: vi.fn().mockResolvedValue(undefined),
    walCheckpoint: vi.fn().mockReturnValue({ busy: 0, log: 5, checkpointed: 5 }),
    listTasks: vi.fn().mockResolvedValue([]),
    getRootDir: vi.fn().mockReturnValue("/tmp/test-project"),
    ...overrides,
  }) as unknown as TaskStore & EventEmitter;
  return store;
}

describe("SelfHealingManager", () => {
  let store: TaskStore & EventEmitter;
  let manager: SelfHealingManager;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    store = createMockStore();
    manager = new SelfHealingManager(store, { rootDir: "/tmp/test-project" });
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  // ── Auto-unpause ─────────────────────────────────────────────────

  describe("auto-unpause", () => {
    it("schedules unpause when globalPause transitions false→true", async () => {
      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 100, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(150);

      expect(store.updateSettings).toHaveBeenCalledWith({ globalPause: false });
    });

    it("does not schedule unpause when autoUnpauseEnabled is false", async () => {
      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: false },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(500);

      expect(store.updateSettings).not.toHaveBeenCalled();
    });

    it("does not fire when already unpaused before timer", async () => {
      // When the timer fires, getSettings returns globalPause: false
      (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        globalPause: false,
        maintenanceIntervalMs: 0,
      } as unknown as Settings);

      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 100, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(150);

      expect(store.updateSettings).not.toHaveBeenCalled();
    });

    it("escalates backoff when pause re-triggers within 60s", async () => {
      manager.start();

      // First pause
      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 100, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(150);
      expect(store.updateSettings).toHaveBeenCalledTimes(1);

      // Simulate successful unpause
      store.emit("settings:updated", {
        settings: { globalPause: false },
        previous: { globalPause: true },
      });

      // Immediately re-trigger pause (within 60s window)
      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 100, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      // Escalated delay = 200ms. At 150ms it should NOT have fired yet.
      await vi.advanceTimersByTimeAsync(150);
      expect(store.updateSettings).toHaveBeenCalledTimes(1);

      // At 250ms total (100ms more) it should fire
      await vi.advanceTimersByTimeAsync(100);
      expect(store.updateSettings).toHaveBeenCalledTimes(2);
    });

    it("cancels timer on manual unpause (true→false)", async () => {
      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 200, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      // Manual unpause before timer fires
      store.emit("settings:updated", {
        settings: { globalPause: false },
        previous: { globalPause: true },
      });

      await vi.advanceTimersByTimeAsync(300);

      expect(store.updateSettings).not.toHaveBeenCalled();
    });

    it("ignores false→false transitions", async () => {
      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: false },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(500);

      expect(store.updateSettings).not.toHaveBeenCalled();
    });
  });

  // ── Stuck kill budget ─────────────────────────────────────────────

  describe("checkStuckBudget", () => {
    it("returns true and increments count when within budget", async () => {
      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(true);
      expect(store.updateTask).toHaveBeenCalledWith("FN-001", { stuckKillCount: 1 });
      expect(store.logEntry).toHaveBeenCalledWith(
        "FN-001",
        expect.stringContaining("Stuck kill 1/3"),
      );
    });

    it("returns true for subsequent kills within budget", async () => {
      (store.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "FN-001",
        stuckKillCount: 2,
      } as unknown as Task);

      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(true);
      expect(store.updateTask).toHaveBeenCalledWith("FN-001", { stuckKillCount: 3 });
    });

    it("returns false and marks failed when budget exceeded", async () => {
      (store.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "FN-001",
        stuckKillCount: 3,
      } as unknown as Task);

      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(false);
      expect(store.updateTask).toHaveBeenCalledWith("FN-001", {
        stuckKillCount: 4,
        status: "failed",
        error: expect.stringContaining("exceeded maximum of 3"),
      });
      expect(store.logEntry).toHaveBeenCalledWith(
        "FN-001",
        expect.stringContaining("Permanently failed"),
      );
    });

    it("respects custom maxStuckKills setting", async () => {
      (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        maxStuckKills: 1,
        maintenanceIntervalMs: 0,
      } as unknown as Settings);
      (store.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "FN-001",
        stuckKillCount: 1,
      } as unknown as Task);

      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(false);
    });

    it("returns true on error (safe fallback)", async () => {
      (store.getTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(true);
    });

    it("handles undefined stuckKillCount as 0", async () => {
      (store.getTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "FN-001",
      } as unknown as Task);

      manager.start();

      const result = await manager.checkStuckBudget("FN-001");

      expect(result).toBe(true);
      expect(store.updateTask).toHaveBeenCalledWith("FN-001", { stuckKillCount: 1 });
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("starts and stops without error", () => {
      manager.start();
      manager.stop();
    });

    it("cleans up timers on stop", async () => {
      manager.start();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 500, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      manager.stop();

      await vi.advanceTimersByTimeAsync(1000);
      expect(store.updateSettings).not.toHaveBeenCalled();
    });

    it("does not respond to events after stop", async () => {
      manager.start();
      manager.stop();

      store.emit("settings:updated", {
        settings: { globalPause: true, autoUnpauseEnabled: true, autoUnpauseBaseDelayMs: 100, autoUnpauseMaxDelayMs: 800 },
        previous: { globalPause: false },
      });

      await vi.advanceTimersByTimeAsync(200);
      expect(store.updateSettings).not.toHaveBeenCalled();
    });
  });
});
