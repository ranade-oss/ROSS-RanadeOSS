import fs from "node:fs";
import {
  markResultRetryable,
  recordEscalatedResult,
  recordLowRiskResult,
} from "./lib/mike-sync.mjs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const [command, firstPath, secondPath, thirdPath] = process.argv.slice(2);
const now = process.env.MIKE_SYNC_NOW || new Date().toISOString();

if (command === "record-low") {
  const state = readJson(thirdPath);
  const window = readJson(firstPath);
  const result = readJson(secondPath);
  writeJson(thirdPath, recordLowRiskResult(state, window, result, now));
} else if (command === "record-escalated") {
  const state = readJson(thirdPath);
  const candidate = readJson(firstPath);
  const result = readJson(secondPath);
  writeJson(thirdPath, recordEscalatedResult(state, candidate, result, now));
} else if (command === "mark-retryable") {
  const result = readJson(firstPath);
  const number = Number(secondPath);
  if (!Number.isInteger(number)) throw new Error("mark-retryable requires an integer PR number.");
  writeJson(firstPath, markResultRetryable(result, number, process.env.MIKE_SYNC_REASON, now));
} else {
  throw new Error(`Unknown Mike synchronization state command: ${command || "(missing)"}`);
}
