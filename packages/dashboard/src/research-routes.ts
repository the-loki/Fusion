import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import type { TaskStore } from "@fusion/core";
import {
  RESEARCH_EVENT_TYPES,
  RESEARCH_EXPORT_FORMATS,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_STATUSES,
  RESEARCH_SOURCE_TYPES,
  type ResearchRunCreateInput,
  type ResearchRunListOptions,
  type ResearchRunStatus,
} from "@fusion/core";
import { ApiError, badRequest, notFound } from "./api-error.js";

function rethrowAsApiError(error: unknown, fallback = "Internal server error"): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error) throw new ApiError(500, error.message);
  throw new ApiError(500, fallback);
}

function getProjectId(req: Request): string | undefined {
  if (typeof req.query.projectId === "string" && req.query.projectId.trim()) return req.query.projectId;
  if (req.body && typeof req.body === "object" && typeof req.body.projectId === "string" && req.body.projectId.trim()) return req.body.projectId;
  return undefined;
}

export function createResearchRouter(store: TaskStore): Router {
  const router = Router();
  const requestContext = new AsyncLocalStorage<TaskStore>();

  router.use((req: Request, _res: Response, next: NextFunction) => {
    const projectId = getProjectId(req);
    if (!projectId) {
      requestContext.run(store, () => next());
      return;
    }

    import("./project-store-resolver.js")
      .then(({ getOrCreateProjectStore }) => getOrCreateProjectStore(projectId))
      .then((scopedStore) => requestContext.run(scopedStore, () => next()))
      .catch((error) => rethrowAsApiError(error, "Failed to resolve project store"));
  });

  const getStore = () => {
    const scoped = requestContext.getStore();
    if (!scoped) throw new ApiError(500, "Store context not available");
    return scoped.getResearchStore();
  };

  router.get("/runs", (req, res) => {
    try {
      const options: ResearchRunListOptions = {};
      if (typeof req.query.status === "string") {
        if (!RESEARCH_RUN_STATUSES.includes(req.query.status as ResearchRunStatus)) {
          throw badRequest(`Invalid status: ${req.query.status}`);
        }
        options.status = req.query.status as ResearchRunStatus;
      }
      if (typeof req.query.search === "string") options.search = req.query.search;
      if (typeof req.query.tag === "string") options.tag = req.query.tag;
      if (typeof req.query.fromDate === "string") options.fromDate = req.query.fromDate;
      if (typeof req.query.toDate === "string") options.toDate = req.query.toDate;
      if (typeof req.query.limit === "string") options.limit = Number.parseInt(req.query.limit, 10);
      if (typeof req.query.offset === "string") options.offset = Number.parseInt(req.query.offset, 10);

      const runs = getStore().listRuns(options);
      res.json({ runs, count: runs.length });
    } catch (error) {
      rethrowAsApiError(error, "Failed to list research runs");
    }
  });

  router.post("/runs", (req, res) => {
    try {
      if (typeof req.body?.query !== "string" || !req.body.query.trim()) {
        throw badRequest("query is required");
      }
      const input = req.body as ResearchRunCreateInput;
      const run = getStore().createRun(input);
      res.status(201).json(run);
    } catch (error) {
      rethrowAsApiError(error, "Failed to create research run");
    }
  });

  router.get("/runs/:id", (req, res) => {
    try {
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json(run);
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research run");
    }
  });

  router.patch("/runs/:id", (req, res) => {
    try {
      const updated = getStore().updateRun(req.params.id, req.body ?? {});
      if (!updated) throw notFound(`Run not found: ${req.params.id}`);
      res.json(updated);
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research run");
    }
  });

  router.delete("/runs/:id", (req, res) => {
    try {
      const deleted = getStore().deleteRun(req.params.id);
      if (!deleted) throw notFound(`Run not found: ${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to delete research run");
    }
  });

  router.post("/runs/:id/events", (req, res) => {
    try {
      const { type, message, metadata } = req.body ?? {};
      if (!RESEARCH_EVENT_TYPES.includes(type)) throw badRequest(`Invalid event type: ${String(type)}`);
      if (typeof message !== "string" || !message.trim()) throw badRequest("message is required");
      const event = getStore().appendEvent(req.params.id, { type, message, metadata });
      res.status(201).json(event);
    } catch (error) {
      rethrowAsApiError(error, "Failed to append research event");
    }
  });

  router.post("/runs/:id/sources", (req, res) => {
    try {
      const { type, status } = req.body ?? {};
      if (!RESEARCH_SOURCE_TYPES.includes(type)) throw badRequest(`Invalid source type: ${String(type)}`);
      if (!RESEARCH_SOURCE_STATUSES.includes(status)) throw badRequest(`Invalid source status: ${String(status)}`);
      const source = getStore().addSource(req.params.id, req.body);
      res.status(201).json(source);
    } catch (error) {
      rethrowAsApiError(error, "Failed to add research source");
    }
  });

  router.patch("/runs/:id/sources/:sourceId", (req, res) => {
    try {
      getStore().updateSource(req.params.id, req.params.sourceId, req.body ?? {});
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research source");
    }
  });

  router.put("/runs/:id/results", (req, res) => {
    try {
      getStore().setResults(req.params.id, req.body);
      res.status(204).send();
    } catch (error) {
      rethrowAsApiError(error, "Failed to set research results");
    }
  });

  router.patch("/runs/:id/status", (req, res) => {
    try {
      const status = req.body?.status as ResearchRunStatus | undefined;
      if (!status || !RESEARCH_RUN_STATUSES.includes(status)) throw badRequest(`Invalid status: ${String(status)}`);
      getStore().updateStatus(req.params.id, status, req.body?.extra);
      const run = getStore().getRun(req.params.id);
      if (!run) throw notFound(`Run not found: ${req.params.id}`);
      res.json(run);
    } catch (error) {
      rethrowAsApiError(error, "Failed to update research status");
    }
  });

  router.post("/runs/:id/exports", (req, res) => {
    try {
      const format = req.body?.format;
      const content = req.body?.content;
      if (!RESEARCH_EXPORT_FORMATS.includes(format)) throw badRequest(`Invalid export format: ${String(format)}`);
      if (typeof content !== "string") throw badRequest("content is required");
      const exportRow = getStore().createExport(req.params.id, format, content);
      res.status(201).json(exportRow);
    } catch (error) {
      rethrowAsApiError(error, "Failed to create research export");
    }
  });

  router.get("/runs/:id/exports", (req, res) => {
    try {
      res.json({ exports: getStore().getExports(req.params.id) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to list research exports");
    }
  });

  router.get("/exports/:exportId", (req, res) => {
    try {
      const exportRow = getStore().getExport(req.params.exportId);
      if (!exportRow) throw notFound(`Export not found: ${req.params.exportId}`);
      res.json(exportRow);
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research export");
    }
  });

  router.get("/stats", (_req, res) => {
    try {
      res.json(getStore().getStats());
    } catch (error) {
      rethrowAsApiError(error, "Failed to get research stats");
    }
  });

  router.get("/search", (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) throw badRequest("q is required");
      res.json({ runs: getStore().searchRuns(q) });
    } catch (error) {
      rethrowAsApiError(error, "Failed to search research runs");
    }
  });

  return router;
}
