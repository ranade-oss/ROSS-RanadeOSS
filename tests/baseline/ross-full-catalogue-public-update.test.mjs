import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the public update exposes the complete live A2AJ catalogue with warnings and pagination", () => {
  const provider = read("backend/src/lib/legalSources/a2ajProvider.ts");
  const route = read("backend/src/routes/a2ajCatalogue.ts");
  assert.match(provider, /async catalogue\(\)/);
  assert.match(provider, /searchDecisionPage/);
  assert.match(provider, /searchLegislationPage/);
  assert.match(provider, /duplicateCount/);
  assert.match(provider, /nextOffset/);
  assert.match(provider, /A2AJ coverage is provider-reported/);
  assert.match(provider, /casesCiting/);
  assert.match(provider, /citingCasesCount/);
  assert.match(route, /\/catalogue/);
  assert.match(route, /\/decisions/);
  assert.match(route, /\/laws/);
  assert.match(route, /\^CA\(\?:-\[A-Z\]\{2\}\)\?\$/);
});

test("the existing per-user CanLII field activates backend metadata, citation, and citator access", () => {
  const field = read("frontend/src/app/(pages)/account/api-keys/page.tsx");
  const provider = read("backend/src/lib/legalSources/canliiProvider.ts");
  const routes = read("backend/src/routes/canlii.ts");
  const settings = read("backend/src/lib/userSettings.ts");
  assert.match(field, /CanLII API Key/);
  assert.match(field, /Your key is encrypted in storage/);
  assert.match(provider, /CanLII authorized connector/);
  assert.match(provider, /verifyCitations/);
  assert.match(provider, /getCitator/);
  assert.match(routes, /\/citations\/verify/);
  assert.match(routes, /\/cases\/:databaseId\/:caseId\/citator/);
  assert.match(routes, /userContext/);
  assert.match(settings, /api_keys\.canlii/);
  assert.match(settings, /"canlii-licensed"/);
  assert.doesNotMatch(provider, /process\.env/);
});

test("the consolidated workflow fixes signup verification and replaces the three manual release workflows", () => {
  const workflow = read(".github/workflows/verify-and-deploy-public-beta.yml");
  assert.match(workflow, /name: Verify and deploy public ROSS beta/);
  assert.match(workflow, /Run repository and full-catalogue tests/);
  assert.match(workflow, /Create or confirm the immutable tag/);
  assert.match(workflow, /environment: public-beta/);
  assert.match(workflow, /observe-a2aj-catalogue\.mjs/);
  assert.match(workflow, /--output \/dev\/null/);
  assert.doesNotMatch(workflow, /grep -q "Create Account"/);
  assert.match(workflow, /final-combined-evidence/);
});

test("the combined public update expressly excludes the private-only defect set", () => {
  const instructions = read("docs/deployment/public-beta-combined-update.md");
  assert.match(instructions, /private-ROSS OpenAI-key/);
  assert.match(instructions, /not part of this update/);
  assert.match(instructions, /No database migration or new secret is required/);
  assert.match(instructions, /Do not run the older standalone hotfix/);
});
