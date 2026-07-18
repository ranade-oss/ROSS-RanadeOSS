import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));

test("production records preserve completed approvals and remain blocked on missing evidence", () => {
  const approvals = json("config/release-approvals.v1.json");
  const operations = json("config/operations-readiness.v1.json");
  const launch = json("config/launch-readiness.v1.json");
  assert.match(approvals.status, /^blocked-/);
  assert.match(operations.status, /^blocked-/);
  assert.match(launch.status, /^blocked-/);

  for (const name of ["legalContent", "security", "accessibility", "productOwner"]) {
    const item = approvals.approvals[name];
    assert.equal(item.status, "approved");
    assert.ok(item.approver);
    assert.equal(item.date, "2026-07-18");
    assert.match(item.evidence, /controlled-beta-owner-approval-2026-07-18\.md/);
  }
  assert.equal(approvals.approvals.privacy.status, "pending");

  for (const name of ["accountableOwners", "goLiveDecision"]) {
    const item = launch.decisions[name];
    assert.equal(item.status, "approved");
    assert.equal(item.approver, "AR");
    assert.equal(item.date, "2026-07-18");
  }

  for (const item of Object.values(operations.evidence)) {
    assert.equal(item.status, "pending");
    assert.equal(item.approver, null);
    assert.equal(item.evidence, null);
  }

  for (const [name, item] of Object.entries(launch.decisions)) {
    if (["accountableOwners", "goLiveDecision"].includes(name)) continue;
    assert.equal(item.status, "pending");
    assert.equal(item.approver, null);
    assert.equal(item.evidence, null);
  }
});

test("release manifest governs code, schema, evaluation, sources, workflows, and approvals", () => {
  const manifest = json("reports/release-manifest-v1.json");
  const paths = new Set(manifest.artifacts.map((item) => item.path));
  for (const path of [
    "backend/schema.sql",
    "config/legal-source-operations.v1.json",
    "config/launch-readiness.v1.json",
    "config/operations-readiness.v1.json",
    "config/release-approvals.v1.json",
    "reports/legal-source-health-v1.json",
    "reports/ontario-evaluation-v1.json",
    "workflows/ontario/catalogue.json",
  ])
    assert.equal(paths.has(path), true, path);
  assert.equal(manifest.algorithm, "sha256");
  assert.equal(manifest.artifactCount, manifest.artifacts.length);
});

test("release candidate workflow creates evidence but never deploys", () => {
  const workflow = read(".github/workflows/release-candidate.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.doesNotMatch(workflow, /\bdeploy(?:ment)?\s*:/i);
  assert.doesNotMatch(workflow, /wrangler deploy|kubectl|helm upgrade/i);
});

test("production operations are documented without expanding the beta data boundary", () => {
  for (const path of [
    "docs/operations/release-runbook.md",
    "docs/operations/backup-restore.md",
    "docs/operations/rollback.md",
    "docs/operations/legal-source-operations.md",
    "docs/operations/observability.md",
    "docs/operations/launch-checklist.md",
    "SECURITY.md",
  ])
    assert.ok(read(path).length > 300, path);
  assert.match(read("docs/operations/launch-checklist.md"), /synthetic\/non-confidential/);
  assert.match(read("docs/operations/legal-source-operations.md"), /never authorizes scraping/i);
});
