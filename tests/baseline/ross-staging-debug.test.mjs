import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertIsolatedStaging, stagingDebugNames } from "../../scripts/lib/staging-debug.mjs";

test("staging debug names are run-scoped and reject production overlap", () => {
  const apps = stagingDebugNames("123", "2");
  assert.deepEqual(apps, { api: "ross-api-debug-123-2", web: "ross-web-debug-123-2", worker: "ross-worker-debug-123-2" });
  assert.throws(() => assertIsolatedStaging({ apps: { ...apps, api: "ross-ranadeoss-api" }, productionApps: ["ross-ranadeoss-api"], resources: { supabaseUrl: "s", storageEndpoint: "b" } }), /production|ephemeral/);
});

test("staging debug requires data resources isolated from production", () => {
  const productionApps = ["prod-api", "prod-web", "prod-worker"];
  const resources = { supabaseUrl: "stage-db", storageEndpoint: "stage-store", productionSupabaseUrl: "prod-db", productionStorageEndpoint: "prod-store" };
  assert.doesNotThrow(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources }));
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, productionSupabaseUrl: "" } }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, productionStorageEndpoint: "" } }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps: [], resources }), /production app comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, supabaseUrl: "prod-db" } }), /must not equal production/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, storageEndpoint: "prod-store" } }), /must not equal production/);
});

test("debug workflow is diagnostic, cleanup-safe, and cannot promote", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  assert.match(workflow, /Run complete repository gate/);
  assert.match(workflow, /Collect failure diagnostics[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Destroy all ephemeral staging resources[\s\S]*if: always\(\)/);
  assert.match(workflow, /Upload complete staging-debug evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /set -euo pipefail[\s\S]*fly-deploy-with-retry/);
  assert.match(workflow, /staging-debug-lifecycle\.sh inject-failure-and-rollback/);
  assert.match(workflow, /run-staging-debug-probe\.mjs staging-debug/g);
  assert.match(workflow, /Provision ephemeral staging applications[\s\S]*for app in "\$API_APP" "\$WEB_APP" "\$WORKER_APP"/);
  assert.match(workflow, /Destroy all ephemeral staging resources[\s\S]*if: always\(\)[\s\S]*staging-debug-lifecycle\.sh cleanup/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.doesNotMatch(workflow, /promote_public|fly-release-train\.mjs promote|environment: public-beta|ROSS_SUPABASE_SECRET_KEY|PROD_[A-Z_]+=/);
});

test("lifecycle observes a genuine nonzero deployment and rolls back", () => {
  const fixture = fakeFlyFixture();
  const result = runLifecycle(fixture, "inject-failure-and-rollback");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(readFileSync(join(fixture.artifacts, "diagnostics/forced-failure-result.json"), "utf8"));
  assert.deepEqual(evidence, { expectedDeploymentFailureObserved: true, exitCode: 42 });
  const calls = readFileSync(fixture.calls, "utf8");
  assert.match(calls, /"deploy"/);
  assert.match(calls, /"rollback","17"/);
});

test("cleanup succeeds after only one of three apps was provisioned", () => {
  const fixture = fakeFlyFixture("debug-worker");
  const result = runLifecycle(fixture, "cleanup");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = readFileSync(fixture.calls, "utf8");
  assert.match(calls, /"destroy","debug-worker"/);
  assert.doesNotMatch(calls, /"destroy","debug-api"|"destroy","debug-web"/);
});

test("staging uses the exact complete release-train integration probe", () => {
  const runner = readFileSync(new URL("../../scripts/run-staging-debug-probe.mjs", import.meta.url), "utf8");
  assert.match(runner, /import \{ deployedReleaseTrainProbe \}/);
  assert.match(runner, /"true",\n\];/);
  assert.match(runner, /apps\.worker/);
  assert.match(runner, /apps\.api/);
  assert.match(runner, /apps\.web/);
});

test("image builds accept explicit isolated namespaces without production aliases", () => {
  const build = readFileSync(new URL("../../scripts/build-release-train-images.sh", import.meta.url), "utf8");
  assert.match(build, /RELEASE_IMAGE_API_APP/);
  assert.match(build, /RELEASE_RUNTIME_WEB_APP/);
  assert.match(build, /RELEASE_SIGNUPS_ENABLED/);
});

test("release manifest governs every staging-debug and shared-probe change", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../config/release-manifest.v1.json", import.meta.url), "utf8"));
  for (const path of [
    ".github/workflows/staging-debug-release-train.yml",
    "docs/staging-debug-release-train.md",
    "scripts/build-release-train-images.sh",
    "scripts/fly-release-train.mjs",
    "scripts/lib/release-train-probe.mjs",
    "scripts/lib/staging-debug.mjs",
    "scripts/run-staging-debug-probe.mjs",
    "scripts/staging-debug-lifecycle.sh",
    "scripts/validate-staging-debug.mjs",
    "tests/baseline/ross-release-train.test.mjs",
    "tests/baseline/ross-staging-debug.test.mjs",
  ]) {
    assert.ok(manifest.artifacts.includes(path), `${path} must be governed`);
  }
});

function fakeFlyFixture(existingApps = "debug-web") {
  const directory = mkdtempSync(join(tmpdir(), "ross-staging-debug-"));
  const bin = join(directory, "bin");
  const artifacts = join(directory, "artifacts");
  const calls = join(directory, "calls.jsonl");
  mkdirSync(bin);
  const fake = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_FLY_CALLS, JSON.stringify(args) + "\\n");
const app = args[args.indexOf("--app") + 1];
const existing = new Set((process.env.FAKE_EXISTING_APPS || "").split(",").filter(Boolean));
if (args[0] === "status") process.exit(existing.has(app) ? 0 : 1);
if (args[0] === "apps" && args[1] === "destroy") process.exit(0);
if (args[0] === "deploy") process.exit(42);
if (args[0] === "logs") process.exit(0);
if (args[0] === "releases" && args[1] === "rollback") process.exit(0);
if (args[0] === "releases") { process.stdout.write('[{"Version":17}]'); process.exit(0); }
process.exit(2);
`;
  writeFileSync(join(bin, "flyctl"), fake);
  chmodSync(join(bin, "flyctl"), 0o755);
  return { directory, artifacts, calls, bin, existingApps };
}

function runLifecycle(fixture, command) {
  return spawnSync("bash", [new URL("../../scripts/staging-debug-lifecycle.sh", import.meta.url).pathname, command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      FAKE_FLY_CALLS: fixture.calls,
      FAKE_EXISTING_APPS: fixture.existingApps,
      ROSS_STAGING_DEBUG_ARTIFACT_DIR: fixture.artifacts,
      API_APP: "debug-api",
      WEB_APP: "debug-web",
      WORKER_APP: "debug-worker",
      CANDIDATE_WEB_IMAGE: `registry.fly.io/debug-web@sha256:${"a".repeat(64)}`,
    },
  });
}
