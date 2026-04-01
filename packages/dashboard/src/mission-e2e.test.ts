/**
 * Mission API End-to-End Tests
 *
 * Tests for mission REST API endpoints using the test-request pattern.
 * Uses mocked MissionStore following routes.test.ts patterns.
 */

// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import express from "express";
import { createMissionRouter } from "./mission-routes.js";
import { request, get } from "./test-request.js";
import type { TaskStore } from "@fusion/core";
import type {
  Mission,
  Milestone,
  Slice,
  MissionFeature,
  MissionWithHierarchy,
} from "@fusion/core";

// Mock MissionStore factory
function createMockMissionStore() {
  const missions: Map<string, Mission> = new Map();
  const milestones: Map<string, Milestone> = new Map();
  const slices: Map<string, Slice> = new Map();
  const features: Map<string, MissionFeature> = new Map();

  let missionCounter = 1;
  let milestoneCounter = 1;
  let sliceCounter = 1;
  let featureCounter = 1;

  const generateMissionId = () => `M-${missionCounter++}`;
  const generateMilestoneId = () => `MS-${milestoneCounter++}`;
  const generateSliceId = () => `SL-${sliceCounter++}`;
  const generateFeatureId = () => `F-${featureCounter++}`;

  return {
    createMission: vi.fn((input: { title: string; description?: string }) => {
      const mission: Mission = {
        id: generateMissionId(),
        title: input.title,
        description: input.description,
        status: "planning",
        interviewState: "not_started",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      missions.set(mission.id, mission);
      return mission;
    }),

    getMission: vi.fn((id: string) => missions.get(id)),

    getMissionWithHierarchy: vi.fn((id: string) => {
      const mission = missions.get(id);
      if (!mission) return undefined;

      const missionMilestones = Array.from(milestones.values())
        .filter((m) => m.missionId === id)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      return {
        ...mission,
        milestones: missionMilestones.map((m) => ({
          ...m,
          slices: Array.from(slices.values())
            .filter((s) => s.milestoneId === m.id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((s) => ({
              ...s,
              features: Array.from(features.values()).filter(
                (f) => f.sliceId === s.id
              ),
            })),
        })),
      } as MissionWithHierarchy;
    }),

    listMissions: vi.fn(() =>
      Array.from(missions.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    ),

    updateMission: vi.fn((id: string, updates: Partial<Mission>) => {
      const mission = missions.get(id);
      if (!mission) throw new Error("Mission " + id + " not found");
      const updated = { ...mission, ...updates, updatedAt: new Date().toISOString() };
      missions.set(id, updated);
      return updated;
    }),

    deleteMission: vi.fn((id: string) => {
      if (!missions.has(id)) throw new Error("Mission " + id + " not found");
      missions.delete(id);
    }),

    addMilestone: vi.fn((missionId: string, input: { title: string; description?: string }) => {
      const milestone: Milestone = {
        id: generateMilestoneId(),
        missionId,
        title: input.title,
        description: input.description,
        status: "planning",
        orderIndex: Array.from(milestones.values()).filter((m) => m.missionId === missionId).length,
        interviewState: "not_started",
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      milestones.set(milestone.id, milestone);
      return milestone;
    }),

    getMilestone: vi.fn((id: string) => milestones.get(id)),

    addSlice: vi.fn((milestoneId: string, input: { title: string; description?: string }) => {
      const slice: Slice = {
        id: generateSliceId(),
        milestoneId,
        title: input.title,
        description: input.description,
        status: "pending",
        orderIndex: Array.from(slices.values()).filter((s) => s.milestoneId === milestoneId).length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      slices.set(slice.id, slice);
      return slice;
    }),

    getSlice: vi.fn((id: string) => slices.get(id)),

    addFeature: vi.fn((sliceId: string, input: { title: string; description?: string }) => {
      const feature: MissionFeature = {
        id: generateFeatureId(),
        sliceId,
        title: input.title,
        description: input.description,
        status: "defined",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      features.set(feature.id, feature);
      return feature;
    }),

    getFeature: vi.fn((id: string) => features.get(id)),

    activateSlice: vi.fn((id: string) => {
      const slice = slices.get(id);
      if (!slice) throw new Error("Slice " + id + " not found");
      const updated = {
        ...slice,
        status: "active" as const,
        activatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      slices.set(id, updated);
      return updated;
    }),

    linkFeatureToTask: vi.fn((featureId: string, taskId: string) => {
      const feature = features.get(featureId);
      if (!feature) throw new Error("Feature " + featureId + " not found");
      const updated = { ...feature, taskId, status: "triaged" as const, updatedAt: new Date().toISOString() };
      features.set(featureId, updated);
      return updated;
    }),

    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

function createMockStore(): TaskStore {
  return {
    getMissionStore: vi.fn().mockReturnValue(createMockMissionStore()),
  } as unknown as TaskStore;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  const store = createMockStore();
  app.use("/api/missions", createMissionRouter(store));
  return { app, store, missionStore: store.getMissionStore() };
}

describe("Mission API", () => {
  describe("GET /api/missions", () => {
    it("should list all missions", async () => {
      const { app, missionStore } = buildApp();
      missionStore.createMission({ title: "Mission 1" });
      missionStore.createMission({ title: "Mission 2" });

      const res = await get(app, "/api/missions");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it("should return empty array when no missions", async () => {
      const { app } = buildApp();
      const res = await get(app, "/api/missions");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /api/missions/:missionId", () => {
    it("should get mission with hierarchy", async () => {
      const { app, missionStore } = buildApp();
      const mission = missionStore.createMission({ title: "Test Mission" });

      const res = await get(app, `/api/missions/${mission.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(mission.id);
      expect(res.body.title).toBe("Test Mission");
    });

    it("should return 404 for non-existent mission", async () => {
      const { app } = buildApp();
      const res = await get(app, "/api/missions/M-999");
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/missions/:missionId", () => {
    it("should delete mission", async () => {
      const { app, missionStore } = buildApp();
      const mission = missionStore.createMission({ title: "To Delete" });

      const res = await request(app, "DELETE", `/api/missions/${mission.id}`);

      expect(res.status).toBe(204);
    });
  });

  describe("Slice activation", () => {
    it("should activate a pending slice", async () => {
      const { app, missionStore } = buildApp();
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Test Milestone" });
      const slice = missionStore.addSlice(milestone.id, { title: "Test Slice" });

      const res = await request(app, "POST", `/api/missions/slices/${slice.id}/activate`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("active");
    });
  });

  describe("Feature linking", () => {
    it("should link feature to task", async () => {
      const { app, missionStore } = buildApp();
      const mission = missionStore.createMission({ title: "Test Mission" });
      const milestone = missionStore.addMilestone(mission.id, { title: "Test Milestone" });
      const slice = missionStore.addSlice(milestone.id, { title: "Test Slice" });
      const feature = missionStore.addFeature(slice.id, { title: "Test Feature" });

      const res = await request(
        app,
        "POST",
        `/api/missions/features/${feature.id}/link-task`,
        JSON.stringify({ taskId: "FN-001" }),
        { "content-type": "application/json" }
      );

      expect(res.status).toBe(200);
      expect(res.body.taskId).toBe("FN-001");
    });
  });

  describe("Interview endpoints", () => {
    it("should return 501 for unimplemented interview endpoints", async () => {
      const { app } = buildApp();
      const res = await request(
        app,
        "POST",
        "/api/missions/interview/start",
        JSON.stringify({}),
        { "content-type": "application/json" }
      );
      expect(res.status).toBe(501);
    });
  });
});
