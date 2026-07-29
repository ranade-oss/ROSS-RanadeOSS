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

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

const runGit = (cwd, args) => {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
};

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

      const result = run(process.execPath, ["scripts/install-all.mjs"], {
        cwd: sandbox,
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

test(
  "staged CI adaptations prepare and stage deterministic generated artifacts",
  { skip: process.platform === "win32" },
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), "ross-generated-artifacts-"));
    try {
      const bin = join(sandbox, "bin");
      const scripts = join(sandbox, "scripts");
      mkdirSync(bin);
      mkdirSync(scripts);
      mkdirSync(join(sandbox, "backend", "src", "lib"), { recursive: true });
      mkdirSync(join(sandbox, "backend", "src", "routes"), { recursive: true });
      mkdirSync(join(sandbox, "frontend"), { recursive: true });
      mkdirSync(join(sandbox, "website", "app"), { recursive: true });
      mkdirSync(join(sandbox, "reports"), { recursive: true });

      writeFileSync(
        join(sandbox, "package.json"),
        JSON.stringify({ type: "module", packageManager: "npm@11.9.0" }),
      );
      cpSync(resolve(root, "scripts/install-all.mjs"), join(scripts, "install-all.mjs"));

      const generated = {
        "website/app/generated-public-coverage.ts": "public coverage\n",
        "website/app/generated-brand-config.ts": "brand config\n",
        "backend/src/lib/rossSystemWorkflows.ts": "system workflows\n",
        "website/app/generated-ontario-workflows.ts": "ontario workflows\n",
        "reports/final-completion-dossier.md": "completion dossier\n",
        "reports/release-manifest-v1.json": "release manifest\n",
      };
      for (const path of Object.keys(generated)) {
        writeFileSync(join(sandbox, path), "old generated content\n");
      }
      writeFileSync(join(sandbox, "backend/src/routes/projects.ts"), "old route\n");

      writeFileSync(
        join(scripts, "build-public-content.mjs"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync("website/app/generated-public-coverage.ts", "public coverage\\n");\nwriteFileSync("website/app/generated-brand-config.ts", "brand config\\n");\n`,
      );
      writeFileSync(
        join(scripts, "build-ross-workflows.mjs"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync("backend/src/lib/rossSystemWorkflows.ts", "system workflows\\n");\nwriteFileSync("website/app/generated-ontario-workflows.ts", "ontario workflows\\n");\n`,
      );
      writeFileSync(
        join(scripts, "build-completion-dossier.mjs"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync("reports/final-completion-dossier.md", "completion dossier\\n");\n`,
      );
      writeFileSync(
        join(scripts, "build-release-manifest.mjs"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync("reports/release-manifest-v1.json", "release manifest\\n");\n`,
      );

      const fakeNpm = `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then echo "11.9.0"; exit 0; fi
if [ "\${1:-}" = "ci" ]; then exit 0; fi
exit 0
`;
      writeFileSync(join(bin, "npm"), fakeNpm);
      chmodSync(join(bin, "npm"), 0o755);

      runGit(sandbox, ["init"]);
      runGit(sandbox, ["config", "user.name", "ROSS Test"]);
      runGit(sandbox, ["config", "user.email", "ross-test@example.invalid"]);
      runGit(sandbox, ["add", "."]);
      runGit(sandbox, ["commit", "-m", "Initial fixture"]);
      writeFileSync(join(sandbox, "backend/src/routes/projects.ts"), "owner-only route\n");
      runGit(sandbox, ["add", "backend/src/routes/projects.ts"]);

      const result = run(process.execPath, ["scripts/install-all.mjs"], {
        cwd: sandbox,
        env: {
          ...process.env,
          GITHUB_ACTIONS: "true",
          PATH: `${bin}:${process.env.PATH}`,
        },
      });

      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /Preparing deterministic generated artifacts/);
      assert.match(result.stdout, /Prepared and staged 6 deterministic generated outputs/);

      const staged = new Set(
        runGit(sandbox, ["diff", "--cached", "--name-only"]).split("\n"),
      );
      assert.ok(staged.has("backend/src/routes/projects.ts"));
      for (const [path, expected] of Object.entries(generated)) {
        assert.ok(staged.has(path), `${path} was not staged`);
        assert.equal(readFileSync(join(sandbox, path), "utf8"), expected);
      }
      assert.equal(runGit(sandbox, ["diff", "--name-only"]), "");
    } finally {
      rmSync(sandbox, { force: true, recursive: true });
    }
  },
);
