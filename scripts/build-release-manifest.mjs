#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(resolve(root, "config/release-manifest.v1.json"), "utf8"),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifacts = config.artifacts.map((path) => {
  const bytes = readFileSync(resolve(root, path));
  return { path, sha256: hash(bytes), sizeBytes: bytes.byteLength };
});
const report = {
  version: config.version,
  releaseId: config.releaseId,
  generatedAt: config.generatedAt,
  algorithm: "sha256",
  artifactCount: artifacts.length,
  artifacts,
};
const outputPath = resolve(root, "reports/release-manifest-v1.json");
const output = `${JSON.stringify(report, null, 2)}\n`;

function explainMismatch(recorded) {
  const differences = [];
  for (const field of [
    "version",
    "releaseId",
    "generatedAt",
    "algorithm",
    "artifactCount",
  ]) {
    if (recorded?.[field] !== report[field]) {
      differences.push(
        `HEADER: ${field}: recorded=${JSON.stringify(recorded?.[field])} actual=${JSON.stringify(report[field])}`,
      );
    }
  }

  const recordedArtifacts = new Map(
    Array.isArray(recorded?.artifacts)
      ? recorded.artifacts.map((item) => [item?.path, item])
      : [],
  );
  for (const actual of artifacts) {
    const saved = recordedArtifacts.get(actual.path);
    if (!saved) {
      differences.push(`MISSING: ${actual.path}`);
      continue;
    }
    recordedArtifacts.delete(actual.path);
    if (
      saved.sha256 !== actual.sha256 ||
      saved.sizeBytes !== actual.sizeBytes
    ) {
      differences.push(
        `STALE: ${actual.path}: recorded size=${saved.sizeBytes} sha256=${saved.sha256}; actual size=${actual.sizeBytes} sha256=${actual.sha256}`,
      );
    }
  }
  for (const path of recordedArtifacts.keys()) {
    differences.push(`UNEXPECTED: ${String(path)}`);
  }
  return differences;
}

if (process.argv.includes("--check")) {
  if (!existsSync(outputPath)) {
    console.error(
      "Release manifest is missing. Run npm run build:release-manifest.",
    );
    process.exitCode = 1;
  } else {
    const savedOutput = readFileSync(outputPath, "utf8");
    if (savedOutput === output) {
      console.log(
        `PASS: release manifest covers ${artifacts.length} governed artifacts.`,
      );
    } else {
      console.error(
        "Release manifest is stale. The committed report does not match the exact bytes in this checkout.",
      );
      try {
        const differences = explainMismatch(JSON.parse(savedOutput));
        if (differences.length) {
          for (const difference of differences) console.error(difference);
        } else {
          console.error(
            "FORMAT: manifest data matches, but deterministic JSON formatting or the final newline differs.",
          );
        }
      } catch (error) {
        console.error(
          `PARSE: committed manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      console.error("Run npm run build:release-manifest in this exact checkout.");
      process.exitCode = 1;
    }
  }
} else {
  writeFileSync(outputPath, output);
  console.log(
    `Wrote reports/release-manifest-v1.json with ${artifacts.length} artifacts.`,
  );
}
