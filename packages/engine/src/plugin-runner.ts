/**
 * PluginRunner - Bridge between PluginLoader and Fusion Engine
 *
 * Orchestrates plugin loading into the engine, invokes hooks at lifecycle points,
 * and provides plugin tools to agent sessions.
 */

import type { TaskStore, Task } from "@fusion/core";
import type {
  PluginLoader,
  PluginStore,
} from "@fusion/core";
import type {
  FusionPlugin,
  PluginToolDefinition,
  PluginRouteDefinition,
  PluginContext,
} from "@fusion/core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { createLogger, executorLog } from "./logger.js";

// Type for the task store's event data
interface TaskMovedEvent {
  task: Task;
  from: string;
  to: string;
}

export interface PluginRunnerOptions {
  pluginLoader: PluginLoader;
  pluginStore: PluginStore;
  taskStore: TaskStore;
  rootDir: string;
  hookTimeoutMs?: number;
}

/**
 * Cached converted tools - rebuilt when plugin state changes
 */
interface CachedTools {
  tools: ToolDefinition[];
  version: number;
}

const DEFAULT_HOOK_TIMEOUT_MS = 5000;

export class PluginRunner {
  private readonly log = createLogger("plugin-runner");
  private cachedTools: CachedTools | null = null;
  private toolsCacheVersion = 0;
  private hookTimeoutMs: number;

  constructor(private options: PluginRunnerOptions) {
    this.hookTimeoutMs = options.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  }

  /**
   * Initialize the plugin runner.
   * Loads all plugins and subscribes to store events.
   */
  async init(): Promise<void> {
    executorLog.log("Initializing PluginRunner...");

    // Load all enabled plugins
    const result = await this.options.pluginLoader.loadAllPlugins();
    executorLog.log(`PluginRunner loaded ${result.loaded} plugins (${result.errors} errors)`);

    // Subscribe to store events for task lifecycle hooks
    this.subscribeToStoreEvents();

    // Subscribe to plugin state changes to invalidate tools cache
    this.options.pluginStore.on("plugin:stateChanged", this.handlePluginStateChanged);
    this.options.pluginStore.on("plugin:updated", this.handlePluginUpdated);

    // Build initial tools cache
    this.invalidateToolsCache();
  }

  /**
   * Shutdown the plugin runner.
   * Stops all plugins and unsubscribes from events.
   */
  async shutdown(): Promise<void> {
    executorLog.log("Shutting down PluginRunner...");

    // Unsubscribe from store events
    this.unsubscribeFromStoreEvents();

    // Unsubscribe from plugin store events
    this.options.pluginStore.off("plugin:stateChanged", this.handlePluginStateChanged);
    this.options.pluginStore.off("plugin:updated", this.handlePluginUpdated);

    // Stop all plugins
    await this.options.pluginLoader.stopAllPlugins();

    executorLog.log("PluginRunner shutdown complete");
  }

  /**
   * Invoke a named hook on all loaded plugins.
   * Errors are isolated - one plugin's failure doesn't affect others.
   * Each hook call has a timeout (default 5 seconds).
   */
  async invokeHook(hookName: keyof FusionPlugin["hooks"], ...args: unknown[]): Promise<void> {
    await this.options.pluginLoader.invokeHook(hookName, ...args);
  }

  /**
   * Get all plugin tools converted to the engine's ToolDefinition format.
   * Tools are cached and only rebuilt when plugin state changes.
   */
  getPluginTools(): ToolDefinition[] {
    if (!this.cachedTools || this.cachedTools.version !== this.toolsCacheVersion) {
      const pluginTools = this.options.pluginLoader.getPluginTools();
      this.cachedTools = {
        tools: this.convertPluginTools(pluginTools),
        version: this.toolsCacheVersion,
      };
    }
    return this.cachedTools.tools;
  }

  /**
   * Get all plugin routes with their plugin IDs.
   */
  getPluginRoutes(): Array<{ pluginId: string; route: PluginRouteDefinition }> {
    return this.options.pluginLoader.getPluginRoutes();
  }

  /**
   * Get the underlying plugin loader.
   */
  getLoader(): PluginLoader {
    return this.options.pluginLoader;
  }

  /**
   * Get the underlying plugin store.
   */
  getStore(): PluginStore {
    return this.options.pluginStore;
  }

  // ── Tool Conversion ───────────────────────────────────────────────

  /**
   * Convert PluginToolDefinition[] to ToolDefinition[] for the pi-coding-agent.
   *
   * Plugin tools have this signature:
   *   execute(params: Record<string, unknown>, ctx: PluginContext): Promise<PluginToolResult>
   *
   * Engine ToolDefinition has this signature:
   *   execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult>
   *
   * The conversion:
   * 1. Prefixes the tool name with "plugin_"
   * 2. Maps name/description directly (use name as label)
   * 3. Wraps execute to extract params and call plugin's execute
   * 4. Returns { content: result.content } format
   */
  private convertPluginTools(pluginTools: PluginToolDefinition[]): ToolDefinition[] {
    return pluginTools.map((pluginTool) => {
      // Get the plugin context for this tool
      const pluginId = this.getPluginIdForTool(pluginTool);
      const plugin = pluginId ? this.options.pluginLoader.getPlugin(pluginId) : undefined;

      // Store the timeout for use in the closure
      const timeout = this.hookTimeoutMs;

      // Create wrapper that extracts params and uses stored context
      const wrappedExecute = async (
        _toolCallId: string,
        params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown | undefined,
        _ctx: unknown,
      ) => {
        if (!plugin) {
          return {
            content: [{ type: "text" as const, text: "Plugin not available" }],
            details: {},
          };
        }

        // Create context for this specific tool call
        const context = await this.createToolContext(plugin);

        try {
          const result = await this.withTimeout(
            pluginTool.execute(params as Record<string, unknown>, context),
            timeout,
            `Tool ${pluginTool.name} execution timed out`,
          );

          // Convert PluginToolResult to AgentToolResult
          return {
            content: result.content,
            isError: result.isError ?? false,
            details: result.details ?? {},
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
            details: {},
          };
        }
      };

      // Use Type.Any for plugin tool parameters since plugins use JSON Schema
      // which is compatible with TypeBox's Any type
      const anySchema = Type.Any();

      return {
        name: `plugin_${pluginTool.name}`,
        label: pluginTool.name,
        description: pluginTool.description,
        parameters: anySchema,
        execute: wrappedExecute,
      };
    });
  }

