import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const workspaces = ["backend", "frontend", "website"];
const maxAttempts = 3;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

for (const workspace of workspaces) {
  let installed = false;
  let lastStatus = 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(
      `Installing ${workspace} dependencies (attempt ${attempt}/${maxAttempts})...`,
    );

    const result = spawnSync(npmCommand, ["ci", "--prefix", workspace], {
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`Failed to start npm for ${workspace}:`, result.error);
    }

    lastStatus = result.status ?? 1;
    if (lastStatus === 0) {
      installed = true;
      break;
    }

    if (attempt < maxAttempts) {
      console.warn(
        `${workspace} dependency installation failed; cleaning node_modules before retry.`,
      );
      rmSync(`${workspace}/node_modules`, {
        force: true,
        maxRetries: 3,
        recursive: true,
        retryDelay: 250,
      });
      await pause(attempt * 2_000);
    }
  }

  if (!installed) {
    console.error(
      `${workspace} dependency installation failed after ${maxAttempts} attempts.`,
    );
    process.exit(lastStatus);
  }
}
