import { MODEL_CAPABILITIES, type ModelCapability } from "./models";
import type { UserApiKeys } from "./types";

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

export type DiscoveredModel = ModelCapability & {
  available: boolean;
  availability: "live" | "configured" | "unavailable" | "fallback";
};

export type ModelDiscoveryResult = {
  models: DiscoveredModel[];
  refreshedAt: string;
  warning?: string;
};

async function discoverOpenAIIds(apiKey: string): Promise<Set<string>> {
  const response = await fetch(OPENAI_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI model discovery failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return new Set(
    (body.data ?? [])
      .map((entry) => (typeof entry.id === "string" ? entry.id.trim() : ""))
      .filter(Boolean),
  );
}

/**
 * Key-scoped provider availability is combined with ROSS's compatibility
 * registry. Credentials are used only by the backend and are never returned.
 */
export async function discoverCompatibleModels(
  apiKeys: UserApiKeys,
): Promise<ModelDiscoveryResult> {
  let openAIIds: Set<string> | null = null;
  let warning: string | undefined;

  if (apiKeys.openai?.trim()) {
    try {
      openAIIds = await discoverOpenAIIds(apiKeys.openai.trim());
    } catch {
      warning =
        "OpenAI model availability could not be refreshed. Showing the safe curated fallback.";
    }
  }

  const models = MODEL_CAPABILITIES.filter(
    (capability) => capability.tier === "main",
  ).map((capability): DiscoveredModel => {
    const configured = Boolean(apiKeys[capability.provider]?.trim());
    if (!configured) {
      return {
        ...capability,
        available: false,
        availability: "unavailable",
      };
    }
    if (capability.provider !== "openai") {
      return {
        ...capability,
        available: true,
        availability: "configured",
      };
    }
    if (!openAIIds) {
      return {
        ...capability,
        available: true,
        availability: "fallback",
      };
    }
    return {
      ...capability,
      available: openAIIds.has(capability.id),
      availability: openAIIds.has(capability.id) ? "live" : "unavailable",
    };
  });

  return {
    models,
    refreshedAt: new Date().toISOString(),
    ...(warning ? { warning } : {}),
  };
}
