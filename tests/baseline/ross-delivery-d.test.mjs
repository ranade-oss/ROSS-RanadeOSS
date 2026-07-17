import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("Deliverable D retains live source observation and deployment evidence", () => {
  const scheduled = read(".github/workflows/verify-ontario-sources.yml");
  const deployment = read(".github/workflows/deploy-private-ross.yml");
  const observer = read("scripts/lib/live-source-observer.mjs");

  assert.match(scheduled, /schedule:/);
  assert.match(scheduled, /observe-legal-sources\.mjs/);
  assert.match(deployment, /observe-legal-sources\.mjs/);
  assert.match(observer, /LEGISLATION-ON/);
  assert.match(observer, /REGULATIONS-ON/);
});

test("Deliverable D expands A2AJ laws without weakening official-source boundaries", () => {
  const client = read("backend/src/lib/legalSources/a2ajClient.ts");
  const provider = read("backend/src/lib/legalSources/a2ajProvider.ts");
  const dispatcher = read("backend/src/lib/chat/tools/toolDispatcher.ts");
  const prompts = read("backend/src/lib/chat/prompts.ts");
  const docs = read("docs/legal-sources/a2aj-canadian-provider.md");

  assert.match(client, /"cases" \| "laws"/);
  assert.match(provider, /searchLegislation/);
  assert.match(provider, /reproductionIsOfficial: false/);
  assert.match(dispatcher, /searchTargets/);
  assert.match(prompts, /Prefer Ontario e-Laws or Justice Laws Canada/);
  assert.match(docs, /always labelled `unofficial`/);
});

test("Deliverable D exposes authenticated, sanitized research readiness", () => {
  const route = read("backend/src/routes/legalSources.ts");
  const readiness = read("backend/src/lib/legalSources/readiness.ts");
  const frontend = read(
    "frontend/src/app/(pages)/account/features/LegalSourceReadiness.tsx",
  );

  assert.match(route, /post\("\/readiness"/);
  assert.match(readiness, /provider-request-failed/);
  assert.doesNotMatch(readiness, /providerPayload/);
  assert.match(frontend, /Run research check/);
  assert.match(frontend, /knownOntarioGaps/);
});

test("Deliverable D keeps licensed CanLII and missing Ontario courts explicit", () => {
  const verification = read("docs/delivery-d-verification.md");
  assert.match(verification, /CanLII remains disabled/);
  assert.match(verification, /ONSC, ONCJ, Small Claims, HRTO, and LTB/);
  assert.match(verification, /CourtListener remains available/);
});
