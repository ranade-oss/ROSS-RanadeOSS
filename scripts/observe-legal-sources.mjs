#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  observedLiveProviderIds,
  optionalLiveProviderIds,
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

let report;
let observerError = null;
try {
  report = await observeLiveLegalSources();
} catch (error) {
  observerError = error;
  const observedAt = new Date().toISOString();
  report = {
    version: "1.1.0",
    observedAt,
    liveChecksPerformed: false,
    status: "degraded",
    requiredProviderIds,
    optionalProviderIds,
    providers: Object.fromEntries(
      [...new Set([...requiredProviderIds, ...optionalProviderIds])].map((id) => [
        id,
        {
          state: "unavailable",
          checkedAt: observedAt,
          lastSuccessfulAt: null,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          sourceVersion: null,
          latencyClass: null,
          reasonCode: "observer-failure",
          attempts: 0,
        },
      ]),
    ),
  };
  console.error(
    `ROSS live legal-source observer failed before completing: ${error?.name ?? "unknown-error"}`,
  );
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`ROSS live legal-source observation: ${report.status.toUpperCase()}`);
for (const id of observedLiveProviderIds) {
  const item = report.providers[id];
  const requirement = requiredLiveProviderIds.includes(id)
    ? "required"
    : optionalLiveProviderIds.includes(id)
      ? "optional"
      : "unclassified";
  console.log(
    `- ${id} [${requirement}]: ${item.state} (${item.reasonCode}, ${item.latencyClass}, attempts=${item.attempts})`,
  );
}
console.log(`Sanitized report: ${output}`);

if (observerError || report.status !== "healthy") process.exitCode = 1;
