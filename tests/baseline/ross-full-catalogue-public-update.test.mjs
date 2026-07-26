import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the public update exposes the complete live A2AJ catalogue with warnings and pagination", () => {
  const client = read("backend/src/lib/legalSources/a2ajClient.ts");
  const provider = read("backend/src/lib/legalSources/a2ajProvider.ts");
  const route = read("backend/src/routes/a2ajCatalogue.ts");
  const scheduledObserver = read("scripts/lib/live-source-observer.mjs");
  const deploymentObserver = read("scripts/observe-a2aj-catalogue.mjs");
  assert.match(client, /docType: "cases" \| "laws"/);
  assert.match(client, /doc_type: docType/);
  assert.match(provider, /this\.client\.coverage\("cases"\)/);
  assert.match(provider, /this\.client\.coverage\("laws"\)/);
  assert.match(scheduledObserver, /docType: "cases"/);
  assert.match(scheduledObserver, /docType: "laws"/);
  assert.match(deploymentObserver, /\/coverage\?doc_type=cases/);
  assert.match(deploymentObserver, /\/coverage\?doc_type=laws/);
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

test("the release train rehearses by default and generates release IDs automatically", () => {
  const workflow = read(".github/workflows/verify-and-deploy-public-beta.yml");
  assert.match(workflow, /name: ROSS release train/);
  assert.match(workflow, /promote_public:/);
  assert.match(workflow, /default: false/);
  assert.doesNotMatch(workflow, /release_id:|api_app_name:|web_app_name:/);
  assert.match(workflow, /release-train-image-ref\.mjs next-id/);
  assert.match(workflow, /node scripts\/validate-release-id\.mjs/);
  assert.doesNotMatch(workflow, /a2aj-canlii-v1/);
  assert.match(workflow, /Run complete engineering gate/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /environment: public-beta/);
  assert.match(workflow, /build-release-train-images\.sh/);
  assert.match(workflow, /fly-release-train\.mjs rehearse/);
  assert.match(workflow, /if: inputs\.promote_public/);
  assert.match(workflow, /fly-release-train\.mjs promote/);
  assert.match(
    workflow,
    /Create immutable tag and GitHub release after public success/,
  );
  assert.match(workflow, /release-train-ledger\.json/);
});

test("the older public deployment workflow is clearly legacy and hard blocked", () => {
  const workflow = read(".github/workflows/deploy-public-beta-ross.yml");
  assert.match(workflow, /name: "Legacy: deploy previously governed public beta"/);
  assert.match(workflow, /Legacy public deployment is disabled/);
  assert.match(workflow, /Run ROSS release train instead/);
  assert.match(workflow, /preflight:/);
  assert.match(workflow, /preflight:[\s\S]*?if: \$\{\{ false \}\}/);
  assert.match(workflow, /needs: preflight/);
});

test("the combined public update expressly excludes the private-only defect set", () => {
  const instructions = read("docs/deployment/public-beta-combined-update.md");
  assert.match(instructions, /private-ROSS OpenAI-key/);
  assert.match(instructions, /not part of this update/);
  assert.match(instructions, /No database migration or new secret is required/);
  assert.match(instructions, /Do not run the older standalone hotfix/);
});
