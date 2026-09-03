import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateFinalCompletion } from "../../scripts/lib/final-completion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plan = JSON.parse(readFileSync(resolve(root, "config/final-completion.v1.json"), "utf8"));

test("completed final plan passes development integrity with no pending workstream", () => {
  const result = evaluateFinalCompletion(plan, {}, {}, {}, {}, false);
  assert.equal(result.ready, true);
  assert.equal(result.pending.length, 0);
  assert.deepEqual(
    plan.workstreams
      .filter((item) => item.status === "completed-with-evidence")
      .map((item) => item.id),
    plan.workstreams.map((item) => item.id),
  );
});

test("development integrity rejects missing provider-risk evidence or CanLII automation", () => {
  const unsafe = structuredClone(plan);
  unsafe.target.confidentialUseApprovalEvidence = null;
  unsafe.providerStrategy.canliiWebsiteAutomationAllowed = true;
  const result = evaluateFinalCompletion(unsafe, {}, {}, {}, {}, false);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => /Confidential-use approval evidence/.test(item)));
  assert.ok(result.blockers.some((item) => /CanLII/.test(item)));
});

test("production final gate accepts the reserved ID but fails closed when dependent gates fail", () => {
  const result = evaluateFinalCompletion(plan, { ready: false }, { ready: false }, { ready: false }, {}, true);
  assert.equal(result.ready, false);
  assert.notEqual(plan.releaseId, "unassigned");
  assert.equal(
    result.blockers.some((item) => /release ID/i.test(item)),
    false,
  );
  assert.equal(
    result.blockers.some((item) => /authorized-ontario-case-law/i.test(item)),
    false,
  );
  assert.ok(result.blockers.some((item) => /professional validation/i.test(item)));
  assert.equal(result.blockers.some((item) => /operational-exercises/i.test(item)), false);
});

test("production final check consumes a fresh runtime source report and shows detail on failure", () => {
  const committed = JSON.parse(
    readFileSync(resolve(root, "reports/legal-source-health-v1.json"), "utf8"),
  );
  const directory = mkdtempSync(resolve(tmpdir(), "ross-final-check-"));
  const reportPath = resolve(directory, "runtime-source-report.json");
  const runtime = structuredClone(committed);
  const checkedAt = new Date().toISOString();
  runtime.observedAt = checkedAt;
  runtime.liveChecksPerformed = true;
  runtime.status = "healthy";
  for (const item of Object.values(runtime.providers)) {
    if (item.state === "disabled") continue;
    item.state = "healthy";
    item.checkedAt = checkedAt;
    item.lastSuccessfulAt = checkedAt;
    item.consecutiveFailures = 0;
    item.consecutiveSuccesses = 1;
  }
  writeFileSync(reportPath, `${JSON.stringify(runtime)}\n`);

  try {
    const passed = spawnSync(
      process.execPath,
      [
        resolve(root, "scripts/check-final-completion.mjs"),
        "--production",
        "--source-report",
        reportPath,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /PASS: production final-completion gate/);
    assert.match(passed.stdout, /Source report: .*runtime-source-report\.json/);

    runtime.status = "degraded";
    runtime.providers["ontario-elaws"].state = "degraded";
    runtime.providers["ontario-elaws"].reasonCode = "invalid-response";
    writeFileSync(reportPath, `${JSON.stringify(runtime)}\n`);
    const blocked = spawnSync(
      process.execPath,
      [
        resolve(root, "scripts/check-final-completion.mjs"),
        "--production",
        "--source-report",
        reportPath,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Source operations: ontario-elaws:/);
    assert.match(blocked.stderr, /Release readiness: Required legal-source health/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
