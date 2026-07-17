import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

test("Deliverable F consolidates every remaining completion workstream", () => {
  const plan = json("config/final-completion.v1.json");
  assert.equal(plan.workstreams.length, 7);
  assert.equal(plan.status, "blocked-awaiting-external-completion");
  assert.deepEqual(plan.target.practiceAreas, [
    "Ontario civil litigation and appeals",
    "Ontario Small Claims Court",
  ]);
  assert.equal(plan.target.confidentialUseApproved, false);
  assert.equal(plan.target.publicIndexingApproved, false);
});

test("Deliverable F preserves source boundaries and exposes coverage gaps", () => {
  const plan = json("config/final-completion.v1.json");
  assert.equal(plan.providerStrategy.implementedOpenProvider, "a2aj-canada");
  assert.deepEqual(plan.providerStrategy.knownGaps, [
    "Ontario Superior Court of Justice",
    "Ontario Small Claims Court",
  ]);
  assert.equal(plan.providerStrategy.canliiWebsiteAutomationAllowed, false);
});

test("final evidence workflow is manual, immutable, and never deploys", () => {
  const workflow = read(".github/workflows/final-controlled-beta-evidence.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /final:check/);
  assert.match(workflow, /verify-final-release-id/);
  assert.doesNotMatch(workflow, /flyctl deploy|wrangler deploy|kubectl|helm upgrade/i);
});

test("owner action sheet ends with the fail-closed gate and limited launch", () => {
  const sheet = read("docs/final/owner-action-sheet.md");
  assert.match(sheet, /npm run final:check/);
  assert.match(sheet, /synthetic or\s+non-confidential/);
  assert.match(sheet, /no further software package/i);
});
