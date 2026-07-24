import { spawn } from "node:child_process";

const workspaces = ["backend", "frontend", "website"];
const npmCli = process.env.npm_execpath;

function audit(workspace) {
  return new Promise((resolve) => {
    const args = [
      ...(npmCli ? [npmCli] : []),
      "audit",
      "--package-lock-only",
      "--audit-level=high",
      "--prefix",
      workspace,
    ];
    const command = npmCli
      ? process.execPath
      : process.platform === "win32"
        ? "npm.cmd"
        : "npm";

    console.log(`\n=== ${workspace} dependency audit ===`);
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      console.error(`${workspace}: audit could not start: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const results = [];
for (const workspace of workspaces) {
  results.push([workspace, await audit(workspace)]);
}

const failures = results.filter(([, code]) => code !== 0);
if (failures.length > 0) {
  console.error(
    `\nHigh-severity dependency audit failed: ${failures
      .map(([workspace]) => workspace)
      .join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log("\nHigh-severity dependency audit passed for all workspaces.");
}
