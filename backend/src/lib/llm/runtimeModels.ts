import { loadRuntimeConfig } from "../../config/runtime";
import {
  CLAUDE_LOW_MODELS,
  CLAUDE_MAIN_MODELS,
  CLAUDE_MID_MODELS,
  DEFAULT_MAIN_MODEL,
  DEFAULT_TABULAR_MODEL,
  DEFAULT_TITLE_MODEL,
  OPENAI_LOW_MODELS,
  OPENAI_MAIN_MODELS,
  OPENAI_MID_MODELS,
  providerForModel,
  resolveModel,
} from "./models";
import type { Provider } from "./types";

export type ModelTier = "main" | "mid" | "low";

const SELF_HOSTED_PROVIDER_ORDER: Provider[] = ["gemini", "openai", "claude"];

const DEFAULTS_BY_TIER: Record<ModelTier, Record<Provider, string>> = {
  main: {
    gemini: DEFAULT_MAIN_MODEL,
    openai: OPENAI_MAIN_MODELS[0],
    claude: CLAUDE_MAIN_MODELS[0],
  },
  mid: {
    gemini: DEFAULT_TABULAR_MODEL,
    openai: OPENAI_MID_MODELS[0],
    claude: CLAUDE_MID_MODELS[0],
  },
  low: {
    gemini: DEFAULT_TITLE_MODEL,
    openai: OPENAI_LOW_MODELS[0],
    claude: CLAUDE_LOW_MODELS[0],
  },
};

export function approvedModelProviders(): Provider[] {
  const runtime = loadRuntimeConfig();
  return runtime.hostedMode === "self-hosted"
    ? [...SELF_HOSTED_PROVIDER_ORDER]
    : [...runtime.hostedModelProviders];
}

export function isModelApprovedForRuntime(model: string): boolean {
  const resolved = resolveModel(model, "");
  return (
    resolved.length > 0 &&
    approvedModelProviders().includes(providerForModel(resolved))
  );
}

export function defaultModelForRuntime(tier: ModelTier): string {
  const provider = approvedModelProviders()[0];
  if (!provider) {
    throw new Error("No model provider is approved for this runtime.");
  }
  return DEFAULTS_BY_TIER[tier][provider];
}

export function resolveRuntimeModel(
  model: string | null | undefined,
  tier: ModelTier,
): string {
  const resolved = resolveModel(model, "");
  return resolved && isModelApprovedForRuntime(resolved)
    ? resolved
    : defaultModelForRuntime(tier);
}
