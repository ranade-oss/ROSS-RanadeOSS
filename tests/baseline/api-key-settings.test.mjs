import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("model-provider API key fields remain visible after catalog loading", () => {
  const page = read("frontend/src/app/(pages)/account/api-keys/page.tsx");
  const expanded = read(
    "frontend/src/app/(pages)/account/api-keys/ExpandedProviderKeys.tsx",
  );

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
  assert.match(
    page,
    /<ExpandedProviderKeys\s*\/>/,
    "expanded credential inputs must not depend on asynchronously loaded catalog props",
  );
  assert.doesNotMatch(
    expanded,
    /approvedProviders/,
    "catalog hydration must not remove direct-provider credential inputs",
  );
  assert.match(
    expanded,
    /\{PROVIDERS\.map\(\(entry, index\) =>/,
    "every configured direct-provider credential input must render",
  );
  assert.doesNotMatch(
    expanded,
    /PROVIDERS\.filter\(/,
    "direct-provider credential inputs must not be filtered after first render",
  );
});

test("a future direct provider inherits stable API-key visibility", () => {
  const expanded = read(
    "frontend/src/app/(pages)/account/api-keys/ExpandedProviderKeys.tsx",
  );
  const withFutureProvider = expanded.replace(
    "] as const;",
    ', { provider: "future-provider", label: "Future API Key", placeholder: "key-..." }] as const;',
  );

  assert.match(
    withFutureProvider,
    /provider: "future-provider"/,
    "the regression fixture must add a synthetic future provider",
  );
  assert.match(
    withFutureProvider,
    /\{PROVIDERS\.map\(\(entry, index\) =>/,
    "future providers added to the credential registry must render through the same stable path",
  );
  assert.doesNotMatch(
    withFutureProvider,
    /PROVIDERS\.filter\(|approvedProviders/,
    "future provider visibility must not depend on a later catalog response",
  );
});

test("provider model discovery recognizes aliases and is exhaustive", () => {
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
  assert.match(discovery, /satisfies Record<Provider, DiscoveryAdapter>/);
  for (const provider of ["openai", "claude", "gemini", "xai", "moonshot"]) {
    assert.match(discovery, new RegExp(`\\b${provider}:`));
  }
});
