"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MODELS,
  type ModelOption,
} from "@/app/components/assistant/ModelToggle";
import { getModelCatalog } from "@/app/lib/mikeApi";
import type { ModelProvider } from "@/app/lib/modelAvailability";

export function useModelCatalog() {
  const [models, setModels] = useState<ModelOption[]>(MODELS);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [approvedProviders, setApprovedProviders] = useState<ModelProvider[]>([
    "claude",
    "gemini",
    "openai",
  ]);
  const [selfHosted, setSelfHosted] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getModelCatalog();
      const mapped = result.models.map((model) => ({
        id: model.id,
        label: model.label,
        group:
          model.provider === "openai"
            ? ("OpenAI" as const)
            : model.provider === "claude"
              ? ("Anthropic" as const)
              : ("Google" as const),
        available: model.available,
        reasoningEfforts: [...model.reasoningEfforts],
        defaultReasoningEffort: model.defaultReasoningEffort,
      }));
      if (mapped.length) setModels(mapped);
      setApprovedProviders(result.approvedProviders);
      setSelfHosted(result.selfHosted);
      setWarning(result.warning ?? null);
    } catch {
      setWarning(
        "Model availability could not be refreshed. Showing the curated fallback.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    models,
    approvedProviders,
    selfHosted,
    loading,
    warning,
    refresh,
  };
}
