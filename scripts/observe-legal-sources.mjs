#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  observeLiveLegalSources,
  requiredLiveProviderIds,
} from "./lib/live-source-observer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? process.argv[outputFlag + 1]
    : "artifacts/legal-source-health-live.json",
);

const report = await observeLiveLegalSources();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`ROSS live legal-source observation: ${report.status.toUpperCase()}`);
for (const id of requiredLiveProviderIds) {
  const item = report.providers[id];
  console.log(`- ${id}: ${item.state} (${item.reasonCode}, ${item.latencyClass})`);
}
console.log(`Sanitized report: ${output}`);

if (report.status !== "healthy") process.exitCode = 1;
