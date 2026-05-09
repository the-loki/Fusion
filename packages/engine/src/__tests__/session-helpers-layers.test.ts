import { describe, it, expect } from "vitest";
import type { ResolvedSessionOptions } from "../agent-session-helpers.js";
import type { SystemPromptLayers } from "../prompt-layers.js";

describe("ResolvedSessionOptions layer forwarding", () => {
  it("includes systemPromptLayers in the type", () => {
    const layers: SystemPromptLayers = {
      stable: "Stable prefix.",
      dynamic: "Dynamic suffix.",
    };

    const options: Partial<ResolvedSessionOptions> = {
      systemPrompt: "Stable prefix.\n\nDynamic suffix.",
      systemPromptLayers: layers,
    };

    expect(options.systemPromptLayers).toBeDefined();
    expect(options.systemPromptLayers!.stable).toBe("Stable prefix.");
  });
});
