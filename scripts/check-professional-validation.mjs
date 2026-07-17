#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateProfessionalValidation } from "./lib/professional-validation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const production = process.argv.includes("--production");
const result = evaluateProfessionalValidation(
  readJson("config/professional-validation.v1.json"),
  readJson("tests/evaluation/ontario-benchmark.v1.json"),
  readJson("workflows/ontario/catalogue.json"),
  readJson("config/release-approvals.v1.json"),
  production,
);

console.log(`${result.ready ? "PASS" : "BLOCKED"}: ${result.mode} professional-validation gate.`);
for (const warning of result.warnings) console.log(`- PENDING: ${warning}`);
for (const blocker of result.blockers) console.error(`- ${blocker}`);
if (!result.ready) process.exitCode = 1;
