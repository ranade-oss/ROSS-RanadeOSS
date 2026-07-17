import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateFinalCompletion } from "../../scripts/lib/final-completion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plan = JSON.parse(readFileSync(resolve(root, "config/final-completion.v1.json"), "utf8"));

test("partially completed final plan passes development integrity without claiming launch readiness", () => {
  const result = evaluateFinalCompletion(plan, {}, {}, {}, {}, false);
  assert.equal(result.ready, true);
  assert.equal(result.pending.length, 5);
  assert.deepEqual(
    plan.workstreams
      .filter((item) => item.status === "completed-with-evidence")
      .map((item) => item.id),
    ["lawyer-authored-benchmark", "five-workflow-reviews"],
  );
});

test("development integrity rejects expanded data or CanLII automation", () => {
  const unsafe = structuredClone(plan);
  unsafe.target.confidentialUseApproved = true;
  unsafe.providerStrategy.canliiWebsiteAutomationAllowed = true;
  const result = evaluateFinalCompletion(unsafe, {}, {}, {}, {}, false);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => /Confidential/.test(item)));
  assert.ok(result.blockers.some((item) => /CanLII/.test(item)));
});

test("production final gate accepts the reserved ID but fails closed while external work is pending", () => {
  const result = evaluateFinalCompletion(plan, { ready: false }, { ready: false }, { ready: false }, {}, true);
  assert.equal(result.ready, false);
  assert.notEqual(plan.releaseId, "unassigned");
  assert.equal(
    result.blockers.some((item) => /release ID/i.test(item)),
    false,
  );
  assert.ok(
    result.blockers.some((item) => /authorized-ontario-case-law/i.test(item)),
  );
  assert.ok(result.blockers.some((item) => /professional validation/i.test(item)));
  assert.ok(
    result.blockers.some((item) => /operational-exercises/i.test(item)),
  );
});

test("a coherent evidence-complete controlled-beta record can pass", () => {
  const completed = structuredClone(plan);
  completed.status = "completed-approved-for-controlled-beta";
  completed.releaseId = "ross-rc-001";
  for (const item of completed.workstreams) item.status = "completed-with-evidence";
  const records = {
    approvals: "ross-rc-001",
    operations: "ross-rc-001",
    launch: "ross-rc-001",
    manifest: "ross-rc-001",
  };
  assert.equal(
    evaluateFinalCompletion(
      completed,
      { ready: true },
      { ready: true },
      { ready: true },
      records,
      true,
    ).ready,
    true,
  );
});
