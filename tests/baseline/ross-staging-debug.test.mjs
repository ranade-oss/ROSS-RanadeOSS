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
  assert.doesNotThrow(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), resources: { supabaseUrl: "stage-db", storageEndpoint: "stage-store" } }));
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), resources: { supabaseUrl: "same", productionSupabaseUrl: "same", storageEndpoint: "stage", productionStorageEndpoint: "prod" } }), /must not equal production/);
});

test("debug workflow is diagnostic, cleanup-safe, and cannot promote", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  assert.match(workflow, /Run complete repository gate/);
  assert.match(workflow, /Collect failure diagnostics[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Destroy all ephemeral staging resources[\s\S]*if: always\(\)/);
  assert.match(workflow, /Upload complete staging-debug evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /set -euo pipefail[\s\S]*fly-deploy-with-retry/);
  assert.match(workflow, /releases rollback "\$baseline_version"/);
  assert.match(workflow, /forced-debug-failure[\s\S]*web-rollback-probe/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.doesNotMatch(workflow, /promote_public|fly-release-train\.mjs promote|environment: public-beta|ROSS_SUPABASE_SECRET_KEY|PROD_[A-Z_]+=/);
});

test("image builds accept explicit isolated namespaces without production aliases", () => {
  const build = readFileSync(new URL("../../scripts/build-release-train-images.sh", import.meta.url), "utf8");
  assert.match(build, /RELEASE_IMAGE_API_APP/);
  assert.match(build, /RELEASE_RUNTIME_WEB_APP/);
  assert.match(build, /RELEASE_SIGNUPS_ENABLED/);
});
