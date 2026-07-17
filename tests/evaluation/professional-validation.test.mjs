import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateProfessionalValidation } from "../../scripts/lib/professional-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const pending = readJson("config/professional-validation.v1.json");
const benchmark = readJson("tests/evaluation/ontario-benchmark.v1.json");
const workflows = readJson("workflows/ontario/catalogue.json");
const approvals = readJson("config/release-approvals.v1.json");

test("pending professional-validation records pass development integrity checks", () => {
  const result = evaluateProfessionalValidation(pending, benchmark, workflows, approvals, false);
  assert.equal(result.ready, true);
  assert.equal(result.warnings.length, 4);
});

test("development validation rejects false or partial approvals", () => {
  const falseApproval = structuredClone(pending);
  falseApproval.workflowReviews[0].status = "approved-by-ontario-lawyer";
  assert.equal(
    evaluateProfessionalValidation(falseApproval, benchmark, workflows, approvals, false).ready,
    false,
  );
});

test("production validation fails closed while external work is pending", () => {
  const result = evaluateProfessionalValidation(pending, benchmark, workflows, approvals, true);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => /case-law provider/.test(item)));
  assert.ok(result.blockers.some((item) => /benchmark/.test(item)));
  assert.ok(result.blockers.some((item) => /privacy/.test(item)));
});

test("complete evidence-bearing professional validation can pass", () => {
  const record = structuredClone(pending);
  const reviewedBenchmark = structuredClone(benchmark);
  const reviewedWorkflows = structuredClone(workflows);
  const approved = structuredClone(approvals);
  record.status = "approved-for-controlled-beta";
  record.scope.status = "approved-by-ontario-lawyer";
  for (const area of record.scope.practiceAreas) area.status = "approved-by-ontario-lawyer";
  Object.assign(record.legalSourceDecision, {
    status: "approved-authorized-provider",
    selectedProvider: "authorized-provider",
    authorizationBasis: "executed provider agreement",
    agreementOrAuthorizationId: "AUTH-001",
    decisionOwner: "Product owner",
    decisionDate: "2026-07-17",
    evidence: "reviews/provider-selection.md",
    allowedOperations: ["metadata-search", "full-text-retrieval"],
    verifiedCoverage: [...record.legalSourceDecision.requiredCoverage],
  });
  Object.assign(record.benchmarkReview, {
    status: "approved-by-ontario-lawyer",
    reviewer: "Ontario lawyer",
    professionalStatus: "Law Society of Ontario licensee",
    reviewDate: "2026-07-17",
    evidence: "reviews/benchmark-review.md",
    independentAdjudicator: "Second reviewer",
    adjudicationDate: "2026-07-17",
    adjudicationEvidence: "reviews/benchmark-adjudication.md",
  });
  Object.assign(reviewedBenchmark, {
    status: "ontario-lawyer-reviewed-approved",
    reviewer: "Ontario lawyer",
    reviewDate: "2026-07-17",
    releaseApproved: true,
  });
  for (const review of record.workflowReviews) {
    Object.assign(review, {
      status: "approved-by-ontario-lawyer",
      reviewer: "Ontario lawyer",
      professionalStatus: "Law Society of Ontario licensee",
      reviewDate: "2026-07-17",
      sourceAsOfDate: "2026-07-17",
      evidence: `reviews/${review.slug}.md`,
    });
    const workflow = reviewedWorkflows.find((item) => item.slug === review.slug);
    Object.assign(workflow, {
      status: "lawyer-reviewed-approved",
      reviewer: review.reviewer,
      reviewDate: review.reviewDate,
      reviewEvidence: review.evidence,
    });
  }
  for (const name of ["privacy", "security", "accessibility"])
    Object.assign(approved.approvals[name], {
      status: "approved",
      approver: `${name} reviewer`,
      date: "2026-07-17",
      evidence: `reviews/${name}.md`,
    });
  assert.equal(
    evaluateProfessionalValidation(record, reviewedBenchmark, reviewedWorkflows, approved, true).ready,
    true,
  );
});
