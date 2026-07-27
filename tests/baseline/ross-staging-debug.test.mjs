import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertIsolatedStaging, normalizeResourceUrl, stagingDebugNames } from "../../scripts/lib/staging-debug.mjs";
import { runStagingDebugPreflight, supabaseKeyHeaders } from "../../backend/scripts/lib/staging-debug-preflight.mjs";

test("staging debug names are run-scoped and reject production overlap", () => {
  const apps = stagingDebugNames("123", "2");
  assert.deepEqual(apps, { api: "ross-api-debug-123-2", web: "ross-web-debug-123-2", worker: "ross-worker-debug-123-2" });
  assert.throws(() => assertIsolatedStaging({ apps: { ...apps, api: "ross-ranadeoss-api" }, productionApps: ["ross-ranadeoss-api"], resources: { supabaseUrl: "s", storageEndpoint: "b" } }), /production|ephemeral/);
});

test("staging debug requires data resources isolated from production", () => {
  const productionApps = ["prod-api", "prod-web", "prod-worker"];
  const organizations = { staging: "ross-staging", production: "ross-production" };
  const resources = { supabaseUrl: "https://stage-db.example", storageEndpoint: "https://stage-store.example", productionSupabaseUrl: "https://prod-db.example", productionStorageEndpoint: "https://prod-store.example" };
  assert.doesNotThrow(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources, organizations }));
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, productionSupabaseUrl: "" }, organizations }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, productionStorageEndpoint: "" }, organizations }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps: [], resources, organizations }), /production app comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, supabaseUrl: "https://prod-db.example/" }, organizations }), /must not equal production/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources: { ...resources, storageEndpoint: "https://prod-store.example/" }, organizations }), /must not equal production/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources, organizations: { staging: "personal", production: "PERSONAL" } }), /separate from production/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, resources, organizations: { staging: "", production: "prod" } }), /organization identifiers are required/);
  assert.equal(normalizeResourceUrl("https://EXAMPLE.test/path///", "fixture"), "https://example.test/path");
});

test("debug workflow is diagnostic, cleanup-safe, and cannot promote", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  assert.match(workflow, /Run complete repository gate/);
  assert.match(workflow, /Collect failure diagnostics[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Defensive in-job cleanup[\s\S]*if: always\(\)/);
  assert.match(workflow, /Upload staging-debug diagnostic evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /set -euo pipefail[\s\S]*fly-deploy-with-retry/);
  assert.match(workflow, /staging-debug-lifecycle\.sh inject-failure-and-rollback/);
  assert.equal((workflow.match(/run-staging-debug-probe\.mjs rehearsal/g) ?? []).length, 2);
  assert.match(workflow, /ROSS_RUNTIME_ENVIRONMENT=rehearsal/);
  assert.doesNotMatch(workflow, /ROSS_RUNTIME_ENVIRONMENT=staging-debug|run-staging-debug-probe\.mjs staging-debug/);
  assert.match(workflow, /Provision ephemeral staging applications[\s\S]*for app in "\$API_APP" "\$WEB_APP" "\$WORKER_APP"/);
  assert.match(workflow, /Defensive in-job cleanup[\s\S]*if: always\(\)[\s\S]*staging-debug-lifecycle\.sh cleanup/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.doesNotMatch(workflow, /promote_public|fly-release-train\.mjs promote|environment: public-beta|ROSS_SUPABASE_SECRET_KEY|PROD_[A-Z_]+=/);
  assert.match(workflow, /group: ross-staging-debug\n/);
  assert.match(workflow, /Verify Fly token cannot access production organization[\s\S]*verify-staging-fly-token\.mjs/);
  assert.match(workflow, /Preflight read-only staging data resources[\s\S]*staging-debug-preflight\.mjs/);
  assert.match(workflow, /Smoke exact candidate frontend image[\s\S]*staging-debug-frontend-smoke\.sh/);
  assert.match(workflow, /cleanup:[\s\S]*needs: debug[\s\S]*if: always\(\)[\s\S]*print-staging-debug-names\.mjs/);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf("\n  cleanup:")), /result\.json/);
  const preflight = workflow.indexOf("name: Preflight read-only staging data resources");
  assert.ok(preflight < workflow.indexOf("name: Provision ephemeral staging applications"));
  assert.ok(preflight < workflow.indexOf("name: Build candidate images"));
});

