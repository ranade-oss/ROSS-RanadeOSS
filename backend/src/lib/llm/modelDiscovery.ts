import {
  MODEL_CAPABILITIES,
  modelCapability,
  modelLabel,
  type ModelCapability,
} from "./models";
import { approvedModelProviders } from "./runtimeModels";
import { loadRuntimeConfig } from "../../config/runtime";
import type { Provider, UserApiKeys } from "./types";

const MODEL_DISCOVERY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "gpt-5.6": ["gpt-5.6-sol"],
};

type ProviderModel = {
  id: string;
  label?: string;
  supportedGenerationMethods?: string[];
};

type DiscoveryAdapter = {
  list: (apiKey: string) => Promise<ProviderModel[]>;
  compatible: (model: ProviderModel) => boolean;
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

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`model discovery failed (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function openAIStyleAdapter(
  baseUrl: string,
  compatible: DiscoveryAdapter["compatible"],
): DiscoveryAdapter {
  return {
    compatible,
    async list(apiKey) {
      const body = await fetchJson(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = Array.isArray(body.data) ? body.data : [];
      return data.flatMap((value): ProviderModel[] => {
        if (!value || typeof value !== "object") return [];
        const id = (value as { id?: unknown }).id;
        return typeof id === "string" && id.trim() ? [{ id: id.trim() }] : [];
      });
    },
  };
}

const anthropicAdapter: DiscoveryAdapter = {
  compatible: (model) => /^claude-/.test(model.id),
  async list(apiKey) {
    const models: ProviderModel[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 20; page++) {
      const url = new URL("https://api.anthropic.com/v1/models");
      url.searchParams.set("limit", "1000");
      if (afterId) url.searchParams.set("after_id", afterId);
      const body = await fetchJson(url.toString(), {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      const data = Array.isArray(body.data) ? body.data : [];
      for (const value of data) {
        if (!value || typeof value !== "object") continue;
        const entry = value as {
          id?: unknown;
          display_name?: unknown;
        };
        if (typeof entry.id !== "string" || !entry.id.trim()) continue;
        models.push({
          id: entry.id.trim(),
          ...(typeof entry.display_name === "string" &&
          entry.display_name.trim()
            ? { label: entry.display_name.trim() }
            : {}),
        });
      }
      if (body.has_more !== true || typeof body.last_id !== "string") break;
      afterId = body.last_id;
    }
    return models;
  },
};

const geminiAdapter: DiscoveryAdapter = {
  compatible: (model) =>
    /^gemini-/.test(model.id) &&
    !/(?:image|tts|embedding|aqa)/i.test(model.id) &&
    (model.supportedGenerationMethods ?? []).some(
      (method) => method.toLowerCase() === "generatecontent",
    ),
  async list(apiKey) {
    const models: ProviderModel[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models",
      );
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = await fetchJson(url.toString(), {
        headers: { "x-goog-api-key": apiKey },
      });
      const data = Array.isArray(body.models) ? body.models : [];
      for (const value of data) {
        if (!value || typeof value !== "object") continue;
        const entry = value as {
          name?: unknown;
          baseModelId?: unknown;
          displayName?: unknown;
          supportedGenerationMethods?: unknown;
        };
        const resourceId =
          typeof entry.name === "string"
            ? entry.name.replace(/^models\//, "").trim()
            : "";
        const id =
          typeof entry.baseModelId === "string" && entry.baseModelId.trim()
            ? entry.baseModelId.trim()
            : resourceId;
        if (!id) continue;
        models.push({
          id,
          ...(typeof entry.displayName === "string" && entry.displayName.trim()
            ? { label: entry.displayName.trim() }
            : {}),
          supportedGenerationMethods: Array.isArray(
            entry.supportedGenerationMethods,
          )
            ? entry.supportedGenerationMethods.filter(
                (method): method is string => typeof method === "string",
              )
            : [],
        });
      }
      if (typeof body.nextPageToken !== "string" || !body.nextPageToken) break;
      pageToken = body.nextPageToken;
    }
    return models;
  },
};

const textModel =
  (prefix: RegExp, excluded: RegExp) => (model: ProviderModel) =>
    prefix.test(model.id) && !excluded.test(model.id);

/**
 * Exhaustive by design: adding a Provider makes TypeScript require a model
 * discovery adapter before that provider can be built into ROSS.
 */
const MODEL_DISCOVERY_ADAPTERS = {
  openai: openAIStyleAdapter(
    "https://api.openai.com/v1",
    textModel(
      /^(?:gpt-|o\d|ft:(?:gpt-|o\d))/,
      /(?:embedding|moderation|transcribe|tts|audio|realtime|image|search)/i,
    ),
  ),
  claude: anthropicAdapter,
  gemini: geminiAdapter,
  xai: openAIStyleAdapter(
    "https://api.x.ai/v1",
    textModel(/^grok-/, /(?:image|video|vision|embedding)/i),
  ),
  moonshot: openAIStyleAdapter(
    "https://api.moonshot.ai/v1",
    textModel(/^kimi-/, /(?:embedding|image|video)/i),
  ),
} satisfies Record<Provider, DiscoveryAdapter>;

function isModelListed(modelId: string, ids: ReadonlySet<string>): boolean {
  if (ids.has(modelId)) return true;
  return (MODEL_DISCOVERY_ALIASES[modelId] ?? []).some((id) => ids.has(id));
}

function curatedModels(provider: Provider) {
  return MODEL_CAPABILITIES.filter(
    (capability) =>
      capability.tier === "main" && capability.provider === provider,
  );
}

function liveModel(model: ProviderModel, provider: Provider): DiscoveredModel {
  const capability = modelCapability(model.id) ?? {
    id: model.id,
    label: modelLabel(model.id),
    provider,
    tier: "main" as const,
    reasoningEfforts: [],
  };
  return {
    ...capability,
    label: model.label || capability.label,
    available: true,
    availability: "live",
  };
}

function missingKeyModel(capability: ModelCapability): DiscoveredModel {
  return {
    ...capability,
    available: false,
    availability: "unavailable",
    availabilityReason: `Add an API key for ${providerLabel(capability.provider)} to use this model.`,
  };
}

function unlistedModel(capability: ModelCapability): DiscoveredModel {
  return {
    ...capability,
    available: false,
    availability: "unavailable",
    availabilityReason: `This ${providerLabel(capability.provider)} key does not list a chat-compatible model ROSS can use.`,
  };
}

/**
 * Return every chat-compatible model exposed to the user's configured key.
 * Credentials remain backend-only. A curated list is used only when no key is
 * configured or a provider's discovery endpoint is temporarily unavailable.
 */
export async function discoverCompatibleModels(
  apiKeys: UserApiKeys,
): Promise<ModelDiscoveryResult> {
  const approvedProviders = approvedModelProviders();
  const providerResults = await Promise.all(
    approvedProviders.map(async (provider) => {
      const key = apiKeys[provider]?.trim();
      const curated = curatedModels(provider);
      if (!key) {
        return { models: curated.map(missingKeyModel) };
      }

      try {
        const adapter = MODEL_DISCOVERY_ADAPTERS[provider];
        const listed = await adapter.list(key);
        const compatible = listed.filter(adapter.compatible);
        if (!compatible.length) {
          return { models: curated.map(unlistedModel) };
        }
        const ids = new Set(compatible.map((model) => model.id));
        const seen = new Set<string>();
        const models: DiscoveredModel[] = [];

        for (const model of compatible) {
          if (seen.has(model.id)) continue;
          seen.add(model.id);
          models.push(liveModel(model, provider));
        }

        // Preserve provider aliases that ROSS supports even when the Models
        // API returns only their concrete target, such as gpt-5.6-sol.
        for (const capability of curated) {
          if (!seen.has(capability.id) && isModelListed(capability.id, ids)) {
            seen.add(capability.id);
            models.push({
              ...capability,
              available: true,
              availability: "live",
            });
          }
        }
        return { models };
      } catch {
        return {
          models: curated.map(
            (capability): DiscoveredModel => ({
              ...capability,
              available: true,
              availability: "fallback",
            }),
          ),
          warning: `${providerLabel(provider)} model availability could not be refreshed.`,
        };
      }
    }),
  );
  const models = providerResults.flatMap((result) => result.models);
  const warnings = providerResults.flatMap((result) =>
    result.warning ? [result.warning] : [],
  );

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
