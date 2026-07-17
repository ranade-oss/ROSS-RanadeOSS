import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedModelProviders,
  defaultModelForRuntime,
  isModelApprovedForRuntime,
  resolveRuntimeModel,
} from "../llm/runtimeModels";

const RUNTIME_KEYS = [
  "ROSS_ENV",
  "ROSS_HOSTED_MODE",
  "HOSTED_MODEL_PROVIDERS",
  "CORS_ALLOWED_ORIGINS",
] as const;

async function withRuntime(
  values: Record<(typeof RUNTIME_KEYS)[number], string>,
  run: () => void | Promise<void>,
) {
  const previous = Object.fromEntries(
    RUNTIME_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await run();
  } finally {
    for (const key of RUNTIME_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("OpenAI-only hosted runtime rejects Gemini and normalizes stored defaults", async () => {
  await withRuntime(
    {
      ROSS_ENV: "staging",
      ROSS_HOSTED_MODE: "controlled-beta",
      HOSTED_MODEL_PROVIDERS: "openai",
      CORS_ALLOWED_ORIGINS: "https://app.ross.test",
    },
    () => {
      assert.deepEqual(approvedModelProviders(), ["openai"]);
      assert.equal(isModelApprovedForRuntime("gemini-3-flash-preview"), false);
      assert.equal(isModelApprovedForRuntime("gpt-5.6"), true);
      assert.equal(defaultModelForRuntime("main"), "gpt-5.6");
      assert.equal(defaultModelForRuntime("mid"), "gpt-5.4");
      assert.equal(defaultModelForRuntime("low"), "gpt-5.4-lite");
      assert.equal(
        resolveRuntimeModel("gemini-3-flash-preview", "main"),
        "gpt-5.6",
      );
    },
  );
});

test("self-hosted runtime preserves all supported providers", async () => {
  await withRuntime(
    {
      ROSS_ENV: "local",
      ROSS_HOSTED_MODE: "self-hosted",
      HOSTED_MODEL_PROVIDERS: "openai",
      CORS_ALLOWED_ORIGINS: "http://localhost:3000",
    },
    () => {
      assert.deepEqual(approvedModelProviders(), [
        "gemini",
        "openai",
        "claude",
      ]);
      assert.equal(
        resolveRuntimeModel("gemini-3-flash-preview", "main"),
        "gemini-3-flash-preview",
      );
    },
  );
});
