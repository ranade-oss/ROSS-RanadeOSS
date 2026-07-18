import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("private deployment is manual, Toronto-hosted, and owner-only", () => {
  const workflow = read(".github/workflows/deploy-private-ross.yml");
  const api = read("deploy/fly/api.toml");
  const frontend = read("deploy/fly/frontend.toml");
  const worker = read("deploy/fly/file-worker.toml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=false/);
  assert.match(workflow, /ROSS_HOSTED_MODE=controlled-beta/);
  assert.match(workflow, /R2_BUCKET_NAME=ross-private-files/);
  assert.match(workflow, /ROSS_UPLOAD_SCAN_REQUIRED=true/);
  assert.match(workflow, /--flycast/);
  assert.match(api, /primary_region = "yyz"/);
  assert.match(frontend, /primary_region = "yyz"/);
  assert.match(worker, /primary_region = "yyz"/);
});

test("private deployment rebuilds all three application images from current source", () => {
  const workflow = read(".github/workflows/deploy-private-ross.yml");

  const deployCommands =
    workflow.match(
      /bash scripts\/fly-deploy-with-retry\.sh[\s\S]*?(?=\n\s+- name:|$)/g,
    ) ?? [];
  assert.equal(deployCommands.length, 3);
  for (const command of deployCommands) {
    assert.match(command, /--no-cache/);
  }
});

test("private deployment observes required Ontario sources without storing source text", () => {
  const workflow = read(".github/workflows/deploy-private-ross.yml");
  const observer = read("scripts/lib/live-source-observer.mjs");

  assert.match(workflow, /observe-legal-sources\.mjs/);
  assert.match(workflow, /id: legal-source-observation/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /Report degraded Ontario source coverage/);
  assert.match(workflow, /does not approve missing coverage or permit CanLII website scraping/);
  assert.match(workflow, /deployed-legal-source-health/);
  assert.match(observer, /a2aj-canada/);
  assert.match(observer, /ontario-elaws/);
  assert.match(observer, /justice-laws-canada/);
  assert.doesNotMatch(observer, /writeFile/);
});

test("public deployment keeps Ontario source verification strict", () => {
  const workflow = read(".github/workflows/deploy-public-beta-ross.yml");
  const sourceStep = workflow.match(
    /- name: Verify required Ontario legal sources[\s\S]*?(?=\n\s+- name:|$)/,
  )?.[0] ?? "";

  assert.match(sourceStep, /observe-legal-sources\.mjs/);
  assert.doesNotMatch(sourceStep, /continue-on-error/);
});

test("deployment workflows run the live API and web smoke contract", () => {
  for (const path of [
    ".github/workflows/deploy-private-ross.yml",
    ".github/workflows/deploy-public-beta-ross.yml",
  ]) {
    const workflow = read(path);
    assert.match(workflow, /ROSS_E2E_API_URL/);
    assert.match(workflow, /ROSS_E2E_APP_URL/);
    assert.match(workflow, /npm run test:e2e/);
  }
});

test("private deployment credentials are supplied only through GitHub secrets", () => {
  const workflow = read(".github/workflows/deploy-private-ross.yml");
  for (const name of [
    "FLY_API_TOKEN",
    "ROSS_SUPABASE_URL",
    "ROSS_SUPABASE_PUBLISHABLE_KEY",
    "ROSS_SUPABASE_SECRET_KEY",
    "ROSS_S3_ENDPOINT_URL",
    "ROSS_S3_REGION",
    "ROSS_S3_ACCESS_KEY_ID",
    "ROSS_S3_SECRET_ACCESS_KEY",
    "ROSS_SECURITY_ALERT_WEBHOOK_URL",
    "ROSS_SECURITY_ALERT_WEBHOOK_SECRET",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`), name);
  }
});
