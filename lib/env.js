import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadDotEnv(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function getServerDefaults() {
  return {
    projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT ?? "",
    apiKey: process.env.FOUNDRY_API_KEY ?? "",
    deployment: process.env.FOUNDRY_MODEL_DEPLOYMENT ?? "",
    maxOutputTokens: Number(process.env.FOUNDRY_MAX_OUTPUT_TOKENS ?? 8000),
    reasoningEffort: process.env.FOUNDRY_REASONING_EFFORT ?? "medium",
    verbosity: process.env.FOUNDRY_VERBOSITY ?? "low"
  };
}