test("workflow runtime values come from the frontend acceptance contract", () => {
  const application = readFileSync(new URL("../../frontend/src/app/lib/runtimeConfig.server.ts", import.meta.url), "utf8");
  const acceptedBlock = application.match(/ROSS_RUNTIME_ENVIRONMENTS = \[([\s\S]*?)\] as const/)?.[1];
  assert.ok(acceptedBlock, "frontend runtime environment contract must be extractable");
  const accepted = new Set([...acceptedBlock.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]));
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  const supplied = [...workflow.matchAll(/ROSS_RUNTIME_ENVIRONMENT=([a-z-]+)/g)].map((match) => match[1]);
  assert.ok(supplied.length > 0);
  for (const value of supplied) assert.ok(accepted.has(value), `${value} is not accepted by the frontend`);
});

test("lifecycle observes a genuine nonzero deployment and rolls back", () => {
  const lifecycle = readFileSync(new URL("../../scripts/staging-debug-lifecycle.sh", import.meta.url), "utf8");
  assert.doesNotMatch(lifecycle, /flyctl releases rollback/);
  assert.match(lifecycle, /release-train-image-ref\.mjs current/);
  assert.match(lifecycle, /fly-deploy-with-retry\.sh[\s\S]*--image "\$baseline_image"/);
  assert.match(lifecycle, /release-train-image-ref\.mjs verify/);
  const fixture = fakeFlyFixture();
  const result = runLifecycle(fixture, "inject-failure-and-rollback");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(readFileSync(join(fixture.artifacts, "diagnostics/forced-failure-result.json"), "utf8"));
  assert.deepEqual(evidence, { expectedDeploymentFailureObserved: true, exitCode: 42 });
  const calls = readFileSync(fixture.calls, "utf8");
  assert.match(calls, /"deploy"/);
  assert.doesNotMatch(calls, /"releases","rollback"/);
  assert.match(calls, /"deploy",".","--config","deploy\/fly\/rehearsal-frontend\.toml"/);
  assert.equal(readFileSync(join(fixture.artifacts, "diagnostics/web-restored-image.txt"), "utf8").trim(), fixture.image);
});

test("cleanup succeeds after only one of three apps was provisioned", () => {
  const fixture = fakeFlyFixture("debug-worker");
  const result = runLifecycle(fixture, "cleanup");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = readFileSync(fixture.calls, "utf8");
  assert.match(calls, /"destroy","debug-worker"/);
  assert.match(calls, /"destroy","debug-api"/);
  assert.match(calls, /"destroy","debug-web"/);
  assert.match(readFileSync(join(fixture.artifacts, "commands/cleanup-debug-api.log"), "utf8"), /not provisioned/);
});

test("cleanup fails on non-not-found Fly errors instead of leaking apps", () => {
  const fixture = fakeFlyFixture("debug-worker", "debug-api");
  const result = runLifecycle(fixture, "cleanup");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Failed to destroy debug-api/);
});

test("failure injection rejects unrelated nonzero Fly errors", () => {
  const fixture = fakeFlyFixture("debug-web", "", "permission denied");
  const result = runLifecycle(fixture, "inject-failure-and-rollback");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected reason/);
  assert.doesNotMatch(readFileSync(fixture.calls, "utf8"), /rehearsal-frontend\.toml/);
});

