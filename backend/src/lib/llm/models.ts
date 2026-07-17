import type { Provider, ReasoningEffort } from "./types";

// ---------------------------------------------------------------------------
// Canonical model IDs
// ---------------------------------------------------------------------------
// Main-chat tier (top-end) — user picks one of these per message.
export const CLAUDE_MAIN_MODELS = [
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
] as const;
export const GEMINI_MAIN_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
] as const;
export const OPENAI_MAIN_MODELS = ["gpt-5.6", "gpt-5.5", "gpt-5.4"] as const;

// Mid-tier (used for tabular review) — user picks one in account settings.
export const CLAUDE_MID_MODELS = ["claude-sonnet-4-6"] as const;
export const GEMINI_MID_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
] as const;
export const OPENAI_MID_MODELS = ["gpt-5.4"] as const;

// Low-tier (used for title generation, lightweight extractions) — user picks
// one in account settings.
export const CLAUDE_LOW_MODELS = ["claude-haiku-4-5"] as const;
export const GEMINI_LOW_MODELS = ["gemini-3.1-flash-lite-preview"] as const;
export const OPENAI_LOW_MODELS = ["gpt-5.4-lite"] as const;

export const DEFAULT_MAIN_MODEL = "gemini-3-flash-preview";
export const DEFAULT_TITLE_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TABULAR_MODEL = "gemini-3-flash-preview";

const ALL_MODELS = new Set<string>([
  ...CLAUDE_MAIN_MODELS,
  ...GEMINI_MAIN_MODELS,
  ...OPENAI_MAIN_MODELS,
  ...CLAUDE_MID_MODELS,
  ...GEMINI_MID_MODELS,
  ...OPENAI_MID_MODELS,
  ...CLAUDE_LOW_MODELS,
  ...GEMINI_LOW_MODELS,
  ...OPENAI_LOW_MODELS,
]);

export type ModelCapability = {
  id: string;
  label: string;
  provider: Provider;
  tier: "main" | "mid" | "low";
  reasoningEfforts: readonly ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
};

const NO_EFFORTS = [] as const;

/**
 * ROSS compatibility registry. Provider discovery establishes whether the
 * user's credential can access a model; this registry establishes whether
 * ROSS knows how to use it safely and which request controls are valid.
 */
export const MODEL_CAPABILITIES: readonly ModelCapability[] = [
  ...CLAUDE_MAIN_MODELS.map((id) => ({
    id,
    label: id.replace(/^claude-/, "Claude ").replaceAll("-", " "),
    provider: "claude" as const,
    tier: "main" as const,
    reasoningEfforts: NO_EFFORTS,
  })),
  ...GEMINI_MAIN_MODELS.map((id) => ({
    id,
    label: id.replace(/^gemini-/, "Gemini ").replaceAll("-", " "),
    provider: "gemini" as const,
    tier: "main" as const,
    reasoningEfforts: NO_EFFORTS,
  })),
  {
    id: "gpt-5.6",
    label: "GPT-5.6",
    provider: "openai",
    tier: "main",
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "openai",
    tier: "main",
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
    tier: "main",
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
  },
];

const CAPABILITY_BY_ID = new Map(
  MODEL_CAPABILITIES.map((capability) => [capability.id, capability]),
);

export function modelCapability(model: string): ModelCapability | null {
  return CAPABILITY_BY_ID.get(model) ?? null;
}

export function resolveReasoningEffort(
  model: string,
  requested?: ReasoningEffort,
): ReasoningEffort | undefined {
  const capability = modelCapability(model);
  if (!capability?.reasoningEfforts.length) return undefined;
  if (requested && capability.reasoningEfforts.includes(requested)) {
    return requested;
  }
  return capability.defaultReasoningEffort;
}

export function supportsReasoningEffort(
  model: string,
  effort: ReasoningEffort,
): boolean {
  return modelCapability(model)?.reasoningEfforts.includes(effort) === true;
}

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
  if (model.startsWith("claude")) return "claude";
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("gpt-")) return "openai";
  throw new Error(`Unknown model id: ${model}`);
}

export function resolveModel(
  id: string | null | undefined,
  fallback: string,
): string {
  if (id && ALL_MODELS.has(id)) return id;
  return fallback;
}
