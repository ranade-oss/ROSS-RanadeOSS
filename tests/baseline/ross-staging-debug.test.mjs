import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, supabaseUrl: "prod-db" } }), /must not equal production/);
});

test("debug workflow is diagnostic, cleanup-safe, and cannot promote", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  assert.match(workflow, /Run complete repository gate/);
  assert.match(workflow, /Collect failure diagnostics[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Destroy all ephemeral staging resources[\s\S]*if: always\(\)/);
  assert.match(workflow, /Upload complete staging-debug evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /set -euo pipefail[\s\S]*fly-deploy-with-retry/);
  assert.match(workflow, /if flyctl deploy[\s\S]*unexpectedly succeeded/);
  assert.match(workflow, /expectedDeploymentFailureObserved/);
  assert.match(workflow, /releases rollback "\$baseline_version"/);
  assert.match(workflow, /run-staging-debug-probe\.mjs staging-debug/g);
  assert.match(workflow, /Provision ephemeral staging applications[\s\S]*for app in "\$API_APP" "\$WEB_APP" "\$WORKER_APP"/);
  assert.match(workflow, /Destroy all ephemeral staging resources[\s\S]*if: always\(\)[\s\S]*for app in "\$\{WORKER_APP:-\}" "\$\{API_APP:-\}" "\$\{WEB_APP:-\}"/);
  assert.match(workflow, /if ! flyctl status --app "\$app"[\s\S]*was not provisioned; nothing to destroy/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.doesNotMatch(workflow, /promote_public|fly-release-train\.mjs promote|environment: public-beta|ROSS_SUPABASE_SECRET_KEY|PROD_[A-Z_]+=/);
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
