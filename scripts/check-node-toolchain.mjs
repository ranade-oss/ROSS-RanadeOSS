#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const packageManager = packageJson.packageManager;
const expectedNpm = /^npm@(.+)$/.exec(packageManager ?? "")?.[1];

if (!expectedNpm) {
  throw new Error("package.json must pin packageManager to an exact npm version.");
}

const npmUserAgentVersion = /^npm\/([^\s]+)/.exec(
  process.env.npm_config_user_agent ?? "",
)?.[1];
const actualNpm =
  npmUserAgentVersion ??
  execFileSync("npm", ["--version"], {
    encoding: "utf8",
  }).trim();

if (actualNpm !== expectedNpm) {
  console.error(
    `ROSS requires npm ${expectedNpm}; this process is using npm ${actualNpm}.`,
  );
  console.error(`Run: npm install --global npm@${expectedNpm}`);
  process.exit(1);
}

const [nodeMajor, nodeMinor] = process.versions.node
  .split(".")
  .slice(0, 2)
  .map(Number);
if (
  !Number.isInteger(nodeMajor) ||
  !Number.isInteger(nodeMinor) ||
  nodeMajor < 22 ||
  nodeMajor >= 25 ||
  (nodeMajor === 22 && nodeMinor < 13)
) {
  console.error(
    `ROSS requires Node.js >=22.13.0 <25; this process is using ${process.version}.`,
  );
  process.exit(1);
}

console.log(
  `PASS: ROSS toolchain is Node.js ${process.versions.node} with npm ${actualNpm}.`,
);
