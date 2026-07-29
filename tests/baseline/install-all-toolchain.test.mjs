import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

test(
  "a clean GitHub runner recovers from a permission-denied npm bootstrap",
  { skip: process.platform === "win32" },
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ross-install-bootstrap-"));
    try {
      const bin = join(sandbox, "bin");
      const scripts = join(sandbox, "scripts");
      const state = join(sandbox, "pinned-npm-active");
      mkdirSync(bin);
      mkdirSync(scripts);
      for (const workspace of ["backend", "frontend", "website"]) {
        mkdirSync(join(sandbox, workspace));
      }

      writeFileSync(
        join(sandbox, "package.json"),
        JSON.stringify({ type: "module", packageManager: "npm@11.9.0" }),
      );
      cpSync(resolve(root, "scripts/install-all.mjs"), join(scripts, "install-all.mjs"));

      const fakeNpm = `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  if [ -f "$FAKE_NPM_STATE" ]; then echo "11.9.0"; else echo "10.9.8"; fi
  exit 0
fi
if [ "\${1:-}" = "install" ]; then
  echo "npm error EACCES: permission denied" >&2
  exit 243
fi
if [ "\${1:-}" = "ci" ]; then
  test -f "$FAKE_NPM_STATE"
  exit 0
fi
exit 0
`;
      const fakeSudo = `#!/usr/bin/env bash
set -euo pipefail
touch "$FAKE_NPM_STATE"
exit 0
`;
      writeFileSync(join(bin, "npm"), fakeNpm);
      writeFileSync(join(bin, "sudo"), fakeSudo);
      chmodSync(join(bin, "npm"), 0o755);
      chmodSync(join(bin, "sudo"), 0o755);

      const result = spawnSync(process.execPath, ["scripts/install-all.mjs"], {
        cwd: sandbox,
        encoding: "utf8",
        env: {
          ...process.env,
          FAKE_NPM_STATE: state,
          GITHUB_ACTIONS: "true",
          PATH: `${bin}:${process.env.PATH}`,
        },
      });

      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /noninteractive privilege boundary/);
      assert.match(result.stdout, /Using repository-pinned npm 11\.9\.0/);
      assert.match(result.stdout, /Installing backend dependencies/);
      assert.match(result.stdout, /Installing frontend dependencies/);
      assert.match(result.stdout, /Installing website dependencies/);
    } finally {
      rmSync(sandbox, { force: true, recursive: true });
    }
  },
);
