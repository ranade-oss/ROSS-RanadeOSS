import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt } from "./prompts";

test("identifies a configured CanLII metadata connector without promising full-text search", () => {
  const prompt = buildSystemPrompt({
    enabled: true,
    defaultCountry: "CA",
    defaultProvince: "ON",
    enabledJurisdictions: ["CA-ON", "CA"],
    enabledSourceProviders: ["a2aj-canada", "canlii-licensed"],
  });

  assert.match(
    prompt,
    /Enabled legal-source provider IDs for this user: a2aj-canada, canlii-licensed/,
  );
  assert.match(prompt, /it has a usable per-user key/);
  assert.match(prompt, /not general full-text keyword search/);
  assert.match(prompt, /does not mean that the key or connector is disabled/);
  assert.match(prompt, /discover candidate neutral citations with A2AJ/);
  assert.match(prompt, /verify the selected citations through CanLII/);
});
