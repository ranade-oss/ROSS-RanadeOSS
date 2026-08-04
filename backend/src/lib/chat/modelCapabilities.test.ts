import assert from "node:assert/strict";
import test from "node:test";
import {
  modelCapability,
  resolveModel,
  resolveReasoningEffort,
  supportsReasoningEffort,
} from "../llm/models";
import { discoverCompatibleModels } from "../llm/modelDiscovery";

test("GPT-5.6 is a ROSS-compatible main model", () => {
  assert.equal(resolveModel("gpt-5.6", "fallback"), "gpt-5.6");
  assert.equal(resolveModel("gpt-5.6-terra", "fallback"), "gpt-5.6-terra");
  assert.equal(modelCapability("gpt-5.6")?.tier, "main");
});

test("reasoning effort is model-specific", () => {
  assert.equal(supportsReasoningEffort("gpt-5.6", "max"), true);
  assert.equal(supportsReasoningEffort("gpt-5.6-luna", "max"), true);
  assert.equal(supportsReasoningEffort("gpt-5.5", "max"), false);
  assert.equal(supportsReasoningEffort("gemini-3.6-flash", "minimal"), true);
  assert.equal(supportsReasoningEffort("claude-opus-5", "max"), true);
  assert.equal(supportsReasoningEffort("kimi-k3", "max"), true);
});

test("unsupported reasoning effort falls back to the model default", () => {
  assert.equal(resolveReasoningEffort("gpt-5.5", "max"), "medium");
  assert.equal(resolveReasoningEffort("gemini-2-flash", "high"), undefined);
});

test("key-scoped discovery exposes live compatible models for every provider", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const body = url.includes("api.openai.com")
      ? {
          data: [
            { id: "gpt-5.6-sol" },
            { id: "gpt-5.6-terra" },
            { id: "gpt-5.6-luna" },
            { id: "gpt-6-preview" },
            { id: "text-embedding-3-large" },
          ],
        }
      : url.includes("api.anthropic.com")
        ? {
            data: [{ id: "claude-opus-5", display_name: "Claude Opus 5" }],
            has_more: false,
          }
        : url.includes("generativelanguage.googleapis.com")
          ? {
              models: [
                {
                  name: "models/gemini-3.6-flash",
                  baseModelId: "gemini-3.6-flash",
                  displayName: "Gemini 3.6 Flash",
                  supportedGenerationMethods: ["generateContent"],
                },
                {
                  name: "models/text-embedding-999",
                  supportedGenerationMethods: ["embedContent"],
                },
              ],
            }
          : url.includes("api.x.ai")
            ? { data: [{ id: "grok-4.6" }, { id: "grok-image-1" }] }
            : { data: [{ id: "kimi-k3" }, { id: "embedding-v1" }] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const secrets = {
      openai: "sk-openai-secret",
      claude: "sk-claude-secret",
      gemini: "gemini-secret",
      xai: "xai-secret",
      moonshot: "moonshot-secret",
    };
    const result = await discoverCompatibleModels(secrets);
    for (const id of [
      "gpt-5.6",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-6-preview",
      "claude-opus-5",
      "gemini-3.6-flash",
      "grok-4.6",
      "kimi-k3",
    ]) {
      assert.equal(
        result.models.find((model) => model.id === id)?.available,
        true,
        id,
      );
    }
    for (const id of [
      "text-embedding-3-large",
      "text-embedding-999",
      "grok-image-1",
      "embedding-v1",
    ]) {
      assert.equal(
        result.models.some((model) => model.id === id),
        false,
        id,
      );
    }
    for (const secret of Object.values(secrets)) {
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
    assert.equal(calls.length, 5);
    assert.equal(
      calls
        .find((call) => call.url.includes("api.anthropic.com"))
        ?.headers.get("x-api-key"),
      secrets.claude,
    );
    assert.equal(
      calls
        .find((call) => call.url.includes("generativelanguage.googleapis.com"))
        ?.headers.get("x-goog-api-key"),
      secrets.gemini,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful discovery with no compatible chat model fails closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ id: "text-embedding-3-large" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const result = await discoverCompatibleModels({ openai: "sk-test" });
    const openAIModels = result.models.filter(
      (model) => model.provider === "openai",
    );
    assert.ok(openAIModels.length > 0);
    assert.equal(
      openAIModels.every((model) => !model.available),
      true,
    );
    assert.match(openAIModels[0]?.availabilityReason ?? "", /does not list/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
