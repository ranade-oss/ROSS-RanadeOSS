#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const plan = readJson("config/final-completion.v1.json");
const professional = readJson("config/professional-validation.v1.json");
const approvals = readJson("config/release-approvals.v1.json");
const operations = readJson("config/operations-readiness.v1.json");
const launch = readJson("config/launch-readiness.v1.json");
const sourceHealth = readJson("reports/legal-source-health-v1.json");

const rows = plan.workstreams.map(
  (item) => `| ${item.id} | ${item.ownerRole} | ${item.status} | \`${item.sourceOfTruth}\` |`,
);
const listPending = (record) =>
  Object.entries(record)
    .filter(([, value]) => value.status !== "approved")
    .map(([name]) => `- ${name}`);
const output = `# ROSS final completion dossier\n\n` +
  `Generated from governed records. This report is evidence inventory, not approval.\n\n` +
  `- Version: ${plan.version}\n` +
  `- As of: ${plan.asOfDate}\n` +
  `- Release ID: ${plan.releaseId}\n` +
  `- Status: ${plan.status}\n` +
  `- Data boundary: ${plan.target.dataBoundary}\n\n` +
  `## Workstreams\n\n| Workstream | Owner role | Status | Source of truth |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\n` +
  `## Provider decision\n\n` +
  `- Status: ${professional.legalSourceDecision.status}\n` +
  `- Selected provider: ${professional.legalSourceDecision.selectedProvider ?? "not selected"}\n` +
  `- CanLII website automation: prohibited\n` +
  `- Current source-health status: ${sourceHealth.status}\n\n` +
  `## Pending release approvals\n\n${listPending(approvals.approvals).join("\n")}\n\n` +
  `## Pending operational evidence\n\n${listPending(operations.evidence).join("\n")}\n\n` +
  `## Pending launch decisions\n\n${listPending(launch.decisions).join("\n")}\n\n` +
  `## Stop condition\n\nAny pending, failed, stale, contradictory, or release-mismatched item blocks promotion. ` +
  `Confidential use and public indexing require separate approval and are not authorized by this dossier.\n`;
const path = resolve(root, "reports/final-completion-dossier.md");

if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output)
    throw new Error("Final completion dossier is stale. Run npm run build:completion-dossier.");
  console.log(`PASS: final completion dossier tracks ${plan.workstreams.length} workstreams.`);
} else {
  writeFileSync(path, output);
  console.log(`Wrote reports/final-completion-dossier.md with ${plan.workstreams.length} workstreams.`);
}
