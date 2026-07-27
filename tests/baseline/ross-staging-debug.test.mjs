import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertIsolatedStaging, normalizeResourceUrl, stagingDebugNames } from "../../scripts/lib/staging-debug.mjs";
import { preflightS3, preflightSupabase, validateSupabaseKeys } from "../../scripts/staging-debug-preflight.mjs";

test("staging debug names are run-scoped and reject production overlap", () => {
  const apps = stagingDebugNames("123", "2");
  assert.deepEqual(apps, { api: "ross-api-debug-123-2", web: "ross-web-debug-123-2", worker: "ross-worker-debug-123-2" });
  assert.throws(() => assertIsolatedStaging({ apps: { ...apps, api: "ross-ranadeoss-api" }, productionApps: ["ross-ranadeoss-api"], stagingOrg: "stage", productionOrg: "prod", resources: { supabaseUrl: "s", storageEndpoint: "b" } }), /production|ephemeral/);
});

test("staging debug requires data resources isolated from production", () => {
  const productionApps = ["prod-api", "prod-web", "prod-worker"];
  const stagingOrg = "ross-stage";
  const productionOrg = "ross-prod";
  const resources = { supabaseUrl: "https://stage-db.example", storageEndpoint: "https://stage-store.example", productionSupabaseUrl: "https://prod-db.example", productionStorageEndpoint: "https://prod-store.example" };
  assert.doesNotThrow(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg, resources }));
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg, resources: { ...resources, productionSupabaseUrl: "" } }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg, resources: { ...resources, productionStorageEndpoint: "" } }), /Missing production comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps: [], stagingOrg, productionOrg, resources }), /production app comparison/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg, resources: { ...resources, supabaseUrl: "https://prod-db.example/" } }), /must not equal production/);
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg, resources: { ...resources, storageEndpoint: "https://prod-store.example/" } }), /must not equal production/);
  assert.equal(normalizeResourceUrl("https://EXAMPLE.test/path///", "fixture"), "https://example.test/path");
  assert.throws(() => assertIsolatedStaging({ apps: stagingDebugNames("1"), productionApps, stagingOrg, productionOrg: stagingOrg, resources }), /must not equal the production organization/);
});

test("debug workflow is diagnostic, cleanup-safe, and cannot promote", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  assert.match(workflow, /Run complete repository gate/);
  assert.match(workflow, /Collect failure diagnostics[\s\S]*if: failure\(\)/);
  assert.match(workflow, /Independent cleanup and final evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /Upload complete staging-debug evidence[\s\S]*if: always\(\)/);
  assert.match(workflow, /set -euo pipefail[\s\S]*fly-deploy-with-retry/);
  assert.match(workflow, /staging-debug-lifecycle\.sh inject-failure-and-rollback/);
  assert.match(workflow, /run-staging-debug-probe\.mjs rehearsal/g);
  assert.match(workflow, /ROSS_RUNTIME_ENVIRONMENT=rehearsal/);
  assert.match(workflow, /group: ross-staging-debug$/m);
  assert.match(workflow, /Read-only staging dependency preflights/);
  assert.match(workflow, /Provision ephemeral staging applications[\s\S]*for app in "\$API_APP" "\$WEB_APP" "\$WORKER_APP"/);
  assert.match(workflow, /cleanup:[\s\S]*needs: debug[\s\S]*staging-debug-lifecycle\.sh cleanup/);
  assert.match(workflow, /STAGING_SUPABASE_URL/);
  assert.doesNotMatch(workflow, /promote_public|fly-release-train\.mjs promote|environment: public-beta|ROSS_SUPABASE_SECRET_KEY|PROD_[A-Z_]+=/);
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
  assert.deepEqual(evidence, { outcome: "expected-failure", cause: "fly-health-check", exitCode: 42 });
  const calls = readFileSync(fixture.calls, "utf8");
  assert.match(calls, /"deploy"/);
  assert.doesNotMatch(calls, /"releases","rollback"/);
  assert.match(calls, /"deploy",".","--config","deploy\/fly\/rehearsal-frontend\.toml"/);
  assert.equal(readFileSync(join(fixture.artifacts, "diagnostics/web-restored-image.txt"), "utf8").trim(), fixture.image);
});

