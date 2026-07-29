import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the shared installer activates the repository-pinned npm toolchain safely", () => {
  const packageJson = JSON.parse(read("package.json"));
  const installer = read("scripts/install-all.mjs");

  assert.match(packageJson.packageManager, /^npm@\d+\.\d+\.\d+$/);
  assert.match(installer, /rootPackage\.packageManager/);
  assert.match(installer, /"install",\s*"--global"/);
  assert.match(installer, /`npm@\$\{expectedNpm\}`/);
  assert.match(installer, /readNpmVersion\(\)/);
  assert.match(installer, /process\.env\.GITHUB_ACTIONS === "true"/);
  assert.match(installer, /"sudo",\s*\["-n", npmCommand/);
  assert.match(installer, /EACCES\|permission denied/);
  assert.match(installer, /attempt < maxAttempts/);
  assert.match(installer, /npmVersion !== expectedNpm/);
});
