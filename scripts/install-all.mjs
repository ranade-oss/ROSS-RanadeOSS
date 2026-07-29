import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const workspaces = ["backend", "frontend", "website"];
const maxAttempts = 3;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const rootPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const expectedNpm = /^npm@(.+)$/.exec(rootPackage.packageManager ?? "")?.[1];

if (!expectedNpm) {
  throw new Error("package.json must pin packageManager to an exact npm version.");
}

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const readNpmVersion = () => {
  const result = spawnSync(npmCommand, ["--version"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
};

const printResultOutput = (result) => {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};

const runBootstrap = async (command, args, label) => {
  let lastResult;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`${label} (attempt ${attempt}/${maxAttempts})...`);
    const result = spawnSync(command, args, {
      encoding: "utf8",
      env: process.env,
    });
    lastResult = result;

    if (!result.error && result.status === 0) {
      printResultOutput(result);
      return result;
    }

    const diagnostic = `${result.error?.message ?? ""}\n${result.stderr ?? ""}`;
    if (/EACCES|permission denied/i.test(diagnostic)) {
      return result;
    }

    if (attempt < maxAttempts) {
      console.warn(`${label} failed transiently; retrying after bounded backoff.`);
      await pause(attempt * 2_000);
    }
  }

  return lastResult;
};

let npmVersion = readNpmVersion();
if (npmVersion !== expectedNpm) {
  const bootstrapArgs = [
    "install",
    "--global",
    `npm@${expectedNpm}`,
    "--no-audit",
    "--no-fund",
  ];
  let bootstrap = await runBootstrap(
    npmCommand,
    bootstrapArgs,
    `Installing repository-pinned npm ${expectedNpm}`,
  );

  if (
    (bootstrap?.status ?? 1) !== 0 &&
    process.env.GITHUB_ACTIONS === "true" &&
    process.platform !== "win32"
  ) {
    console.warn(
      "Direct npm activation was not permitted; retrying with the hosted-runner noninteractive privilege boundary.",
    );
    bootstrap = await runBootstrap(
      "sudo",
      ["-n", npmCommand, ...bootstrapArgs],
      `Installing repository-pinned npm ${expectedNpm} with hosted-runner privileges`,
    );
  }

  if (bootstrap?.error || (bootstrap?.status ?? 1) !== 0) {
    printResultOutput(bootstrap ?? {});
    console.error(`Unable to activate repository-pinned npm ${expectedNpm}.`);
    process.exit(bootstrap?.status ?? 1);
  }

  npmVersion = readNpmVersion();
}

if (npmVersion !== expectedNpm) {
  console.error(
    `npm toolchain bootstrap did not activate ${expectedNpm}; found ${npmVersion ?? "unavailable"}.`,
  );
  process.exit(1);
}

console.log(`Using repository-pinned npm ${npmVersion}.`);

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