test("lifecycle rejects authentication failures masquerading as the injected health-check failure", () => {
  const fixture = fakeFlyFixture("debug-web", "", "Error: authentication unauthorized");
  const result = runLifecycle(fixture, "inject-failure-and-rollback");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not the expected health check/);
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

test("staging runtime uses an environment accepted by the actual frontend contract", () => {
  const server = readFileSync(new URL("../../frontend/src/app/lib/runtimeConfig.server.ts", import.meta.url), "utf8");
  const accepted = [...server.matchAll(/value === "([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(accepted, ["development", "rehearsal", "public-beta"]);
  const workflow = readFileSync(new URL("../../.github/workflows/staging-debug-release-train.yml", import.meta.url), "utf8");
  for (const value of [...workflow.matchAll(/(?:ROSS_RUNTIME_ENVIRONMENT=|run-staging-debug-probe\.mjs )([a-z-]+)/g)].map((match) => match[1])) {
    assert.ok(accepted.includes(value), `${value} must be accepted by the frontend`);
    assert.equal(value, "rehearsal");
  }
});

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.x`;
test("Supabase preflight sends opaque keys only as apikey headers and performs read-only schema/column checks", async () => {
  const calls = [];
  await preflightSupabase({ url: "https://stage.supabase.co", publishableKey: "sb_publishable_test", secretKey: "sb_secret_test", fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response("[]", { status: 200 });
  }});
  assert.deepEqual(calls.map(({ init }) => init.method), ["GET", "GET"]);
  assert.equal(calls[0].init.headers.apikey, "sb_publishable_test");
  assert.equal(calls[1].init.headers.apikey, "sb_secret_test");
  assert.ok(calls.every(({ init }) => !("Authorization" in init.headers)));
  assert.match(calls[1].url, /user_profiles\?select=id&limit=0/);
  assert.equal(calls[1].init.headers["Accept-Profile"], "public");
});

test("Supabase preflight supports only explicitly role-validated legacy JWTs and fails closed", async () => {
  assert.deepEqual(validateSupabaseKeys(jwt("anon"), jwt("service_role")), { kind: "legacy-jwt" });
  assert.throws(() => validateSupabaseKeys("sb_publishable_x", jwt("service_role")), /sb_secret_/);
  assert.throws(() => validateSupabaseKeys(jwt("authenticated"), jwt("service_role")), /role anon/);
  assert.throws(() => validateSupabaseKeys(jwt("anon"), jwt("anon")), /role service_role/);
  await assert.rejects(() => preflightSupabase({ url: "https://stage.supabase.co", publishableKey: "sb_publishable_x", secretKey: "sb_secret_x", fetchImpl: async () => new Response("bad key", { status: 401 }) }), /publishable-key preflight failed/);
  let call = 0;
  await assert.rejects(() => preflightSupabase({ url: "https://stage.supabase.co", publishableKey: "sb_publishable_x", secretKey: "sb_secret_x", fetchImpl: async () => new Response(++call === 1 ? "ok" : "missing column", { status: call === 1 ? 200 : 400 }) }), /schema preflight failed/);
});

test("S3 preflight signs a read-only HEAD bucket request and fails closed", async () => {
  const calls = [];
  const values = { endpoint: "https://s3.example.test", region: "auto", accessKeyId: "access", secretAccessKey: "secret", bucket: "ross-stage", now: new Date("2026-07-27T00:00:00Z") };
  await preflightS3({ ...values, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 200 }); } });
  assert.equal(calls[0].init.method, "HEAD");
  assert.equal(calls[0].url, "https://s3.example.test/ross-stage");
  assert.match(calls[0].init.headers.Authorization, /^AWS4-HMAC-SHA256 /);
  await assert.rejects(() => preflightS3({ ...values, fetchImpl: async () => new Response(null, { status: 404 }) }), /S3 bucket ross-stage read-only preflight failed/);
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
    "scripts/staging-debug-preflight.mjs",
    "scripts/staging-debug-lifecycle.sh",
    "scripts/validate-staging-debug.mjs",
    "tests/baseline/ross-release-train.test.mjs",
    "tests/baseline/ross-staging-debug.test.mjs",
  ]) {
    assert.ok(manifest.artifacts.includes(path), `${path} must be governed`);
  }
});

function fakeFlyFixture(existingApps = "debug-web", destroyErrorApp = "", forcedFailureMessage = "Fly health check failed: machine is unhealthy") {
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
if (args[0] === "deploy") { if (args.some((arg) => arg.endsWith("staging-debug-forced-failure.toml"))) { process.stderr.write(process.env.FAKE_FORCED_FAILURE_MESSAGE); process.exit(42); } process.exit(0); }
if (args[0] === "logs") process.exit(0);
if (args[0] === "image" && args[1] === "show") { process.stdout.write(JSON.stringify({ Registry: "registry.fly.io", Repository: "debug-web", Digest: "sha256:${"a".repeat(64)}" })); process.exit(0); }
process.exit(2);
`;
  writeFileSync(join(bin, "flyctl"), fake);
  chmodSync(join(bin, "flyctl"), 0o755);
  return { directory, artifacts, calls, bin, existingApps, destroyErrorApp, forcedFailureMessage, image };
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
      FAKE_FORCED_FAILURE_MESSAGE: fixture.forcedFailureMessage,
      ROSS_STAGING_DEBUG_ARTIFACT_DIR: fixture.artifacts,
      API_APP: "debug-api",
      WEB_APP: "debug-web",
      WORKER_APP: "debug-worker",
      CANDIDATE_WEB_IMAGE: fixture.image,
    },
  });
}
