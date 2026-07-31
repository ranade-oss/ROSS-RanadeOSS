import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(
  resolve(root, ".github/workflows/dispatch-unverified-agent-heads.yml"),
  "utf8",
);

test("approval-blocked pull-request runs do not suppress exact-head dispatch", () => {
  assert.match(workflow, /run\.head_sha === pr\.head\.sha/);
  assert.match(workflow, /run\.status === "completed"/);
  assert.match(workflow, /run\.conclusion === "action_required"/);
  assert.match(
    workflow,
    /!\(\s*run\.status === "completed" &&\s*run\.conclusion === "action_required"\s*\)/,
  );
  assert.match(workflow, /github\.rest\.actions\.createWorkflowDispatch/);
});
