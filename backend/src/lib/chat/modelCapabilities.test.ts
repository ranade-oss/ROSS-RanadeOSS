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
  assert.equal(modelCapability("gpt-5.6")?.tier, "main");
});

test("reasoning effort is model-specific", () => {
  assert.equal(supportsReasoningEffort("gpt-5.6", "max"), true);
  assert.equal(supportsReasoningEffort("gpt-5.5", "max"), false);
  assert.equal(
    supportsReasoningEffort("gemini-3-flash-preview", "high"),
    false,
  );
});

test("unsupported reasoning effort falls back to the model default", () => {
  assert.equal(resolveReasoningEffort("gpt-5.5", "max"), "medium");
  assert.equal(
    resolveReasoningEffort("gemini-3-flash-preview", "high"),
    undefined,
  );
});

test("key-scoped discovery exposes availability but never the API key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [{ id: "gpt-5.6" }, { id: "text-embedding-3-large" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const secret = "sk-test-secret-that-must-not-leak";
    const result = await discoverCompatibleModels({ openai: secret });
    assert.equal(
      result.models.find((model) => model.id === "gpt-5.6")?.available,
      true,
    );
    assert.equal(
      result.models.some((model) => model.id === "text-embedding-3-large"),
      false,
    );
    assert.equal(JSON.stringify(result).includes(secret), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
