import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDir = resolve(root, ".github/workflows");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the workflow topology keeps one owner for each automation boundary", () => {
  const workflows = readdirSync(workflowDir).filter((name) => name.endsWith(".yml")).sort();
  assert.deepEqual(workflows, [
    "agent-pr-reconciler.yml",
    "baseline.yml",
    "coordinate-upstream-mike.yml",
    "deploy-private-ross.yml",
    "handle-baseline-result.yml",
    "refresh-release-manifest.yml",
    "staging-debug-release-train.yml",
    "sync-upstream-mike-escalated.yml",
    "sync-upstream-mike.yml",
    "verify-and-deploy-public-beta.yml",
    "verify-ontario-sources.yml",
  ]);

  for (const obsolete of [
    "apply-upstream-sync-batch-size.yml",
    "deploy-public-beta-ross.yml",
    "dispatch-escalated-mike-on-request.yml",
    "dispatch-unverified-agent-heads.yml",
    "final-controlled-beta-evidence.yml",
    "merge-verified-agent-pr.yml",
    "reconcile-verified-agent-merges.yml",
    "release-candidate.yml",
    "repair-failed-baseline.yml",
    "run-all-upstream-mike-synchronizers.yml",
  ]) {
    assert.equal(existsSync(resolve(workflowDir, obsolete)), false, obsolete);
  }
});

test("consolidated handlers preserve their bounded permissions and triggers", () => {
  const baseline = read(".github/workflows/baseline.yml");
  const handler = read(".github/workflows/handle-baseline-result.yml");
  const agent = read(".github/workflows/agent-pr-reconciler.yml");
  const mike = read(".github/workflows/coordinate-upstream-mike.yml");
  const lowRisk = read(".github/workflows/sync-upstream-mike.yml");
  const escalated = read(".github/workflows/sync-upstream-mike-escalated.yml");

  assert.match(baseline, /paths-ignore:[\s\S]*reports\/release-manifest-v1\.json/);
  assert.match(handler, /^  merge:[\s\S]*contents: write/m);
  assert.match(handler, /allow-bots: true/);
  assert.match(handler, /allow-bot-users: github-actions/);
  assert.match(agent, /cron: "0 0 \* \* \*"/);
  assert.doesNotMatch(agent, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(agent, /actions: write/);
  assert.match(agent, /github\.rest\.actions\.createWorkflowDispatch/);
  assert.match(agent, /github\.rest\.pulls\.merge/);
  assert.match(mike, /docs\/upstream-sync-request\.json/);
  assert.match(mike, /sync-upstream-mike\.yml/);
  assert.match(mike, /sync-upstream-mike-escalated\.yml/);
  assert.doesNotMatch(lowRisk, /docs\/upstream-sync-request\.json/);
  assert.match(lowRisk, /one implementation candidate per branch/);
  assert.match(escalated, /reconsider_all_deferred/);
  assert.match(escalated, /actions: write/);
});
