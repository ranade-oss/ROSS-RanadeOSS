import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("CI pins an npm version that uses the supported bulk advisory endpoint", () => {
  const packageJson = JSON.parse(read("package.json"));
  const setupAction = read(".github/actions/setup-ross-node/action.yml");
  const toolchainCheck = read("scripts/check-node-toolchain.mjs");

  assert.equal(packageJson.packageManager, "npm@11.9.0");
  assert.equal(packageJson.engines.npm, "11.9.0");
  assert.match(packageJson.scripts.check, /^npm run toolchain:check && /);
  assert.match(setupAction, /uses: actions\/setup-node@v7/);
  assert.match(setupAction, /node-version: 22\.13\.0/);
  assert.match(setupAction, /npm install --global npm@11\.9\.0/);
  assert.match(setupAction, /node scripts\/check-node-toolchain\.mjs/);
  assert.match(toolchainCheck, /npm_config_user_agent/);
  assert.match(toolchainCheck, /actualNpm !== expectedNpm/);
});

test("every complete engineering workflow uses the shared pinned toolchain", () => {
 for (const path of [
   ".github/workflows/baseline.yml",
   ".github/workflows/refresh-release-manifest.yml",
   ".github/workflows/verify-and-deploy-public-beta.yml",
 ]) {
    const workflow = read(path);
    assert.match(workflow, /uses: \.\/\.github\/actions\/setup-ross-node/);
    assert.doesNotMatch(workflow, /uses: actions\/setup-node/);
  }
});

test("workflows use the current Node 24-based official GitHub actions", () => {
  for (const filename of readdirSync(resolve(root, ".github/workflows"))) {
    if (!filename.endsWith(".yml")) continue;
    const workflow = read(`.github/workflows/${filename}`);
    assert.doesNotMatch(workflow, /actions\/checkout@v4/);
    assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
    assert.doesNotMatch(
      workflow,
      /actions\/(?:upload|download)-artifact@v4/,
    );
  }
});

test("the release train uses current artifact actions and pins Fly setup", () => {
  const deployment = read(
    ".github/workflows/verify-and-deploy-public-beta.yml",
  );

  assert.match(deployment, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(
    deployment,
    /actions\/(?:upload|download)-artifact@v4/,
  );
  assert.match(
    deployment,
    /superfly\/flyctl-actions\/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1/,
  );
  assert.doesNotMatch(deployment, /setup-flyctl@master/);
});

test("baseline CI partitions the complete gate while release deploys run it serially", () => {
  const baseline = read(".github/workflows/baseline.yml");
  const deployment = read(
    ".github/workflows/verify-and-deploy-public-beta.yml",
  );

  for (const job of ["workflows", "backend", "frontend", "website", "governance"]) {
    assert.match(baseline, new RegExp(`^  ${job}:`, "m"));
  }
  assert.match(baseline, /^  verify:/m);
  assert.match(
    baseline,
    /needs: \[workflows, backend, frontend, website, governance\]/,
  );
  assert.match(baseline, /npm run test:baseline/);
  assert.match(baseline, /npm run audit:high/);
  assert.match(baseline, /npm run build:frontend/);
  assert.match(baseline, /npm run build:website/);

  assert.match(deployment, /name: Run complete engineering gate/);
  assert.match(deployment, /run: npm run check/);
  assert.doesNotMatch(
    deployment,
    /name: Run repository and full-catalogue tests/,
  );
});
