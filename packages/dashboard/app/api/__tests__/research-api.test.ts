import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServer } from "../../../src/server.js";
import { request } from "../../../src/test-request.js";

const researchStore = {
  listRuns: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  updateRun: vi.fn(),
  deleteRun: vi.fn(),
  appendEvent: vi.fn(),
  addSource: vi.fn(),
  updateSource: vi.fn(),
  setResults: vi.fn(),
  updateStatus: vi.fn(),
  createExport: vi.fn(),
  getExports: vi.fn(),
  getExport: vi.fn(),
  getStats: vi.fn(),
  searchRuns: vi.fn(),
};

class MockStore extends EventEmitter {
  getRootDir() { return "/tmp/fn-2991"; }
  getFusionDir() { return "/tmp/fn-2991/.fusion"; }
  getDatabase() { return { exec: vi.fn(), prepare: vi.fn(() => ({ run: vi.fn().mockReturnValue({ changes: 0 }), all: vi.fn().mockReturnValue([]), get: vi.fn() })) }; }
  getResearchStore() { return researchStore; }
}

describe("research routes", () => {
  const app = createServer(new MockStore() as any);

  beforeEach(() => {
    vi.clearAllMocks();
    researchStore.listRuns.mockReturnValue([]);
    researchStore.getRun.mockReturnValue(undefined);
    researchStore.createRun.mockReturnValue({ id: "RR-1", query: "q", status: "pending", sources: [], events: [], tags: [], createdAt: "x", updatedAt: "x" });
    researchStore.updateRun.mockReturnValue({ id: "RR-1", query: "q", status: "running", sources: [], events: [], tags: [], createdAt: "x", updatedAt: "y" });
    researchStore.deleteRun.mockReturnValue(true);
    researchStore.appendEvent.mockReturnValue({ id: "E1", timestamp: "x", type: "info", message: "ok" });
    researchStore.addSource.mockReturnValue({ id: "S1", type: "web", reference: "https://e.com", status: "pending" });
    researchStore.getExports.mockReturnValue([]);
    researchStore.getStats.mockReturnValue({ total: 0, byStatus: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 } });
    researchStore.searchRuns.mockReturnValue([]);
  });

  it("supports run CRUD", async () => {
    const list = await request(app, "GET", "/api/research/runs");
    expect(list.status).toBe(200);

    const created = await request(app, "POST", "/api/research/runs", JSON.stringify({ query: "topic" }), { "Content-Type": "application/json" });
    expect(created.status).toBe(201);

    researchStore.getRun.mockReturnValue(researchStore.createRun.mock.results[0]?.value ?? { id: "RR-1" });
    const get = await request(app, "GET", "/api/research/runs/RR-1");
    expect(get.status).toBe(200);

    const patch = await request(app, "PATCH", "/api/research/runs/RR-1", JSON.stringify({ topic: "x" }), { "Content-Type": "application/json" });
    expect(patch.status).toBe(200);

    const del = await request(app, "DELETE", "/api/research/runs/RR-1");
    expect(del.status).toBe(204);
  });

  it("supports events, sources, results and exports", async () => {
    const evt = await request(app, "POST", "/api/research/runs/RR-1/events", JSON.stringify({ type: "info", message: "hello" }), { "Content-Type": "application/json" });
    expect(evt.status).toBe(201);

    const src = await request(app, "POST", "/api/research/runs/RR-1/sources", JSON.stringify({ type: "web", reference: "https://x.com", status: "pending" }), { "Content-Type": "application/json" });
    expect(src.status).toBe(201);

    const srcPatch = await request(app, "PATCH", "/api/research/runs/RR-1/sources/S1", JSON.stringify({ status: "completed" }), { "Content-Type": "application/json" });
    expect(srcPatch.status).toBe(204);

    const results = await request(app, "PUT", "/api/research/runs/RR-1/results", JSON.stringify({ findings: [] }), { "Content-Type": "application/json" });
    expect(results.status).toBe(204);

    researchStore.createExport.mockReturnValue({ id: "EX1", runId: "RR-1", format: "json", content: "{}", createdAt: "x" });
    const createEx = await request(app, "POST", "/api/research/runs/RR-1/exports", JSON.stringify({ format: "json", content: "{}" }), { "Content-Type": "application/json" });
    expect(createEx.status).toBe(201);

    researchStore.getExports.mockReturnValue([{ id: "EX1", runId: "RR-1", format: "json", content: "{}", createdAt: "x" }]);
    const listEx = await request(app, "GET", "/api/research/runs/RR-1/exports");
    expect(listEx.status).toBe(200);
    expect((listEx.body as { exports: unknown[] }).exports).toHaveLength(1);

    researchStore.getExport.mockReturnValue({ id: "EX1", runId: "RR-1", format: "json", content: "{}", createdAt: "x" });
    const getEx = await request(app, "GET", "/api/research/exports/EX1");
    expect(getEx.status).toBe(200);
  });

  it("supports stats, search and validation errors", async () => {
    const stats = await request(app, "GET", "/api/research/stats");
    expect(stats.status).toBe(200);

    const search = await request(app, "GET", "/api/research/search?q=test");
    expect(search.status).toBe(200);

    const invalidStatus = await request(app, "PATCH", "/api/research/runs/RR-1/status", JSON.stringify({ status: "bogus" }), { "Content-Type": "application/json" });
    expect(invalidStatus.status).toBe(400);

    const invalidEvent = await request(app, "POST", "/api/research/runs/RR-1/events", JSON.stringify({ type: "bad", message: "x" }), { "Content-Type": "application/json" });
    expect(invalidEvent.status).toBe(400);

    const invalidSourceType = await request(app, "POST", "/api/research/runs/RR-1/sources", JSON.stringify({ type: "bad", reference: "x", status: "pending" }), { "Content-Type": "application/json" });
    expect(invalidSourceType.status).toBe(400);

    const invalidSourceStatus = await request(app, "POST", "/api/research/runs/RR-1/sources", JSON.stringify({ type: "web", reference: "x", status: "bad" }), { "Content-Type": "application/json" });
    expect(invalidSourceStatus.status).toBe(400);

    researchStore.getExport.mockReturnValue(undefined);
    const missingExport = await request(app, "GET", "/api/research/exports/EX-404");
    expect(missingExport.status).toBe(404);

    researchStore.getRun.mockReturnValue(undefined);
    const missing = await request(app, "GET", "/api/research/runs/RR-404");
    expect(missing.status).toBe(404);
  });
});
