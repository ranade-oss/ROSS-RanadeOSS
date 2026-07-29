import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("bulk Mike synchronization is bounded, independently reviewed, and exact-head published", () => {
  const workflow = read(".github/workflows/synchronize-mike-upstream.yml");
  const state = JSON.parse(read("upstream-sync/state.json"));

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Open-Legal-Products\/mike/);
  assert.match(workflow, /rev-list", "--first-parent", "--reverse"/);
  assert.match(workflow, /merge-base", "--is-ancestor"/);
  assert.match(workflow, /100-commit safety ceiling/);

  assert.equal(
    (workflow.match(/openai\/codex-action@dd78cb653811af44014baa08fe954e28d32c1bf9/g) || []).length,
    2,
  );
  assert.equal(
    (workflow.match(/permission-profile: ":read-only"/g) || []).length,
    2,
  );
  assert.equal(
    (workflow.match(/safety-strategy: drop-sudo/g) || []).length,
    2,
  );

  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /actions\/download-artifact@v7/);
  assert.match(workflow, /Run complete engineering gate/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /current_base="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /test "\$current_base" = "\$EXPECTED_BASE"/);
  assert.match(workflow, /agent\/upstream-bulk-/);

  for (const protectedTerm of [
    "authentication",
    "authorization",
    "security",
    "migration",
    "schema",
    "database",
    "provider",
    "connector",
    "deployment",
    "release",
  ]) {
    assert.match(workflow.toLowerCase(), new RegExp(protectedTerm));
  }

  assert.equal(state.upstream_repository, "Open-Legal-Products/mike");
  assert.equal(state.upstream_branch, "main");
  assert.equal(state.mode, "bounded-bulk-low-risk");
  assert.match(state.last_scanned_sha, /^[0-9a-f]{40}$/);
});
