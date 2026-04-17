import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function getFusionAgentDir(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  return join(home, ".fusion", "agent");
}

export function getLegacyAgentDir(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  return join(home, ".pi", "agent");
}

export function getFusionAuthPath(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  return join(getFusionAgentDir(home), "auth.json");
}

export function getLegacyAuthPaths(home = process.env.HOME || process.env.USERPROFILE || homedir()): string[] {
  return [
    join(home, ".pi", "agent", "auth.json"),
    join(home, ".pi", "auth.json"),
  ];
}

export function getFusionModelsPath(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  return join(getFusionAgentDir(home), "models.json");
}

export function getLegacyModelsPaths(home = process.env.HOME || process.env.USERPROFILE || homedir()): string[] {
  return [
    join(home, ".pi", "agent", "models.json"),
    join(home, ".pi", "models.json"),
  ];
}

export function getModelRegistryModelsPath(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  const fusionModelsPath = getFusionModelsPath(home);
  if (existsSync(fusionModelsPath)) {
    return fusionModelsPath;
  }

  return getLegacyModelsPaths(home).find((modelsPath) => existsSync(modelsPath)) ?? fusionModelsPath;
}

export function getPackageManagerAgentDir(home = process.env.HOME || process.env.USERPROFILE || homedir()): string {
  const fusionAgentDir = getFusionAgentDir(home);
  if (
    existsSync(join(fusionAgentDir, "settings.json")) ||
    existsSync(join(fusionAgentDir, "extensions"))
  ) {
    return fusionAgentDir;
  }

  const legacyAgentDir = getLegacyAgentDir(home);
  return existsSync(legacyAgentDir) ? legacyAgentDir : fusionAgentDir;
}