test("image smoke and external preflight are read-only fail-closed contracts", () => {
  const smoke = readFileSync(new URL("../../scripts/staging-debug-frontend-smoke.sh", import.meta.url), "utf8");
  assert.match(smoke, /trap cleanup EXIT INT TERM/);
  assert.match(smoke, /docker run[\s\S]*ROSS_RUNTIME_ENVIRONMENT=rehearsal/);
  assert.match(smoke, /\/login/);
  assert.match(smoke, /\/api\/runtime-config/);
  const preflight = readFileSync(new URL("../../backend/scripts/lib/staging-debug-preflight.mjs", import.meta.url), "utf8");
  assert.match(preflight, /Supabase publishable key validation/);
  assert.match(preflight, /Supabase secret key validation/);
  assert.match(preflight, /document_scan_jobs/);
  assert.match(preflight, /HeadBucketCommand/);
  assert.doesNotMatch(preflight, /PutObject|insert\(|update\(|delete\(/);
});

test("opaque Supabase keys use apikey only and preflight never writes", async () => {
  const requests = [];
  const s3Commands = [];
  const result = await runStagingDebugPreflight({
    environment: preflightEnvironment(),
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, status: 200 };
    },
    createS3Client: () => ({ send: async (command) => s3Commands.push(command) }),
  });
  assert.equal(result.bucket, "ross-staging-debug");
  assert.equal(requests[0].headers.apikey, "sb_publishable_fixture");
  assert.equal(requests[1].headers.apikey, "sb_secret_fixture");
  assert.ok(requests.every(({ headers }) => headers.Authorization === undefined));
  assert.ok(requests.every(({ method = "GET" }) => method === "GET" || method === "HEAD"));
  assert.equal(s3Commands.length, 1);
  const legacy = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
  assert.deepEqual(supabaseKeyHeaders(legacy, "legacy", { legacyRole: "anon" }), { apikey: legacy, Authorization: `Bearer ${legacy}` });
  assert.throws(() => supabaseKeyHeaders(legacy, "secret", { legacyRole: "service_role" }), /role service_role/);
});

test("every external preflight dependency fails closed", async () => {
  for (const [label, failure] of [
    ["publishable", { request: 0 }],
    ["secret", { request: 1 }],
    ["schema", { request: 2 }],
    ["S3", { s3: true }],
  ]) {
    let requestIndex = 0;
    await assert.rejects(
      runStagingDebugPreflight({
        environment: preflightEnvironment(),
        fetchImpl: async () => {
          const failed = requestIndex++ === failure.request;
          return { ok: !failed, status: failed ? 403 : 200 };
        },
        createS3Client: () => ({ send: async () => { if (failure.s3) throw new Error("denied"); } }),
      }),
      label === "S3" ? /bucket validation failed/ : /failed with HTTP 403/,
      `${label} failure must reject preflight`,
    );
  }
});

test("staging Fly token must not have production organization authority", () => {
  assert.equal(runFlyTokenCheck([{ slug: "ross-staging" }]).status, 0);
  const unsafe = runFlyTokenCheck([{ slug: "ross-staging" }, { slug: "ross-production" }]);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /authority over production organization/);
});

test("staging uses the exact complete release-train integration probe", () => {
  const runner = readFileSync(new URL("../../scripts/run-staging-debug-probe.mjs", import.meta.url), "utf8");
  assert.match(runner, /import \{ deployedReleaseTrainProbe \}/);
  assert.match(runner, /process\.argv\[2\] \?\? "rehearsal"/);
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
    "scripts/print-staging-debug-names.mjs",
    "scripts/staging-debug-frontend-smoke.sh",
    "scripts/staging-debug-lifecycle.sh",
    "scripts/validate-staging-debug.mjs",
    "scripts/verify-staging-fly-token.mjs",
    "tests/baseline/ross-release-train.test.mjs",
    "tests/baseline/ross-staging-debug.test.mjs",
    "backend/scripts/staging-debug-preflight.mjs",
    "backend/scripts/lib/staging-debug-preflight.mjs",
    "frontend/src/app/lib/runtimeConfig.server.ts",
  ]) {
    assert.ok(manifest.artifacts.includes(path), `${path} must be governed`);
  }
});

