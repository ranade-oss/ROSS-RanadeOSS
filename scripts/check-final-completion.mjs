#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFinalCompletion } from "./lib/final-completion.mjs";
import { evaluateProfessionalValidation } from "./lib/professional-validation.mjs";
import { evaluateReleaseReadiness } from "./lib/release-readiness.mjs";
import { evaluateSourceOperations } from "./lib/source-operations.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const production = process.argv.includes("--production");
const plan = readJson("config/final-completion.v1.json");
const professionalRecord = readJson("config/professional-validation.v1.json");
const benchmark = readJson("tests/evaluation/ontario-benchmark.v1.json");
const workflows = readJson("workflows/ontario/catalogue.json");
const approvals = readJson("config/release-approvals.v1.json");
const operations = readJson("config/operations-readiness.v1.json");
const launch = readJson("config/launch-readiness.v1.json");
const sourcePolicy = readJson("config/legal-source-operations.v1.json");
const sourceReport = readJson("reports/legal-source-health-v1.json");
const manifestConfig = readJson("config/release-manifest.v1.json");

const sourceOperations = evaluateSourceOperations(sourcePolicy, sourceReport);
const professionalValidation = evaluateProfessionalValidation(
  professionalRecord,
  benchmark,
  workflows,
  approvals,
  production,
);
const releaseReadiness = evaluateReleaseReadiness(
  readJson("reports/ontario-evaluation-v1.json"),
  approvals,
  production,
  { operations, launch, sourceOperations, professionalValidation },
);
const result = evaluateFinalCompletion(
  plan,
  professionalValidation,
  sourceOperations,
  releaseReadiness,
  {
    approvals: approvals.releaseId,
    operations: operations.releaseId,
    launch: launch.releaseId,
    manifest: manifestConfig.releaseId,
  },
  production,
);

console.log(`${result.ready ? "PASS" : "BLOCKED"}: ${result.mode} final-completion gate.`);
for (const item of result.pending)
  console.log(`- PENDING ${item.id}: ${item.ownerRole}`);
for (const blocker of result.blockers) console.error(`- ${blocker}`);
if (!result.ready) process.exitCode = 1;
