/**
 * Plugin REST API Routes
 *
 * Provides CRUD endpoints for plugin management and plugin-defined routes.
 *
 * Endpoints:
 * - GET /plugins - List all installed plugins
 * - GET /plugins/:id - Get single plugin
 * - POST /plugins/install - Install a plugin
 * - POST /plugins/:id/enable - Enable a plugin
 * - POST /plugins/:id/disable - Disable a plugin
 * - DELETE /plugins/:id - Uninstall a plugin
 * - GET /plugins/:id/settings - Get plugin settings
 * - PUT /plugins/:id/settings - Update plugin settings
 * - Plugin-defined routes mounted under /plugins/:pluginId/*
 */

import { Router, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  PluginInstallation,
  PluginLoader,
  PluginStore,
  PluginContext,
} from "@fusion/core";
import { validatePluginManifest } from "@fusion/core";
import {
  ApiError,
  badRequest,
  catchHandler,
  internalError,
  notFound,
} from "./api-error.js";

// PluginRunner interface for optional plugin runner
interface PluginRunner {
  reloadPlugin?(pluginId: string): Promise<void>;
  getPluginRoutes(): Array<{ pluginId: string; route: import("@fusion/core").PluginRouteDefinition }>;
}

/**
 * Create the plugin management router.
 *
 * @param pluginStore - Plugin store for persistence
 * @param pluginLoader - Plugin loader for lifecycle management
 * @param pluginRunner - Optional plugin runner for plugin-defined routes
 */
