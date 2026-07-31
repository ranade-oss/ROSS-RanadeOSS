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
  assert.match(prompt, /source_id returned by that same provider/);
  assert.match(prompt, /stop making CanLII calls for this turn/);
  assert.match(
    prompt,
    /partially successful only if an earlier metadata discovery actually succeeded/,
  );
  assert.match(prompt, /random, sample, recent, or arbitrary cases/);
  assert.match(prompt, /citationVerification value is exactly "verified"/);
  assert.match(
    prompt,
    /pass the neutral citation returned by A2AJ as source_id/,
  );
});
