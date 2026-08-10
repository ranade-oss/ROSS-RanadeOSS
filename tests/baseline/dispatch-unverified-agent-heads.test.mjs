import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(
  resolve(root, ".github/workflows/agent-pr-reconciler.yml"),
  "utf8",
);
const gates = readFileSync(
  resolve(root, "scripts/github/exact-head-pr-gates.cjs"),
  "utf8",
);

test("the daily agent reconciler preserves exact-head dispatch and merge gates", () => {
  assert.match(workflow, /cron: "0 0 \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /run\.head_sha === pr\.head\.sha/);
  assert.match(workflow, /run\.status === "completed"/);
  assert.match(workflow, /run\.conclusion === "action_required"/);
  assert.match(
    workflow,
    /!\(\s*run\.status === "completed" &&\s*run\.conclusion === "action_required"\s*\)/,
  );
  assert.match(workflow, /github\.rest\.actions\.createWorkflowDispatch/);
  assert.match(workflow, /github\.rest\.pulls\.merge/);
  assert.match(workflow, /scripts\/github\/exact-head-pr-gates\.cjs/);
  assert.match(gates, /reviewDecision === "CHANGES_REQUESTED"/);
  assert.match(gates, /node\.mergeable !== "MERGEABLE"/);
  assert.match(gates, /node\.headRefOid !== expectedHead/);
});
