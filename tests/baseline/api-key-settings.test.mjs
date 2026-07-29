import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("core model-provider API key fields remain visible after catalog loading", () => {
  const page = read("frontend/src/app/(pages)/account/api-keys/page.tsx");

  for (const provider of ["claude", "gemini", "openai"]) {
    assert.match(
      page,
      new RegExp(`provider: ["']${provider}["']`),
      `${provider} must remain a core API-key field`,
    );
  }

  assert.match(
    page,
    /field\.provider !== ["']openrouter["'] \|\| selfHosted/,
    "only the self-hosted OpenRouter field should be conditionally hidden",
  );
  assert.doesNotMatch(
    page,
    /approvedProviders\.includes\(field\.provider\)/,
    "catalog approval must not remove core credential inputs after hydration",
  );
});

test("OpenAI model discovery recognizes the GPT-5.6 API alias", () => {
  const discovery = read("backend/src/lib/llm/modelDiscovery.ts");

  assert.match(
    discovery,
    /["']gpt-5\.6["']:\s*\[["']gpt-5\.6-sol["']\]/,
    "the public gpt-5.6 alias must map to the provider-listed gpt-5.6-sol identifier",
  );
  assert.match(
    discovery,
    /isModelListed\(capability\.id, ids\)/,
    "availability must use alias-aware model discovery",
  );
  assert.doesNotMatch(
    discovery,
    /available:\s*ids\.has\(capability\.id\)/,
    "literal-only discovery would incorrectly disable supported aliases",
  );
});