export function createPluginRouter(
  pluginStore: PluginStore,
  pluginLoader: PluginLoader,
  pluginRunner?: PluginRunner,
): Router {
  const router = Router();

  // ── Error Handler ───────────────────────────────────────────────

  router.use(catchHandler);

  // ── Helper Functions ────────────────────────────────────────────

  /**
   * Validate plugin installation source.
   * Must have either `path` (local directory) or `package` (npm package name).
   */
  function validateInstallSource(body: unknown): { path?: string; package?: string } {
    if (!body || typeof body !== "object") {
      throw badRequest("Request body is required");
    }

    const b = body as Record<string, unknown>;

    if (b.path !== undefined && typeof b.path === "string") {
      return { path: b.path };
    }

    if (b.package !== undefined && typeof b.package === "string") {
      return { package: b.package };
    }

    throw badRequest("Request body must have either 'path' or 'package' field");
  }

  /**
   * Load plugin manifest from a path or package.
   */
  async function loadPluginManifest(source: { path?: string; package?: string }): Promise<import("@fusion/core").PluginManifest> {
    if (source.path) {
      // Load from local path
      const manifestPath = join(source.path, "manifest.json");
      if (!existsSync(manifestPath)) {
        throw notFound(`Plugin manifest not found at: ${manifestPath}`);
      }

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      // Validate manifest
      const validation = validatePluginManifest(manifest);
      if (!validation.valid) {
        throw badRequest(`Invalid plugin manifest: ${validation.errors.join(", ")}`);
      }

      return manifest as import("@fusion/core").PluginManifest;
    }

    if (source.package) {
      // Load from npm package - this would require dynamic import
      // For now, throw an error indicating this is not yet supported
      throw badRequest("Installing plugins from npm packages is not yet implemented");
    }

    throw badRequest("Invalid source");
  }

  // ── Management Routes ───────────────────────────────────────────

  /**
   * GET /plugins
   * List all installed plugins.
   */
  router.get("/", catchHandler(async (_req: Request, res: Response) => {
    const plugins = await pluginStore.listPlugins();
    res.json(plugins);
  }));

  /**
   * GET /plugins/:id
   * Get a single plugin by ID.
   */
  router.get("/:id", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
      const plugin = await pluginStore.getPlugin(id);
      res.json(plugin);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFound(`Plugin "${id}" not found`);
      }
      throw internalError(err instanceof Error ? err.message : "Unknown error");
    }
  }));

  /**
   * POST /plugins/install
   * Install a plugin from a local path or npm package.
   */
  router.post("/install", catchHandler(async (req: Request, res: Response) => {
    const source = validateInstallSource(req.body);

    // Load manifest from source
    const manifest = await loadPluginManifest(source);

    // Determine the path to store
    const installPath = source.path ?? source.package ?? "";

    // Register the plugin
    try {
      const plugin = await pluginStore.registerPlugin({
        manifest,
        path: installPath,
      });

      // If the plugin is enabled, try to load it
      if (plugin.enabled) {
        try {
          await pluginLoader.loadPlugin(plugin.id);
        } catch (loadErr) {
          // Log but don't fail - the plugin is registered, just not loaded
          console.error(`[plugin-routes] Failed to load plugin ${plugin.id}:`, loadErr);
        }
      }

      res.status(201).json(plugin);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      if (err instanceof Error && err.message.includes("already registered")) {
        throw badRequest(err.message);
      }
      throw internalError(err instanceof Error ? err.message : "Failed to register plugin");
    }
  }));

  /**
   * POST /plugins/:id/enable
   * Enable a plugin and start it.
   */
  router.post("/:id/enable", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    // Enable in store
    let plugin = await pluginStore.enablePlugin(id);

    // Start the plugin
    try {
      await pluginLoader.loadPlugin(id);
    } catch (loadErr) {
      // Update state to error
      await pluginStore.updatePluginState(
        id,
        "error",
        loadErr instanceof Error ? loadErr.message : String(loadErr),
      );
      // Re-fetch to get updated state
      plugin = await pluginStore.getPlugin(id);
    }

    res.json(plugin);
  }));

  /**
   * POST /plugins/:id/disable
   * Disable a plugin and stop it.
   */
  router.post("/:id/disable", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    // Stop the plugin
    try {
      await pluginLoader.stopPlugin(id);
    } catch {
      // Ignore errors from stopping - plugin might not be loaded
    }

    // Disable in store
    const plugin = await pluginStore.disablePlugin(id);
    res.json(plugin);
  }));

  /**
   * POST /plugins/:id/reload
   * Reload a running plugin with updated code.
   */
  router.post("/:id/reload", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    // Validate plugin exists
    let plugin;
    try {
      plugin = await pluginStore.getPlugin(id);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFound(`Plugin "${id}" not found`);
      }
      throw internalError(err instanceof Error ? err.message : "Unknown error");
    }

    // Validate plugin is started (must be loaded to reload)
    if (plugin.state !== "started") {
      throw badRequest("Plugin is not currently loaded. Use enable instead.");
    }

    // Check if pluginRunner is available and has reloadPlugin method
    if (!pluginRunner || !pluginRunner.reloadPlugin) {
      throw internalError("Plugin runner not available");
    }

    // Reload the plugin
    try {
      await pluginRunner.reloadPlugin(id);
    } catch (reloadErr) {
      throw internalError(`Reload failed: ${reloadErr instanceof Error ? reloadErr.message : String(reloadErr)}`);
    }

    // Return updated plugin
    const updatedPlugin = await pluginStore.getPlugin(id);
    res.json(updatedPlugin);
  }));

  /**
   * DELETE /plugins/:id
   * Uninstall a plugin.
   */
  router.delete("/:id", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    // Stop the plugin (ignore errors)
    try {
      await pluginLoader.stopPlugin(id);
    } catch {
      // Ignore - plugin might not be loaded
    }

    // Unregister the plugin
    await pluginStore.unregisterPlugin(id);

    res.status(204).send();
  }));

  /**
   * GET /plugins/:id/settings
   * Get plugin settings.
   */
  router.get("/:id/settings", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
      const plugin = await pluginStore.getPlugin(id);
      res.json(plugin.settings);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFound(`Plugin "${id}" not found`);
      }
      throw internalError(err instanceof Error ? err.message : "Unknown error");
    }
  }));

  /**
   * PUT /plugins/:id/settings
   * Update plugin settings.
   */
  router.put("/:id/settings", catchHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!req.body || typeof req.body !== "object") {
      throw badRequest("Request body must be an object with 'settings' field");
    }

    const body = req.body as Record<string, unknown>;
    const settings = body.settings as Record<string, unknown> | undefined;

    if (!settings || typeof settings !== "object") {
      throw badRequest("Request body must have a 'settings' object");
    }

    try {
      const plugin = await pluginStore.updatePluginSettings(id, settings);
      res.json(plugin.settings);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFound(`Plugin "${id}" not found`);
      }
      if (err instanceof Error && err.message.includes("validation failed")) {
        throw badRequest(err.message);
      }
      throw internalError(err instanceof Error ? err.message : "Failed to update settings");
    }
  }));

  // ── Plugin-Defined Routes ──────────────────────────────────────

  // Mount plugin-defined routes
  if (pluginRunner) {
    const pluginRoutes = pluginRunner.getPluginRoutes();

    for (const { pluginId, route } of pluginRoutes) {
      const fullPath = `/${pluginId}${route.path.startsWith("/") ? route.path : `/${route.path}`}`;

      const handler = catchHandler(async (req: Request, res: Response) => {
        // Get the plugin context
        const plugin = pluginLoader.getPlugin(pluginId);
        if (!plugin) {
          throw notFound(`Plugin "${pluginId}" not loaded`);
        }

        // Create a minimal context for the handler
        const ctx: PluginContext = {
          pluginId,
          taskStore: {} as import("@fusion/core").TaskStore, // TaskStore is provided by the plugin loader
          settings: {},
          logger: {
            info: (...args: unknown[]) => console.log(`[plugin:${pluginId}]`, ...args),
            warn: (...args: unknown[]) => console.warn(`[plugin:${pluginId}]`, ...args),
            error: (...args: unknown[]) => console.error(`[plugin:${pluginId}]`, ...args),
            debug: (...args: unknown[]) => {
              if (process.env.DEBUG?.includes("plugins")) {
                console.log(`[plugin:${pluginId}]`, ...args);
              }
            },
          },
          emitEvent: () => {},
        };

        // Call the route handler with Express Request cast to unknown
        const result = await route.handler(req as unknown, ctx);
        res.json(result);
      });

      switch (route.method) {
        case "GET":
          router.get(fullPath, handler);
          break;
        case "POST":
          router.post(fullPath, handler);
          break;
        case "PUT":
          router.put(fullPath, handler);
          break;
        case "DELETE":
          router.delete(fullPath, handler);
          break;
      }
    }
  }

  return router;
}
