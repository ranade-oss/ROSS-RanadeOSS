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
export const OPENAI_MAIN_MODELS = [
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
] as const;
export const XAI_MAIN_MODELS = ["grok-4.5"] as const;
export const MOONSHOT_MAIN_MODELS = ["kimi-k2.5"] as const;

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
  ...XAI_MAIN_MODELS,
  ...MOONSHOT_MAIN_MODELS,
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
const GPT_5_6_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

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
  ...XAI_MAIN_MODELS.map((id) => ({
    id,
    label: "Grok 4.5",
    provider: "xai" as const,
    tier: "main" as const,
    reasoningEfforts: NO_EFFORTS,
  })),
  ...MOONSHOT_MAIN_MODELS.map((id) => ({
    id,
    label: "Kimi K2.5",
    provider: "moonshot" as const,
    tier: "main" as const,
    reasoningEfforts: NO_EFFORTS,
  })),
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    tier: "main",
    reasoningEfforts: GPT_5_6_EFFORTS,
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    tier: "main",
    reasoningEfforts: GPT_5_6_EFFORTS,
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    tier: "main",
    reasoningEfforts: GPT_5_6_EFFORTS,
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.6",
    label: "GPT-5.6 (Sol alias)",
    provider: "openai",
    tier: "main",
    reasoningEfforts: GPT_5_6_EFFORTS,
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
  const registered = CAPABILITY_BY_ID.get(model);
  if (registered?.reasoningEfforts.length) return registered;
  return inferredModelCapability(model) ?? registered ?? null;
}

function inferredModelCapability(model: string): ModelCapability | null {
  let provider: Provider;
  try {
    provider = providerForModel(model);
  } catch {
    return null;
  }

  const base = {
    id: model,
    label: modelLabel(model),
    provider,
    tier: "main" as const,
  };

  if (/^claude-opus-5(?:-|$)/.test(model)) {
    return {
      ...base,
      reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
      defaultReasoningEffort: "high",
    };
  }
  if (
    /^claude-(?:fable|mythos|sonnet)-5(?:-|$)/.test(model) ||
    /^claude-(?:opus|sonnet)-4-(?:6|7|8)(?:-|$)/.test(model)
  ) {
    return {
      ...base,
      reasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "high",
    };
  }
  if (/^gemini-3(?:\.|-|$)/.test(model)) {
    return {
      ...base,
      reasoningEfforts: ["minimal", "low", "medium", "high"],
      defaultReasoningEffort: "medium",
    };
  }
  if (/^kimi-k3(?:-|$)/.test(model)) {
    return {
      ...base,
      reasoningEfforts: ["low", "high", "max"],
      defaultReasoningEffort: "max",
    };
  }
  return { ...base, reasoningEfforts: NO_EFFORTS };
}

export function modelLabel(model: string): string {
  const prefixes: readonly [string, string][] = [
    ["claude-", "Claude "],
    ["gemini-", "Gemini "],
    ["gpt-", "GPT-"],
    ["grok-", "Grok "],
    ["kimi-", "Kimi "],
  ];
  const [prefix, labelPrefix] =
    prefixes.find(([candidate]) => model.startsWith(candidate)) ?? ["", ""];
  const suffix = model
    .slice(prefix.length)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return `${labelPrefix}${suffix}`;
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
  if (/^claude-[A-Za-z0-9][A-Za-z0-9._:-]{0,152}$/.test(model)) {
    return "claude";
  }
  if (/^gemini-[A-Za-z0-9][A-Za-z0-9._:-]{0,152}$/.test(model)) {
    return "gemini";
  }
  if (
    /^(?:gpt-[A-Za-z0-9]|o\d|ft:(?:gpt-[A-Za-z0-9]|o\d))[A-Za-z0-9._:-]{0,155}$/.test(
      model,
    )
  ) {
    return "openai";
  }
  if (/^grok-[A-Za-z0-9][A-Za-z0-9._:-]{0,154}$/.test(model)) return "xai";
  if (/^kimi-[A-Za-z0-9][A-Za-z0-9._:-]{0,154}$/.test(model)) {
    return "moonshot";
  }
  throw new Error(`Unknown model id: ${model}`);
}

export function resolveModel(
  id: string | null | undefined,
  fallback: string,
): string {
  if (id && (ALL_MODELS.has(id) || modelCapability(id))) return id;
  return fallback;
}
