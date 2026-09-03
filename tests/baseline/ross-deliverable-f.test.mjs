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
  assert.equal(plan.status, "completed-approved-for-controlled-beta");
  assert.equal(
    plan.workstreams.every((item) => item.status === "completed-with-evidence"),
    true,
  );
  assert.deepEqual(plan.target.practiceAreas, [
    "Ontario civil litigation and appeals",
    "Ontario Small Claims Court",
  ]);
  assert.equal(plan.target.confidentialUseApproved, true);
  assert.equal(plan.target.dataBoundary, "connected-provider-responsibility");
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

test("release train carries final evidence and keeps promotion explicit", () => {
 const workflow = read(".github/workflows/verify-and-deploy-public-beta.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /final:check/);
 assert.match(workflow, /retention-days: 90/);
 assert.match(workflow, /reports\/final-completion-dossier\.md/);
 assert.match(workflow, /config\/release-approvals\.v1\.json/);
 assert.match(workflow, /if: inputs\.promote_public/);
});

test("owner action sheet ends with the fail-closed gate and limited launch", () => {
  const sheet = read("docs/final/owner-action-sheet.md");
  assert.match(sheet, /npm run final:check/);
  assert.match(sheet, /confidential or privileged use is at the\s+user's own risk/i);
  assert.match(sheet, /no further planned software package after G/i);
});
