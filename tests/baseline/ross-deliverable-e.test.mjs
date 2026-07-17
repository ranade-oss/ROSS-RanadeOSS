import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));

test("Ontario professional validation records the reviewed scope without false launch approval", () => {
  const record = readJson("config/professional-validation.v1.json");
  assert.equal(record.status, "blocked-awaiting-authorized-provider");
  assert.equal(record.scope.status, "approved-by-ontario-lawyer");
  assert.deepEqual(
    record.scope.practiceAreas.map((area) => area.id),
    ["ontario-civil-litigation", "ontario-small-claims"],
  );
  assert.equal(record.legalSourceDecision.canliiScrapingAllowed, false);
  assert.equal(record.confidentialDataBoundary.confidentialUseApproved, false);
});

test("professional validation preserves the provider gate and records review evidence", () => {
  const record = readJson("config/professional-validation.v1.json");
  const validator = read("scripts/lib/professional-validation.mjs");
  assert.equal(record.workflowReviews.length, 5);
  assert.equal(record.legalSourceDecision.evidence, null);
  assert.ok(
    record.workflowReviews.every(
      (review) =>
        review.status === "approved-by-ontario-lawyer" &&
        review.evidence === "reviews/ontario-workflow-review-2026-07-17.md",
    ),
  );
  assert.equal(
    record.benchmarkReview.adjudicationEvidence,
    "reviews/benchmark-adjudication-anonymous-2026-07-17.md",
  );
  assert.match(validator, /approved-authorized-provider/);
  assert.match(validator, /independentAdjudicator/);
  assert.match(validator, /sourceAsOfDate/);
  assert.match(validator, /privacy/);
  assert.match(validator, /security/);
  assert.match(validator, /accessibility/);
});

test("approved workflows carry matching review evidence", () => {
  const generator = read("scripts/build-ross-workflows.mjs");
  const workflows = readJson("workflows/ontario/catalogue.json");
  assert.match(generator, /lawyer-reviewed-approved/);
  assert.match(generator, /approval evidence is incomplete/);
  assert.ok(
    workflows.every(
      (workflow) =>
        workflow.status === "lawyer-reviewed-approved" &&
        workflow.reviewEvidence ===
          "reviews/ontario-workflow-review-2026-07-17.md",
    ),
  );
});

test("production release readiness includes the professional-validation gate", () => {
  const releaseGate = read("scripts/lib/release-readiness.mjs");
  const packageJson = readJson("package.json");
  assert.match(releaseGate, /professionalValidation/);
  assert.match(packageJson.scripts["validation:check"], /--production/);
  assert.match(packageJson.scripts["validation:check:development"], /professional-validation/);
});
