import { MODEL_CAPABILITIES, type ModelCapability } from "./models";
import { approvedModelProviders } from "./runtimeModels";
import { loadRuntimeConfig } from "../../config/runtime";
import type { Provider, UserApiKeys } from "./types";

const MODEL_ENDPOINTS: Partial<Record<Provider, string>> = {
  openai: "https://api.openai.com/v1/models",
  xai: "https://api.x.ai/v1/models",
  moonshot: "https://api.moonshot.ai/v1/models",
};

const MODEL_DISCOVERY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "gpt-5.6": ["gpt-5.6-sol"],
};

export type DiscoveredModel = ModelCapability & {
  available: boolean;
  availability: "live" | "configured" | "unavailable" | "fallback";
  availabilityReason?: string;
};

export type ModelDiscoveryResult = {
  models: DiscoveredModel[];
  approvedProviders: Provider[];
  selfHosted: boolean;
  refreshedAt: string;
  warning?: string;
};

async function discoverModelIds(
  provider: Provider,
  apiKey: string,
): Promise<Set<string>> {
  const url = MODEL_ENDPOINTS[provider];
  if (!url) return new Set();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`${provider} model discovery failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return new Set(
    (body.data ?? [])
      .map((entry) => (typeof entry.id === "string" ? entry.id.trim() : ""))
      .filter(Boolean),
  );
}

function isModelListed(modelId: string, ids: ReadonlySet<string>): boolean {
  if (ids.has(modelId)) return true;
  return (MODEL_DISCOVERY_ALIASES[modelId] ?? []).some((id) => ids.has(id));
}

/**
 * Key-scoped provider availability is combined with ROSS's compatibility
 * registry. Credentials are used only by the backend and are never returned.
 */
export async function discoverCompatibleModels(
  apiKeys: UserApiKeys,
): Promise<ModelDiscoveryResult> {
  const approvedProviders = approvedModelProviders();
  const discovered = new Map<Provider, Set<string> | null>();
  const warnings: string[] = [];

  for (const provider of ["openai", "xai", "moonshot"] as const) {
    const key = apiKeys[provider]?.trim();
    if (!key) continue;
    try {
      discovered.set(provider, await discoverModelIds(provider, key));
    } catch {
      discovered.set(provider, null);
      warnings.push(`${providerLabel(provider)} model availability could not be refreshed.`);
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

    const ids = discovered.get(capability.provider);
    if (ids === undefined || ids === null) {
      return {
        ...capability,
        available: true,
        availability: ids === null ? "fallback" : "configured",
      };
    }

    const available = isModelListed(capability.id, ids);
    return {
      ...capability,
      available,
      availability: available ? "live" : "unavailable",
      ...(available
        ? {}
        : {
            availabilityReason: `This ${providerLabel(capability.provider)} project does not currently list this model as available.`,
          }),
    };
  });

  return {
    models,
    approvedProviders,
    selfHosted: loadRuntimeConfig().hostedMode === "self-hosted",
    refreshedAt: new Date().toISOString(),
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
  };
}

function providerLabel(provider: Provider) {
  if (provider === "openai") return "OpenAI";
  if (provider === "claude") return "Anthropic";
  if (provider === "gemini") return "Google Gemini";
  if (provider === "xai") return "xAI";
  return "Moonshot AI";
}