function fakeFlyFixture(existingApps = "debug-web", destroyErrorApp = "", deployError = "health check failed: service is not listening") {
  const directory = mkdtempSync(join(tmpdir(), "ross-staging-debug-"));
  const bin = join(directory, "bin");
  const artifacts = join(directory, "artifacts");
  const calls = join(directory, "calls.jsonl");
  mkdirSync(bin);
  const image = `registry.fly.io/debug-web@sha256:${"a".repeat(64)}`;
  const fake = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_FLY_CALLS, JSON.stringify(args) + "\\n");
const app = args[args.indexOf("--app") + 1];
const existing = new Set((process.env.FAKE_EXISTING_APPS || "").split(",").filter(Boolean));
if (args[0] === "apps" && args[1] === "destroy") {
  const target = args[2];
  if (target === process.env.FAKE_DESTROY_ERROR_APP) { process.stderr.write("temporary Fly API timeout"); process.exit(29); }
  if (!existing.has(target)) { process.stderr.write("Could not find App"); process.exit(1); }
  process.exit(0);
}
if (args[0] === "deploy" && args.some((arg) => arg.endsWith("staging-debug-forced-failure.toml"))) { process.stderr.write(process.env.FAKE_DEPLOY_ERROR); process.exit(42); }
if (args[0] === "deploy") process.exit(0);
if (args[0] === "logs") process.exit(0);
if (args[0] === "image" && args[1] === "show") { process.stdout.write(JSON.stringify({ Registry: "registry.fly.io", Repository: "debug-web", Digest: "sha256:${"a".repeat(64)}" })); process.exit(0); }
process.exit(2);
`;
  writeFileSync(join(bin, "flyctl"), fake);
  chmodSync(join(bin, "flyctl"), 0o755);
  return { directory, artifacts, calls, bin, existingApps, destroyErrorApp, deployError, image };
}

function runLifecycle(fixture, command) {
  return spawnSync("bash", [new URL("../../scripts/staging-debug-lifecycle.sh", import.meta.url).pathname, command], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      FAKE_FLY_CALLS: fixture.calls,
      FAKE_EXISTING_APPS: fixture.existingApps,
      FAKE_DESTROY_ERROR_APP: fixture.destroyErrorApp,
      FAKE_DEPLOY_ERROR: fixture.deployError,
      ROSS_STAGING_DEBUG_ARTIFACT_DIR: fixture.artifacts,
      API_APP: "debug-api",
      WEB_APP: "debug-web",
      WORKER_APP: "debug-worker",
      CANDIDATE_WEB_IMAGE: fixture.image,
    },
  });
}

function runFlyTokenCheck(payload) {
  const directory = mkdtempSync(join(tmpdir(), "ross-fly-token-"));
  const flyctl = join(directory, "flyctl");
  writeFileSync(flyctl, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(payload))});\n`);
  chmodSync(flyctl, 0o755);
  return spawnSync(process.execPath, [new URL("../../scripts/verify-staging-fly-token.mjs", import.meta.url).pathname], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      FLY_ORG: "ross-staging",
      ROSS_PRODUCTION_FLY_ORG: "ross-production",
    },
  });
}

function preflightEnvironment() {
  return {
    ROSS_STAGING_SUPABASE_URL: "https://staging.supabase.example/",
    ROSS_STAGING_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    ROSS_STAGING_SUPABASE_SECRET_KEY: "sb_secret_fixture",
    ROSS_STAGING_S3_ENDPOINT_URL: "https://staging-storage.example",
    ROSS_STAGING_S3_REGION: "auto",
    ROSS_STAGING_S3_ACCESS_KEY_ID: "fixture-access",
    ROSS_STAGING_S3_SECRET_ACCESS_KEY: "fixture-secret",
  };
}
