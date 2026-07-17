import { MODEL_CAPABILITIES, type ModelCapability } from "./models";
import { approvedModelProviders } from "./runtimeModels";
import { loadRuntimeConfig } from "../../config/runtime";
import type { UserApiKeys } from "./types";

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

export type DiscoveredModel = ModelCapability & {
  available: boolean;
  availability: "live" | "configured" | "unavailable" | "fallback";
  availabilityReason?: string;
};

export type ModelDiscoveryResult = {
  models: DiscoveredModel[];
  approvedProviders: Array<"claude" | "gemini" | "openai">;
  selfHosted: boolean;
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
  const approvedProviders = approvedModelProviders();
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
    (capability) =>
      capability.tier === "main" &&
      approvedProviders.includes(capability.provider),
  ).map((capability): DiscoveredModel => {
    const configured = Boolean(apiKeys[capability.provider]?.trim());
    if (!configured) {
      return {
        ...capability,
        available: false,
        availability: "unavailable",
        availabilityReason: `Add an API key for ${providerLabel(capability.provider)} to use this model.`,
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
      ...(openAIIds.has(capability.id)
        ? {}
        : {
            availabilityReason:
              "This OpenAI project does not currently list this model as available.",
          }),
    };
  });

  return {
    models,
    approvedProviders,
    selfHosted: loadRuntimeConfig().hostedMode === "self-hosted",
    refreshedAt: new Date().toISOString(),
    ...(warning ? { warning } : {}),
  };
}

function providerLabel(provider: ModelCapability["provider"]) {
  if (provider === "openai") return "OpenAI";
  if (provider === "claude") return "Anthropic";
  return "Google Gemini";
}
