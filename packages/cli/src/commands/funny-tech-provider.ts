import { getModels } from "@mariozechner/pi-ai";
import type { ThinkingLevelMap } from "@mariozechner/pi-ai";

export const FUNNY_TECH_PROVIDER_ID = "funny-tech";
export const FUNNY_TECH_PROVIDER_NAME = "FunnyTech AI Proxy";
export const FUNNY_TECH_ENDPOINT = "https://aiproxy.funny-tech.site";
export const FUNNY_TECH_API_KEY_ENV = "FUNNYTECH_API_KEY";

export type OpenAiCompatibleModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
};

export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function getFunnyTechProviderConfig(): {
  name: string;
  baseUrl: string;
  api: "openai-completions";
  apiKey: string;
  models: OpenAiCompatibleModelConfig[];
} {
  return {
    name: FUNNY_TECH_PROVIDER_NAME,
    baseUrl: normalizeOpenAiCompatibleBaseUrl(FUNNY_TECH_ENDPOINT),
    api: "openai-completions",
    apiKey: FUNNY_TECH_API_KEY_ENV,
    models: getModels("openai").map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      thinkingLevelMap: model.thinkingLevelMap,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    })),
  };
}
