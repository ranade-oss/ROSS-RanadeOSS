import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateProfessionalValidation } from "../../scripts/lib/professional-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const integrated = readJson("config/professional-validation.v1.json");
const benchmark = readJson("tests/evaluation/ontario-benchmark.v1.json");
const workflows = readJson("workflows/ontario/catalogue.json");
const approvals = readJson("config/release-approvals.v1.json");

function completeValidationFixture(disclosureMode = "named") {
  const record = structuredClone(integrated);
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
    independentAdjudicator:
      disclosureMode === "anonymous" ? "Anonymous independent Ontario lawyer" : "Second reviewer",
    adjudicatorDisclosureMode: disclosureMode,
    adjudicatorProfessionalStatus: "Ontario lawyer",
    adjudicatorIndependenceAttested: true,
    adjudicationDate: "2026-07-17",
    adjudicationDateBasis:
      disclosureMode === "anonymous" ? "approval-recorded-date" : "review-date",
    adjudicationDecision: "approved",
    adjudicationEvidence: "reviews/benchmark-adjudication.md",
    adjudicatorVerification: {
      status: "verified",
      method:
        disclosureMode === "anonymous"
          ? "accountable-owner-attestation"
          : "confidential-identity-check",
      verifiedBy: "Product owner",
      verificationDate: "2026-07-17",
      evidence: "reviews/benchmark-adjudication.md",
    },
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
  return { record, reviewedBenchmark, reviewedWorkflows, approved };
}

test("integrated professional reviews pass development integrity without claiming launch readiness", () => {
  const result = evaluateProfessionalValidation(integrated, benchmark, workflows, approvals, false);
  assert.equal(result.ready, true);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /provider selection is pending/);
});

test("development validation rejects partial professional-review integration", () => {
  const partialRecord = structuredClone(integrated);
  const partialWorkflows = structuredClone(workflows);
  partialRecord.workflowReviews[0].status = "pending-ontario-lawyer-review";
  partialWorkflows[0].status = "draft-awaiting-lawyer-review";
  assert.equal(
    evaluateProfessionalValidation(
      partialRecord,
      benchmark,
      partialWorkflows,
      approvals,
      false,
    ).ready,
    false,
  );
});

test("production validation still fails closed on the remaining external gates", () => {
  const result = evaluateProfessionalValidation(integrated, benchmark, workflows, approvals, true);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => /case-law provider/.test(item)));
  assert.ok(result.blockers.some((item) => /privacy/.test(item)));
  assert.ok(!result.blockers.some((item) => /benchmark.*not approved/i.test(item)));
});

test("complete evidence-bearing named professional validation can pass", () => {
  const fixture = completeValidationFixture("named");
  assert.equal(
    evaluateProfessionalValidation(
      fixture.record,
      fixture.reviewedBenchmark,
      fixture.reviewedWorkflows,
      fixture.approved,
      true,
    ).ready,
    true,
  );
});

test("complete evidence-bearing anonymous independent adjudication can pass", () => {
  const fixture = completeValidationFixture("anonymous");
  assert.equal(
    evaluateProfessionalValidation(
      fixture.record,
      fixture.reviewedBenchmark,
      fixture.reviewedWorkflows,
      fixture.approved,
      true,
    ).ready,
    true,
  );
});

test("a bare anonymous adjudicator label fails closed", () => {
  const fixture = completeValidationFixture("anonymous");
  fixture.record.benchmarkReview.adjudicatorIndependenceAttested = false;
  fixture.record.benchmarkReview.adjudicatorVerification = {
    status: "pending",
    method: null,
    verifiedBy: null,
    verificationDate: null,
    evidence: null,
  };
  const result = evaluateProfessionalValidation(
    fixture.record,
    fixture.reviewedBenchmark,
    fixture.reviewedWorkflows,
    fixture.approved,
    true,
  );
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => /independence is not attested/.test(item)));
  assert.ok(result.blockers.some((item) => /verification is not complete/.test(item)));
});