  /**
   * Get the plugin ID that owns a tool.
   * We infer it from the loader's perspective - tools are stored per plugin.
   */
  private getPluginIdForTool(tool: PluginToolDefinition): string | undefined {
    const loadedPlugins = this.options.pluginLoader.getLoadedPlugins();
    for (const plugin of loadedPlugins) {
      if (plugin.tools?.some((t) => t.name === tool.name)) {
        return plugin.manifest.id;
      }
    }
    return undefined;
  }

  /**
   * Create a plugin context for tool execution.
   */
  private async createToolContext(plugin: FusionPlugin): Promise<PluginContext> {
    const settings = await this.getPluginSettings(plugin.manifest.id);
    return {
      pluginId: plugin.manifest.id,
      taskStore: this.options.taskStore,
      settings,
      logger: this.createPluginLogger(plugin.manifest.id),
      emitEvent: (event: string, data: unknown) => {
        this.log.log(`[plugin:${plugin.manifest.id}] Event: ${event}`, data);
      },
    };
  }

  /**
   * Get settings for a plugin from the store.
   */
  private async getPluginSettings(pluginId: string): Promise<Record<string, unknown>> {
    try {
      const plugin = await this.options.pluginStore.getPlugin(pluginId);
      return plugin.settings;
    } catch {
      return {};
    }
  }

  /**
   * Create a logger for a plugin.
   */
  private createPluginLogger(pluginId: string): import("@fusion/core").PluginLogger {
    const prefix = `[plugin:${pluginId}]`;
    return {
      info: (...args: unknown[]) => this.log.log(prefix, ...args),
      warn: (...args: unknown[]) => this.log.warn(prefix, ...args),
      error: (...args: unknown[]) => this.log.error(prefix, ...args),
      debug: (...args: unknown[]) => {
        if (process.env.DEBUG?.includes("plugins")) {
          this.log.log(prefix, ...args);
        }
      },
    };
  }

  // ── Cache Invalidation ───────────────────────────────────────────

  /**
   * Invalidate the tools cache, forcing rebuild on next access.
   */
  private invalidateToolsCache(): void {
    this.toolsCacheVersion++;
    this.log.log(`Tools cache invalidated (version: ${this.toolsCacheVersion})`);
  }

  // ── Store Event Subscriptions ────────────────────────────────────

  /**
   * Subscribe to TaskStore events for task lifecycle hooks.
   */
  private subscribeToStoreEvents(): void {
    this.options.taskStore.on("task:created", this.handleTaskCreated);
    this.options.taskStore.on("task:moved", this.handleTaskMoved);
  }

  /**
   * Unsubscribe from TaskStore events.
   */
  private unsubscribeFromStoreEvents(): void {
    this.options.taskStore.off("task:created", this.handleTaskCreated);
    this.options.taskStore.off("task:moved", this.handleTaskMoved);
  }

  /**
   * Handle task created event - invoke onTaskCreated hook.
   */
  private handleTaskCreated = (task: Task): void => {
    // Fire and forget - don't await
    void this.invokeHookSafe("onTaskCreated", task);
  };

  /**
   * Handle task moved event - invoke onTaskMoved and onTaskCompleted hooks.
   */
  private handleTaskMoved = (event: TaskMovedEvent): void => {
    const { task, from, to } = event;

    // Fire and forget - don't await
    void this.invokeHookSafe("onTaskMoved", task, from, to);

    // If task completed, invoke onTaskCompleted hook
    if (to === "done") {
      void this.invokeHookSafe("onTaskCompleted", task);
    }
  };

  /**
   * Invoke a hook with error isolation and logging.
   */
  private async invokeHookSafe(hookName: keyof FusionPlugin["hooks"], ...args: unknown[]): Promise<void> {
    try {
      await this.withTimeout(
        this.invokeHook(hookName, ...args),
        this.hookTimeoutMs,
        `Hook ${hookName} timed out`,
      );
    } catch (err) {
      // Error already logged by invokeHook
    }
  }

  // ── Event Handlers for Cache ────────────────────────────────────

  /**
   * Handler for plugin state changes.
   */
  private handlePluginStateChanged = (): void => {
    this.invalidateToolsCache();
  };

  /**
   * Handler for plugin updates.
   */
  private handlePluginUpdated = (): void => {
    this.invalidateToolsCache();
  };

  // ── Utilities ────────────────────────────────────────────────────

  /**
   * Execute a promise with a timeout.
   * Returns the result on success, throws on timeout.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
