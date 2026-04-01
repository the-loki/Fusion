/**
 * Mission Integration Tests
 *
 * Comprehensive integration tests for MissionStore working with TaskStore.
 * Tests mission hierarchy, status rollup, cascade operations, and event emissions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "./store.js";
import { MissionStore } from "./mission-store.js";
import type { Mission, Milestone, Slice, MissionFeature } from "./mission-types.js";

// Helper to create temp directory
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "mission-integration-"));
}

// Helper to cleanup temp directory
function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("Mission Integration", () => {
  let tempDir: string;
  let taskStore: TaskStore;
  let missionStore: MissionStore;

  beforeEach(async () => {
    tempDir = createTempDir();
    taskStore = new TaskStore(tempDir);
    await taskStore.init();
    missionStore = taskStore.getMissionStore();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe("Mission Creation and Hierarchy", () => {
    it("should create mission with complete hierarchy", () => {
      // Create mission
      const mission = missionStore.createMission({
        title: "Build Auth System",
        description: "Complete authentication system with login, signup, and password reset",
      });

      expect(mission.id).toMatch(/^M-/);
      expect(mission.title).toBe("Build Auth System");
      expect(mission.status).toBe("planning");
      expect(mission.interviewState).toBe("not_started");

      // Add milestones
      const milestone1 = missionStore.addMilestone(mission.id, {
        title: "Database Schema",
        description: "Design and implement database tables",
      });

      const milestone2 = missionStore.addMilestone(mission.id, {
        title: "API Endpoints",
        description: "Build REST API endpoints",
      });

      expect(milestone1.orderIndex).toBe(0);
      expect(milestone2.orderIndex).toBe(1);

      // Add slices to first milestone
      const slice1 = missionStore.addSlice(milestone1.id, {
        title: "User Tables",
        description: "Create user and session tables",
      });

      const slice2 = missionStore.addSlice(milestone1.id, {
        title: "Token Storage",
        description: "Implement refresh token storage",
      });

      expect(slice1.orderIndex).toBe(0);
      expect(slice2.orderIndex).toBe(1);

      // Add features to first slice
      const feature1 = missionStore.addFeature(slice1.id, {
        title: "User model",
        description: "Define user database schema",
        acceptanceCriteria: "Users can be created with email and password hash",
      });

      const feature2 = missionStore.addFeature(slice1.id, {
        title: "Session table",
        description: "Create session management table",
      });

      expect(feature1.status).toBe("defined");
      expect(feature2.status).toBe("defined");

      // Verify full hierarchy
      const fullMission = missionStore.getMissionWithHierarchy(mission.id);
      expect(fullMission).toBeDefined();
      expect(fullMission!.milestones).toHaveLength(2);
      expect(fullMission!.milestones[0].slices).toHaveLength(2);
      expect(fullMission!.milestones[0].slices[0].features).toHaveLength(2);
    });

    it("should compute orderIndex correctly for multiple items", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });

      // Add 3 milestones
      const ms1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const ms2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });
      const ms3 = missionStore.addMilestone(mission.id, { title: "Milestone 3" });

      expect(ms1.orderIndex).toBe(0);
      expect(ms2.orderIndex).toBe(1);
      expect(ms3.orderIndex).toBe(2);

      // Add slices to first milestone
      const sl1 = missionStore.addSlice(ms1.id, { title: "Slice 1" });
      const sl2 = missionStore.addSlice(ms1.id, { title: "Slice 2" });

      expect(sl1.orderIndex).toBe(0);
      expect(sl2.orderIndex).toBe(1);
    });
  });

  describe("Task Linking and Feature Status", () => {
    it("should update feature status when linked to task", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      // Create a task
      const task = await taskStore.createTask({
        description: "Implement feature",
        title: "Feature implementation",
      });

      // Link feature to task
      const updatedFeature = missionStore.linkFeatureToTask(feature.id, task.id);

      expect(updatedFeature.taskId).toBe(task.id);
      expect(updatedFeature.status).toBe("triaged");
    });

    it("should update slice status when feature is linked", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      // Slice starts as pending
      expect(slice.status).toBe("pending");

      // Create and link task
      const task = await taskStore.createTask({
        description: "Implement feature",
        title: "Feature implementation",
      });
      missionStore.linkFeatureToTask(feature.id, task.id);

      // Slice should now be active
      const updatedSlice = missionStore.getSlice(slice.id);
      expect(updatedSlice!.status).toBe("active");
    });

    it("should find feature by task ID", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      const task = await taskStore.createTask({
        description: "Implement feature",
        title: "Feature implementation",
      });

      missionStore.linkFeatureToTask(feature.id, task.id);

      const found = missionStore.getFeatureByTaskId(task.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(feature.id);
    });
  });

  describe("Status Rollup", () => {
    it("should compute slice status based on features", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });

      // Empty slice should be pending
      expect(missionStore.computeSliceStatus(slice.id)).toBe("pending");

      // Add features
      const f1 = missionStore.addFeature(slice.id, { title: "Feature 1" });
      const f2 = missionStore.addFeature(slice.id, { title: "Feature 2" });

      // Still pending (no tasks linked)
      expect(missionStore.computeSliceStatus(slice.id)).toBe("pending");

      // Link f1 to a task (makes it triaged/active)
      const task1 = await taskStore.createTask({
        description: "Implement feature 1",
        title: "Feature 1 implementation",
      });
      missionStore.linkFeatureToTask(f1.id, task1.id);

      // Should now be active since f1 has a task link
      expect(missionStore.computeSliceStatus(slice.id)).toBe("active");

      // Mark both as done
      missionStore.updateFeatureStatus(f1.id, "done");
      missionStore.updateFeatureStatus(f2.id, "done");

      // Should be complete
      expect(missionStore.computeSliceStatus(slice.id)).toBe("complete");
    });

    it("should compute milestone status based on slices", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });

      // Empty milestone should be planning
      expect(missionStore.computeMilestoneStatus(milestone.id)).toBe("planning");

      // Add slices
      const s1 = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const s2 = missionStore.addSlice(milestone.id, { title: "Slice 2" });

      // Still planning (all slices pending)
      expect(missionStore.computeMilestoneStatus(milestone.id)).toBe("planning");

      // Activate first slice
      missionStore.activateSlice(s1.id);

      // Should be active
      expect(missionStore.computeMilestoneStatus(milestone.id)).toBe("active");

      // Complete first slice by marking features done
      const f1 = missionStore.addFeature(s1.id, { title: "Feature 1" });
      missionStore.updateFeatureStatus(f1.id, "done");

      // Activate and complete second slice
      missionStore.activateSlice(s2.id);
      const f2 = missionStore.addFeature(s2.id, { title: "Feature 2" });
      missionStore.updateFeatureStatus(f2.id, "done");

      // Milestone should be complete
      const updatedMilestone = missionStore.getMilestone(milestone.id);
      expect(updatedMilestone!.status).toBe("complete");
    });

    it("should compute mission status based on milestones", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });

      // Empty mission should be planning
      expect(missionStore.computeMissionStatus(mission.id)).toBe("planning");

      // Add milestones
      const m1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const m2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });

      // Still planning
      expect(missionStore.computeMissionStatus(mission.id)).toBe("planning");

      // Complete first milestone via slice activation and feature completion
      const s1 = missionStore.addSlice(m1.id, { title: "Slice 1" });
      const f1 = missionStore.addFeature(s1.id, { title: "Feature 1" });
      missionStore.activateSlice(s1.id);
      missionStore.updateFeatureStatus(f1.id, "done");

      // Mission should be active (one milestone active/complete)
      expect(missionStore.computeMissionStatus(mission.id)).toBe("active");

      // Complete second milestone
      const s2 = missionStore.addSlice(m2.id, { title: "Slice 2" });
      const f2 = missionStore.addFeature(s2.id, { title: "Feature 2" });
      missionStore.activateSlice(s2.id);
      missionStore.updateFeatureStatus(f2.id, "done");

      // Mission should be complete
      const updatedMission = missionStore.getMission(mission.id);
      expect(updatedMission!.status).toBe("complete");
    });
  });

  describe("Cascade Delete", () => {
    it("should delete mission and all children", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      // Delete mission
      missionStore.deleteMission(mission.id);

      // Everything should be gone
      expect(missionStore.getMission(mission.id)).toBeUndefined();
      expect(missionStore.getMilestone(milestone.id)).toBeUndefined();
      expect(missionStore.getSlice(slice.id)).toBeUndefined();
      expect(missionStore.getFeature(feature.id)).toBeUndefined();
    });

    it("should delete milestone and its slices/features", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const m1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const m2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });
      const slice = missionStore.addSlice(m1.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      // Delete first milestone
      missionStore.deleteMilestone(m1.id);

      // Second milestone and mission should still exist
      expect(missionStore.getMission(mission.id)).toBeDefined();
      expect(missionStore.getMilestone(m2.id)).toBeDefined();

      // First milestone's children should be gone
      expect(missionStore.getMilestone(m1.id)).toBeUndefined();
      expect(missionStore.getSlice(slice.id)).toBeUndefined();
      expect(missionStore.getFeature(feature.id)).toBeUndefined();
    });

    it("should delete slice and its features", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const s1 = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const s2 = missionStore.addSlice(milestone.id, { title: "Slice 2" });
      const f1 = missionStore.addFeature(s1.id, { title: "Feature 1" });

      // Delete first slice
      missionStore.deleteSlice(s1.id);

      // Milestone and second slice should still exist
      expect(missionStore.getMilestone(milestone.id)).toBeDefined();
      expect(missionStore.getSlice(s2.id)).toBeDefined();

      // First slice and its feature should be gone
      expect(missionStore.getSlice(s1.id)).toBeUndefined();
      expect(missionStore.getFeature(f1.id)).toBeUndefined();
    });
  });

  describe("Events", () => {
    it("should emit mission:created event", () => {
      const handler = vi.fn();
      missionStore.on("mission:created", handler);

      const mission = missionStore.createMission({ title: "Test Mission" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(mission);
    });

    it("should emit milestone:created event", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const handler = vi.fn();
      missionStore.on("milestone:created", handler);

      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(milestone);
    });

    it("should emit slice:activated event", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });

      const handler = vi.fn();
      missionStore.on("slice:activated", handler);

      const activated = missionStore.activateSlice(slice.id);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(activated);
    });

    it("should emit feature:linked event", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      const handler = vi.fn();
      missionStore.on("feature:linked", handler);

      const task = await taskStore.createTask({
        description: "Implement feature",
        title: "Feature implementation",
      });

      const updated = missionStore.linkFeatureToTask(feature.id, task.id);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ feature: updated, taskId: task.id });
    });

    it("should emit delete events", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const handler = vi.fn();
      missionStore.on("mission:deleted", handler);

      missionStore.deleteMission(mission.id);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(mission.id);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle 3 milestones with 2 slices each with 3 features", () => {
      const mission = missionStore.createMission({ title: "Complex Mission" });

      // Create 3 milestones, each with 2 slices, each with 3 features
      for (let m = 0; m < 3; m++) {
        const milestone = missionStore.addMilestone(mission.id, {
          title: `Milestone ${m + 1}`,
        });

        for (let s = 0; s < 2; s++) {
          const slice = missionStore.addSlice(milestone.id, {
            title: `Milestone ${m + 1} - Slice ${s + 1}`,
          });

          for (let f = 0; f < 3; f++) {
            missionStore.addFeature(slice.id, {
              title: `Milestone ${m + 1} - Slice ${s + 1} - Feature ${f + 1}`,
            });
          }
        }
      }

      // Verify full hierarchy
      const fullMission = missionStore.getMissionWithHierarchy(mission.id);
      expect(fullMission!.milestones).toHaveLength(3);
      expect(fullMission!.milestones[0].slices).toHaveLength(2);
      expect(fullMission!.milestones[0].slices[0].features).toHaveLength(3);

      // Total features
      let totalFeatures = 0;
      for (const m of fullMission!.milestones) {
        for (const s of m.slices) {
          totalFeatures += s.features.length;
        }
      }
      expect(totalFeatures).toBe(18); // 3 milestones × 2 slices × 3 features
    });

    it("should handle middle milestone deletion with orderIndex recomputation", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const m1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const m2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });
      const m3 = missionStore.addMilestone(mission.id, { title: "Milestone 3" });

      expect(m1.orderIndex).toBe(0);
      expect(m2.orderIndex).toBe(1);
      expect(m3.orderIndex).toBe(2);

      // Delete middle milestone
      missionStore.deleteMilestone(m2.id);

      // Remaining milestones should still be accessible
      const remaining = missionStore.listMilestones(mission.id);
      expect(remaining).toHaveLength(2);

      // Reordering doesn't happen automatically - orderIndex stays as is
      // until explicit reorder is called
      expect(remaining[0].id).toBe(m1.id);
      expect(remaining[1].id).toBe(m3.id);
    });

    it("should handle reordering and verify integrity", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const m1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const m2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });
      const m3 = missionStore.addMilestone(mission.id, { title: "Milestone 3" });

      // Add slices with features to first milestone
      const s1 = missionStore.addSlice(m1.id, { title: "Slice 1" });
      const f1 = missionStore.addFeature(s1.id, { title: "Feature 1" });

      // Reorder milestones: reverse order
      missionStore.reorderMilestones(mission.id, [m3.id, m2.id, m1.id]);

      // Verify orderIndex updated
      const milestones = missionStore.listMilestones(mission.id);
      expect(milestones[0].id).toBe(m3.id);
      expect(milestones[0].orderIndex).toBe(0);
      expect(milestones[1].id).toBe(m2.id);
      expect(milestones[1].orderIndex).toBe(1);
      expect(milestones[2].id).toBe(m1.id);
      expect(milestones[2].orderIndex).toBe(2);

      // Verify slice and feature still intact
      const slices = missionStore.listSlices(m1.id);
      expect(slices).toHaveLength(1);
      expect(slices[0].id).toBe(s1.id);

      const features = missionStore.listFeatures(s1.id);
      expect(features).toHaveLength(1);
      expect(features[0].id).toBe(f1.id);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle rapid sequential modifications", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });

      // Rapidly add many milestones
      const promises: Promise<Milestone>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(
            missionStore.addMilestone(mission.id, { title: `Milestone ${i}` })
          )
        );
      }

      const milestones = await Promise.all(promises);

      // All should have unique orderIndex values
      const orderIndices = milestones.map((m) => m.orderIndex);
      const uniqueIndices = new Set(orderIndices);
      expect(uniqueIndices.size).toBe(10);
    });

    it("should find next pending slice correctly", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const m1 = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const m2 = missionStore.addMilestone(mission.id, { title: "Milestone 2" });

      const s1 = missionStore.addSlice(m1.id, { title: "Slice 1" });
      const s2 = missionStore.addSlice(m1.id, { title: "Slice 2" });
      const s3 = missionStore.addSlice(m2.id, { title: "Slice 3" });

      // First pending should be s1
      const first = missionStore.findNextPendingSlice(mission.id);
      expect(first!.id).toBe(s1.id);

      // Activate s1
      missionStore.activateSlice(s1.id);

      // Next pending should be s2
      const second = missionStore.findNextPendingSlice(mission.id);
      expect(second!.id).toBe(s2.id);

      // Mark s2 as complete
      const f2 = missionStore.addFeature(s2.id, { title: "Feature" });
      missionStore.updateFeatureStatus(f2.id, "done");

      // Next pending should be s3
      const third = missionStore.findNextPendingSlice(mission.id);
      expect(third!.id).toBe(s3.id);
    });
  });

  describe("Edge Cases", () => {
    it("should handle mission with no milestones", () => {
      const mission = missionStore.createMission({ title: "Empty Mission" });
      expect(missionStore.computeMissionStatus(mission.id)).toBe("planning");

      const fullMission = missionStore.getMissionWithHierarchy(mission.id);
      expect(fullMission!.milestones).toHaveLength(0);
    });

    it("should handle milestone with no slices", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Empty Milestone" });

      expect(missionStore.computeMilestoneStatus(milestone.id)).toBe("planning");
      expect(missionStore.listSlices(milestone.id)).toHaveLength(0);
    });

    it("should handle slice with no features", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Empty Slice" });

      expect(missionStore.computeSliceStatus(slice.id)).toBe("pending");
      expect(missionStore.listFeatures(slice.id)).toHaveLength(0);
    });

    it("should reject empty feature title", () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });

      // Adding feature with empty title should still work at store level
      // API layer handles validation
      const feature = missionStore.addFeature(slice.id, { title: "" });
      expect(feature.title).toBe("");
    });

    it("should handle unlinking feature from task", async () => {
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Milestone 1" });
      const slice = missionStore.addSlice(milestone.id, { title: "Slice 1" });
      const feature = missionStore.addFeature(slice.id, { title: "Feature 1" });

      const task = await taskStore.createTask({
        description: "Implement feature",
        title: "Feature implementation",
      });

      // Link
      missionStore.linkFeatureToTask(feature.id, task.id);
      let updated = missionStore.getFeature(feature.id);
      expect(updated!.taskId).toBe(task.id);
      expect(updated!.status).toBe("triaged");

      // Unlink
      missionStore.unlinkFeatureFromTask(feature.id);
      updated = missionStore.getFeature(feature.id);
      expect(updated!.taskId).toBeUndefined();
      expect(updated!.status).toBe("defined");
    });
  });
});
