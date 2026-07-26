import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const auditScript = resolve(root, "scripts/audit-workspaces.mjs");

const fakeNpmSource = String.raw`
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const prefixIndex = process.argv.indexOf("--prefix");
const workspace = process.argv[prefixIndex + 1];
const statePath = process.env.FAKE_AUDIT_STATE;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : {};
state[workspace] = (state[workspace] ?? 0) + 1;
writeFileSync(statePath, JSON.stringify(state));

const mode = process.env.FAKE_AUDIT_MODE;
if (mode === "persistent-transport") {
  console.error(
    "npm warn audit invalid json response body: gzip bytes are not valid JSON",
  );
  process.exit(1);
}
if (mode === "transient-transport" && state[workspace] === 1) {
  console.error(
    "npm warn audit invalid json response body: gzip bytes are not valid JSON",
  );
  process.exit(1);
}
if (mode === "high-advisory" && workspace === "backend") {
  console.log(
    JSON.stringify({
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 1,
          critical: 0,
          total: 1,
        },
      },
      vulnerabilities: {
        example: {
          severity: "high",
          via: ["GHSA-example"],
        },
      },
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 2,
        moderate: 1,
        high: 0,
        critical: 0,
        total: 3,
      },
    },
    vulnerabilities: {},
  }),
);
`;

function exercise(mode, maxAttempts = 3) {
  const fixture = mkdtempSync(join(tmpdir(), "ross-audit-retry-"));
  const fakeNpm = resolve(fixture, "fake-npm.mjs");
  const statePath = resolve(fixture, "state.json");
  writeFileSync(fakeNpm, fakeNpmSource);

  try {
    const result = spawnSync(process.execPath, [auditScript], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_AUDIT_MODE: mode,
        FAKE_AUDIT_STATE: statePath,
        ROSS_AUDIT_MAX_ATTEMPTS: String(maxAttempts),
        ROSS_AUDIT_RETRY_BASE_MS: "0",
        npm_execpath: fakeNpm,
      },
    });
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    return { result, state };
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
}

test("transient malformed registry responses are retried for every workspace", () => {
  const { result, state } = exercise("transient-transport");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(state, {
    backend: 2,
    frontend: 2,
    website: 2,
  });
  assert.match(result.stderr, /malformed JSON audit response/);
  assert.match(result.stderr, /Retrying dependency audit/);
  assert.match(
    result.stdout,
    /High-severity dependency audit passed for all workspaces/,
  );
});

test("a real high advisory fails immediately without being retried or hidden", () => {
  const { result, state } = exercise("high-advisory");

  assert.equal(result.status, 1);
  assert.deepEqual(state, {
    backend: 1,
    frontend: 1,
    website: 1,
  });
  assert.match(result.stderr, /backend: found 1 high and 0 critical/);
  assert.match(result.stderr, /High-severity dependency advisories found/);
  assert.doesNotMatch(result.stderr, /Retrying dependency audit/);
});

test("a persistent audit outage exhausts retries and fails closed", () => {
  const { result, state } = exercise("persistent-transport");

  assert.equal(result.status, 1);
  assert.deepEqual(state, {
    backend: 3,
    frontend: 3,
    website: 3,
  });
  assert.match(
    result.stderr,
    /Dependency audit remained unavailable after 3 attempts/,
  );
  assert.doesNotMatch(
    result.stdout,
    /High-severity dependency audit passed for all workspaces/,
  );
});
