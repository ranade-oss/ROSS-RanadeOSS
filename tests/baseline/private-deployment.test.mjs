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

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /NEXT_PUBLIC_ROSS_SIGNUPS_ENABLED=false/);
  assert.match(workflow, /ROSS_HOSTED_MODE=controlled-beta/);
  assert.match(workflow, /R2_BUCKET_NAME=ross-private-files/);
  assert.match(api, /primary_region = "yyz"/);
  assert.match(frontend, /primary_region = "yyz"/);
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
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`), name);
  }
});

