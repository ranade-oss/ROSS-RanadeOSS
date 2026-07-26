import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the frontend Docker dependency stage includes its install-time script", () => {
  const dockerfile = read("deploy/fly/frontend.Dockerfile");
  const packageJson = JSON.parse(read("frontend/package.json"));
  const postinstall = packageJson.scripts.postinstall;

  assert.equal(
    postinstall,
    "node scripts/patch-brace-expansion-compat.mjs",
  );

  const scriptCopy =
    "COPY frontend/scripts/patch-brace-expansion-compat.mjs ./scripts/patch-brace-expansion-compat.mjs";
  const scriptCopyIndex = dockerfile.indexOf(scriptCopy);
  const installIndex = dockerfile.indexOf("RUN npm ci");

  assert.notEqual(scriptCopyIndex, -1);
  assert.notEqual(installIndex, -1);
  assert.ok(
    scriptCopyIndex < installIndex,
    "the postinstall script must be copied before npm ci executes",
  );
});

test("the deployment preflight builds every Fly application path", () => {
  const rootPackage = JSON.parse(read("package.json"));
  const preflight = read("scripts/preflight-fly-images.sh");

  assert.equal(
    rootPackage.scripts["preflight:fly"],
    "bash scripts/preflight-fly-images.sh",
  );
  assert.match(preflight, /--file deploy\/fly\/backend\.Dockerfile/);
  assert.match(preflight, /--file deploy\/fly\/file-worker\.Dockerfile/);
  assert.match(preflight, /--file deploy\/fly\/frontend\.Dockerfile/);
  assert.match(preflight, /NEXT_PUBLIC_SUPABASE_URL=https:\/\/synthetic-build/);
  assert.match(
    preflight,
    /NEXT_PUBLIC_REHEARSAL_API_BASE_URL=https:\/\/rehearsal-api\.example\.invalid/,
  );
  assert.doesNotMatch(preflight, /FLY_API_TOKEN|ROSS_SUPABASE_SECRET_KEY/);
});

test("qualification and rehearsal finish before an immutable tag can be created", () => {
  const workflow = read(
    ".github/workflows/verify-and-deploy-public-beta.yml",
  );
  const fullGateIndex = workflow.indexOf(
    "- name: Run complete engineering gate",
  );
  const preflightIndex = workflow.indexOf(
    "- name: Build every Fly container path",
  );
  const rehearsalIndex = workflow.indexOf(
    "- name: Run non-production promotion and rollback rehearsal",
  );
  const tagIndex = workflow.indexOf(
    "- name: Create immutable tag and GitHub release after public success",
  );

  assert.notEqual(fullGateIndex, -1);
  assert.notEqual(preflightIndex, -1);
  assert.notEqual(rehearsalIndex, -1);
  assert.notEqual(tagIndex, -1);
  assert.ok(fullGateIndex < preflightIndex);
  assert.ok(preflightIndex < rehearsalIndex);
  assert.ok(rehearsalIndex < tagIndex);
  assert.ok(preflightIndex < tagIndex);
  assert.match(workflow.slice(preflightIndex, tagIndex), /npm run preflight:fly/);
  assert.match(workflow.slice(rehearsalIndex, tagIndex), /inputs\.promote_public/);
});
