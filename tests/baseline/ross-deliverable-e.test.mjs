import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));

test("Deliverable E adopts a narrow Ontario validation scope without false approval", () => {
  const record = readJson("config/professional-validation.v1.json");
  assert.equal(record.status, "blocked-awaiting-professional-validation");
  assert.deepEqual(
    record.scope.practiceAreas.map((area) => area.id),
    ["ontario-civil-litigation", "ontario-small-claims"],
  );
  assert.equal(record.legalSourceDecision.canliiScrapingAllowed, false);
  assert.equal(record.confidentialDataBoundary.confidentialUseApproved, false);
});

test("Deliverable E requires evidence for provider, benchmark, and five workflow reviews", () => {
  const record = readJson("config/professional-validation.v1.json");
  const validator = read("scripts/lib/professional-validation.mjs");
  assert.equal(record.workflowReviews.length, 5);
  assert.ok(record.workflowReviews.every((review) => review.evidence === null));
  assert.match(validator, /approved-authorized-provider/);
  assert.match(validator, /independentAdjudicator/);
  assert.match(validator, /sourceAsOfDate/);
  assert.match(validator, /privacy/);
  assert.match(validator, /security/);
  assert.match(validator, /accessibility/);
});

test("workflow approval is possible only with matching review evidence", () => {
  const generator = read("scripts/build-ross-workflows.mjs");
  const workflows = readJson("workflows/ontario/catalogue.json");
  assert.match(generator, /lawyer-reviewed-approved/);
  assert.match(generator, /approval evidence is incomplete/);
  assert.ok(workflows.every((workflow) => workflow.reviewEvidence === null));
});

test("production release readiness includes the professional-validation gate", () => {
  const releaseGate = read("scripts/lib/release-readiness.mjs");
  const packageJson = readJson("package.json");
  assert.match(releaseGate, /professionalValidation/);
  assert.match(packageJson.scripts["validation:check"], /--production/);
  assert.match(packageJson.scripts["validation:check:development"], /professional-validation/);
});
