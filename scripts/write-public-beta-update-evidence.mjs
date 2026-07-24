#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputIndex = process.argv.indexOf("--output");
const phaseIndex = process.argv.indexOf("--phase");
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : "artifacts/public-beta-update-evidence.json",
);
const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : "verified";
const previous = existsSync(outputPath)
  ? JSON.parse(readFileSync(outputPath, "utf8"))
  : {};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const releaseId = process.env.ROSS_RELEASE_ID ?? "unconfigured";
const commit = process.env.GITHUB_SHA ?? git("rev-parse", "HEAD");
const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
const changedFiles = git(
  "diff",
  "--name-only",
  "ross-public-beta-20260717-rc1..HEAD",
)
  .split("\n")
  .filter(Boolean);

const evidence = {
  ...previous,
  version: 1,
  releaseId,
  baselineReleaseId: "ross-public-beta-20260717-rc1",
  commit,
  runUrl,
  actor: process.env.GITHUB_ACTOR ?? null,
  phase,
  changeScope: [
    "Complete live A2AJ catalogue discovery and validation",
    "All-jurisdiction A2AJ search and filtering",
    "A2AJ pagination and deduplication",
    "A2AJ dataset metadata and coverage warnings",
    "Full-catalogue integration tests",
    "Per-user CanLII REST metadata, citation, and citator operations",
    "Corrected HTTP signup verification",
    "Consolidated verify-and-deploy workflow",
  ],
  expresslyExcludedPrivateRossDefects: [
    "OpenAI API-key saving",
    "projects loading",
    "connectors-page loading",
    "model availability refresh",
    "research-check UI state",
  ],
  changedFiles,
  verifiedAt:
    previous.verifiedAt ??
    (phase === "verified" ? new Date().toISOString() : null),
  deployedAt:
    phase === "deployed"
      ? new Date().toISOString()
      : (previous.deployedAt ?? null),
  deployment:
    phase === "deployed"
      ? {
          apiUrl: process.env.ROSS_DEPLOYED_API_URL ?? null,
          appUrl: process.env.ROSS_DEPLOYED_APP_URL ?? null,
          signupVerification: "HTTP success plus deployed E2E rendering",
        }
      : (previous.deployment ?? null),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Wrote ${phase} evidence for ${releaseId}.`);
