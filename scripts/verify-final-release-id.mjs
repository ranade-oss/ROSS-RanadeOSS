#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const expected = process.env.INPUT_RELEASE_ID?.trim();
if (!expected) throw new Error("INPUT_RELEASE_ID is required.");
const records = {
  final: readJson("config/final-completion.v1.json").releaseId,
  approvals: readJson("config/release-approvals.v1.json").releaseId,
  operations: readJson("config/operations-readiness.v1.json").releaseId,
  launch: readJson("config/launch-readiness.v1.json").releaseId,
  manifest: readJson("config/release-manifest.v1.json").releaseId,
};
for (const [name, value] of Object.entries(records))
  if (value !== expected)
    throw new Error(`${name} release ID does not match workflow input.`);
console.log(`PASS: all governed records use release ID ${expected}.`);
