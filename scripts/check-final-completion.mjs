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
const sourceReportFlag = process.argv.indexOf("--source-report");
const sourceReportPath =
  sourceReportFlag >= 0
    ? process.argv[sourceReportFlag + 1]
    : "reports/legal-source-health-v1.json";
if (!sourceReportPath || sourceReportPath.startsWith("--")) {
  console.error(
    "Usage: check-final-completion.mjs [--production] [--source-report <path>]",
  );
  process.exit(2);
}
const plan = readJson("config/final-completion.v1.json");
const professionalRecord = readJson("config/professional-validation.v1.json");
const benchmark = readJson("tests/evaluation/ontario-benchmark.v1.json");
const workflows = readJson("workflows/ontario/catalogue.json");
const approvals = readJson("config/release-approvals.v1.json");
const operations = readJson("config/operations-readiness.v1.json");
const launch = readJson("config/launch-readiness.v1.json");
const sourcePolicy = readJson("config/legal-source-operations.v1.json");
const sourceReport = readJson(sourceReportPath);
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
console.log(`Source report: ${sourceReportPath}`);
if (sourceReport.status) console.log(`Live source observation: ${sourceReport.status}`);
for (const item of result.pending)
  console.log(`- PENDING ${item.id}: ${item.ownerRole}`);
for (const blocker of result.blockers) console.error(`- ${blocker}`);
for (const [label, details] of [
  ["Source operations", sourceOperations.blockers],
  ["Professional validation", professionalValidation.blockers],
  ["Release readiness", releaseReadiness.blockers],
]) {
  for (const detail of details ?? []) console.error(`- ${label}: ${detail}`);
}
if (!result.ready) process.exitCode = 1;
