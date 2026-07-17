#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateReleaseId,
  verifyImmutableTag,
} from "./lib/release-identifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const expected = validateReleaseId(process.env.INPUT_RELEASE_ID);
const records = {
  final: readJson("config/final-completion.v1.json").releaseId,
  professionalValidation: readJson("config/professional-validation.v1.json").releaseId,
  approvals: readJson("config/release-approvals.v1.json").releaseId,
  operations: readJson("config/operations-readiness.v1.json").releaseId,
  launch: readJson("config/launch-readiness.v1.json").releaseId,
  manifest: readJson("config/release-manifest.v1.json").releaseId,
};
for (const [name, value] of Object.entries(records))
  if (value !== expected)
    throw new Error(`${name} release ID does not match workflow input.`);
if (process.env.VERIFY_RELEASE_TAG === "true") {
  const commit = verifyImmutableTag(expected, { cwd: root });
  console.log(`PASS: immutable tag ${expected} points to ${commit}.`);
}
console.log(`PASS: all governed records use release ID ${expected}.`);
